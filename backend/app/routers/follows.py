"""المتابعة: علاقة اجتماعية أحادية الاتجاه لا تحتاج قبولاً.

صف واحد لكل علاقة في جدول ``follows`` (قيد فريد ``uq_follow``)، لذا متابعة
العضو نفسه مرتين لا تُنشئ صفًا ثانيًا، والعدّاد (متابعون/يتابع) يُشتق دائمًا من
الجدول — لا عمود مخزَّن قد يختلف عن الحقيقة.
"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import Block, Follow, User
from ..notifications import create_notification
from ..realtime import hub
from ..security import get_current_user
from ..serializers import user_public

router = APIRouter(prefix="/api/follows", tags=["follows"])

MAX_LIST = 100


def follow_counts(db: Session, user_id: int) -> dict[str, int]:
    followers = int(
        db.execute(select(func.count(Follow.id)).where(Follow.followed_user_id == user_id)).scalar() or 0
    )
    following = int(db.execute(select(func.count(Follow.id)).where(Follow.user_id == user_id)).scalar() or 0)
    return {"followers": followers, "following": following}


def _hidden_ids(db: Session, user_id: int) -> set[int]:
    """من حظرته أو حظرني: لا يظهر في قوائم المتابعة (الحظر يُطبَّق في الاتجاهين)."""
    hidden = set(db.execute(select(Block.blocked_user_id).where(Block.user_id == user_id)).scalars().all())
    hidden.update(db.execute(select(Block.user_id).where(Block.blocked_user_id == user_id)).scalars().all())
    return hidden


def _public_users(db: Session, ids: list[int], viewer_id: int) -> list[dict]:
    hidden = _hidden_ids(db, viewer_id)
    users = []
    for user_id in ids:
        if user_id in hidden:
            continue
        row = db.get(User, user_id)
        if row is None or row.status != "active":
            continue
        users.append(user_public(row, online_override=hub.is_online(row.id) or bool(row.online)))
    return users


def _require_member(db: Session, user_id: int) -> User:
    row = db.get(User, user_id)
    if row is None or row.status == "deleted":
        raise HTTPException(status.HTTP_404_NOT_FOUND, "المستخدم غير موجود")
    return row


@router.get("/summary")
def summary(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """عدّاد الملف الشخصي: من يتابعني ومن أتابع."""
    return follow_counts(db, user.id)


@router.get("/{user_id}/followers")
def list_followers(user_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    _require_member(db, user_id)
    ids = list(
        db.execute(
            select(Follow.user_id)
            .where(Follow.followed_user_id == user_id)
            .order_by(Follow.id.desc())
            .limit(MAX_LIST)
        )
        .scalars()
        .all()
    )
    return {"users": _public_users(db, ids, user.id), "counts": follow_counts(db, user_id)}


@router.get("/{user_id}/following")
def list_following(user_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    _require_member(db, user_id)
    ids = list(
        db.execute(
            select(Follow.followed_user_id)
            .where(Follow.user_id == user_id)
            .order_by(Follow.id.desc())
            .limit(MAX_LIST)
        )
        .scalars()
        .all()
    )
    return {"users": _public_users(db, ids, user.id), "counts": follow_counts(db, user_id)}


@router.post("/{user_id}")
def follow(user_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if user_id == user.id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "لا يمكن متابعة نفسك")
    _require_member(db, user_id)
    if user_id in _hidden_ids(db, user.id):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "الحظر يمنع المتابعة")
    existing = db.execute(
        select(Follow).where(Follow.user_id == user.id, Follow.followed_user_id == user_id)
    ).scalar_one_or_none()
    created = existing is None
    if created:
        db.add(Follow(user_id=user.id, followed_user_id=user_id))
        create_notification(
            db,
            user_id,
            "follow",
            "متابع جديد",
            f"بدأ {user.display_name or user.username} بمتابعتك",
            {"type": "follow", "user_id": user.id, "username": user.username},
        )
        db.commit()
    return {"following": True, "created": created, "summary": follow_counts(db, user.id)}


@router.delete("/{user_id}")
def unfollow(user_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    row = db.execute(
        select(Follow).where(Follow.user_id == user.id, Follow.followed_user_id == user_id)
    ).scalar_one_or_none()
    if row is not None:
        db.delete(row)
        db.commit()
    return {"following": False, "changed": row is not None, "summary": follow_counts(db, user.id)}
