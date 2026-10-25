"""Profiles, avatar upload and user search."""
import os
import uuid
from typing import Optional

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from pydantic import BaseModel
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from ..config import settings
from ..db import get_db
from ..models import Block, Follow, Friendship, Room, RoomMember, User
from ..security import get_current_user, hash_password, verify_password
from ..serializers import user_private, user_public
from .auth import auth_payload
from .follows import follow_counts

router = APIRouter(prefix="/api/users", tags=["users"])

ALLOWED_AVATAR_TYPES = {"image/png": ".png", "image/jpeg": ".jpg", "image/webp": ".webp"}


class ProfileIn(BaseModel):
    display_name: Optional[str] = None
    bio: Optional[str] = None
    country: Optional[str] = None
    locale: Optional[str] = None
    gender: Optional[str] = None


class PrivacyIn(BaseModel):
    show_online: Optional[bool] = None
    allow_room_invites: Optional[bool] = None
    allow_gifts: Optional[bool] = None


class VoicePrefsIn(BaseModel):
    mic_auto_on: Optional[bool] = None
    speaker_volume: Optional[int] = None
    noise_suppression: Optional[bool] = None
    voice_effect: Optional[str] = None


class PasswordIn(BaseModel):
    current_password: str
    new_password: str


@router.get("/me")
def me(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return {"user": user_private(user), "friends": friend_count(db, user.id)}


def friend_count(db: Session, user_id: int) -> int:
    return int(db.execute(select(func.count(Friendship.id)).where(Friendship.user_id == user_id)).scalar() or 0)


@router.patch("/me")
def update_profile(
    payload: ProfileIn,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if payload.display_name is not None:
        name = payload.display_name.strip()
        if not name:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "الاسم لا يمكن أن يكون فارغاً")
        user.display_name = name[:64]
    if payload.bio is not None:
        user.bio = payload.bio.strip()[:400]
    if payload.country is not None:
        user.country = payload.country.strip().upper()[:2]
    if payload.locale is not None and payload.locale in {"ar", "en"}:
        user.locale = payload.locale
    if payload.gender is not None:
        user.gender = payload.gender.strip()[:16]
    db.commit()
    db.refresh(user)
    return {"user": user_private(user)}


@router.post("/me/avatar")
async def upload_avatar(
    file: UploadFile = File(...),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    extension = ALLOWED_AVATAR_TYPES.get(file.content_type or "")
    if extension is None:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "الصيغة غير مدعومة (PNG أو JPEG أو WEBP)")
    payload = await file.read()
    if len(payload) > settings.max_upload_mb * 1024 * 1024:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"حجم الصورة أكبر من {settings.max_upload_mb} ميجابايت")

    folder = os.path.join(settings.media_dir, "avatars")
    os.makedirs(folder, exist_ok=True)
    filename = f"{user.id}-{uuid.uuid4().hex}{extension}"
    with open(os.path.join(folder, filename), "wb") as handle:
        handle.write(payload)

    user.avatar_url = f"/media/avatars/{filename}"
    db.commit()
    db.refresh(user)
    return {"user": user_private(user)}


@router.patch("/me/password")
def change_password(
    payload: PasswordIn,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not verify_password(payload.current_password, user.password_hash):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "كلمة المرور الحالية غير صحيحة")
    if len(payload.new_password) < 6:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "كلمة المرور الجديدة قصيرة جداً")
    user.password_hash = hash_password(payload.new_password)
    db.commit()
    return {"status": "password_updated"}


@router.patch("/me/privacy")
def update_privacy(
    payload: PrivacyIn,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    privacy = dict(user.privacy or {})
    for key, value in payload.model_dump(exclude_none=True).items():
        privacy[key] = value
    user.privacy = privacy
    db.commit()
    return {"privacy": user.privacy}


@router.patch("/me/voice")
def update_voice(
    payload: VoicePrefsIn,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    prefs = dict(user.voice_prefs or {})
    for key, value in payload.model_dump(exclude_none=True).items():
        prefs[key] = value
    user.voice_prefs = prefs
    db.commit()
    return {"voice_prefs": user.voice_prefs}


@router.get("/search")
def search_users(
    q: str = Query(min_length=1, max_length=32),
    limit: int = Query(default=20, ge=1, le=50),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    needle = q.strip()
    pattern = f"%{needle}%"
    # البحث يقبل الاسم أو اسم المستخدم، ورقم المستخدم أيضًا (الأرقام فقط).
    matcher = or_(User.username.ilike(pattern), User.display_name.ilike(pattern))
    if needle.isdigit():
        matcher = or_(matcher, User.id == int(needle))
    blocked_ids = set(
        db.execute(
            select(Block.blocked_user_id).where(Block.user_id == user.id)
        ).scalars().all()
    )
    blocked_ids.update(
        db.execute(select(Block.user_id).where(Block.blocked_user_id == user.id)).scalars().all()
    )
    statement = (
        select(User)
        .where(
            User.status == "active",
            User.id != user.id,
            matcher,
        )
        .order_by(User.username)
        .limit(limit)
    )
    found = [candidate for candidate in db.execute(statement).scalars().all() if candidate.id not in blocked_ids]
    # حالة المتابعة تُحسب هنا بجملة واحدة (لا استعلام لكل نتيجة) لتظهر حالة الزر صحيحة.
    followed_ids = set(
        db.execute(select(Follow.followed_user_id).where(Follow.user_id == user.id)).scalars().all()
    )
    users = []
    for candidate in found:
        payload = user_public(candidate)
        payload["following"] = candidate.id in followed_ids
        users.append(payload)
    return {"users": users}


@router.get("/{user_id}")
def get_user(user_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    target = db.get(User, user_id)
    if target is None or target.status == "deleted":
        raise HTTPException(status.HTTP_404_NOT_FOUND, "المستخدم غير موجود")
    payload = user_public(target)
    counts = follow_counts(db, target.id)
    payload["following"] = bool(
        db.execute(
            select(Follow.id).where(Follow.user_id == user.id, Follow.followed_user_id == target.id)
        ).first()
    )
    payload["stats"] = {
        "friends": friend_count(db, target.id),
        "followers": counts["followers"],
        "following": counts["following"],
        "rooms_created": int(
            db.execute(select(func.count(Room.id)).where(Room.owner_id == target.id)).scalar() or 0
        ),
        "rooms_joined": int(
            db.execute(select(func.count(RoomMember.id)).where(RoomMember.user_id == target.id)).scalar() or 0
        ),
    }
    payload["mutual"] = bool(
        db.execute(
            select(Friendship.id).where(Friendship.user_id == user.id, Friendship.friend_id == target.id)
        ).first()
    )
    return payload
