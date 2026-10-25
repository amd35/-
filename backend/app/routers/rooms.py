"""Voice rooms: creation (one per user), direct joining, 12 seats, mics, bans."""
import datetime as dt
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy import func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import Report, Room, RoomBan, RoomLike, RoomMember, RoomMessage, User, utcnow
from ..notifications import create_notification
from ..realtime import hub
from ..room_service import (
    BAN_DURATIONS,
    ROOM_SEATS,
    active_ban,
    ban_user,
    is_room_admin,
    like_count,
    member_count,
    membership,
    purge_expired_bans,
    rank,
    require_ban_permission,
    require_member,
    require_room,
    require_role,
    room_state,
)
from ..security import get_current_user, hash_password, verify_password
from ..serializers import message_public, room_public, user_public

router = APIRouter(prefix="/api/rooms", tags=["rooms"])

BACKGROUNDS = ["sunset", "night", "desert", "sea", "royal", "aurora"]
ROOM_ROLES = {"moderator", "assistant", "member"}


class RoomIn(BaseModel):
    name: str = Field(min_length=2, max_length=64)
    description: str = ""
    image_url: str = ""
    background: str = "sunset"
    is_private: bool = False
    password: Optional[str] = Field(default=None, max_length=64)
    rules: str = ""
    gifts_enabled: bool = True
    chat_enabled: bool = True
    mic_settings: dict = {}


class RoomPatch(BaseModel):
    name: Optional[str] = Field(default=None, min_length=2, max_length=64)
    description: Optional[str] = None
    image_url: Optional[str] = None
    background: Optional[str] = None
    is_private: Optional[bool] = None
    password: Optional[str] = Field(default=None, max_length=64)
    clear_password: bool = False
    rules: Optional[str] = None
    gifts_enabled: Optional[bool] = None
    chat_enabled: Optional[bool] = None
    mic_settings: Optional[dict] = None
    status: Optional[str] = None


class JoinIn(BaseModel):
    password: Optional[str] = None


class BoolIn(BaseModel):
    value: bool


class RoleIn(BaseModel):
    role: str


class PermissionIn(BaseModel):
    can_ban: bool


class OwnerIn(BaseModel):
    user_id: int


class MessageIn(BaseModel):
    text: str = Field(min_length=1, max_length=1000)


class InviteIn(BaseModel):
    user_id: int


class ReportIn(BaseModel):
    reason: str = Field(min_length=2, max_length=64)
    details: str = ""


class BanIn(BaseModel):
    duration: str = Field(default="2h")
    reason: str = Field(default="", max_length=200)


def _broadcast(db: Session, room: Room, viewer: Optional[User] = None) -> dict:
    state = room_state(db, room, viewer)
    hub.notify_room(room.id, {"type": "room_state", "room": state})
    return state


def _owned_open_room(db: Session, user_id: int) -> Optional[Room]:
    return db.execute(
        select(Room).where(Room.owner_id == user_id, Room.status == "open")
    ).scalar_one_or_none()


def _my_room_id(db: Session, user_id: int) -> Optional[int]:
    room = _owned_open_room(db, user_id)
    return room.id if room is not None else None


@router.get("")
def list_rooms(
    query: Optional[str] = None,
    mine: bool = False,
    limit: int = Query(default=30, ge=1, le=100),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    statement = select(Room).where(Room.status == "open")
    if query:
        pattern = f"%{query.strip()}%"
        statement = statement.where(or_(Room.name.ilike(pattern), Room.description.ilike(pattern)))
    if mine:
        joined = select(RoomMember.room_id).where(RoomMember.user_id == user.id)
        statement = statement.where(or_(Room.owner_id == user.id, Room.id.in_(joined)))
    rooms = db.execute(statement.order_by(Room.id.desc()).limit(limit)).scalars().all()
    payload = []
    for room in rooms:
        owner = db.get(User, room.owner_id)
        payload.append(
            room_public(
                room,
                owner,
                member_count(db, room.id),
                like_count(db, room.id),
                bool(
                    db.execute(
                        select(RoomLike.id).where(RoomLike.room_id == room.id, RoomLike.user_id == user.id)
                    ).first()
                ),
            )
        )
    return {
        "rooms": payload,
        # غرفة المستخدم الواحدة: الواجهة تخفي زر الإنشاء عندما تكون موجودة.
        "my_room_id": _my_room_id(db, user.id),
    }


@router.post("", status_code=status.HTTP_201_CREATED)
def create_room(payload: RoomIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """غرفة واحدة فقط لكل مستخدم — والمنع مطبّق أيضاً بفهرس فريد في قاعدة البيانات."""
    existing = _owned_open_room(db, user.id)
    if existing is not None:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            f"لديك غرفة بالفعل ({existing.name}) — احذفها أولاً لإنشاء غرفة أخرى",
        )
    background = payload.background if payload.background in BACKGROUNDS else "sunset"
    room = Room(
        name=payload.name.strip(),
        description=payload.description.strip()[:500],
        image_url=payload.image_url.strip()[:512],
        background=background,
        rules=payload.rules.strip()[:2000],
        seat_count=ROOM_SEATS,
        is_private=payload.is_private,
        password_hash=hash_password(payload.password) if payload.is_private and payload.password else None,
        gifts_enabled=payload.gifts_enabled,
        chat_enabled=payload.chat_enabled,
        mic_settings=payload.mic_settings or {},
        locked_seats=[],
        owner_id=user.id,
    )
    db.add(room)
    try:
        db.flush()
    except IntegrityError as exc:  # القيد الفريد على قاعدة البيانات (غرفة واحدة لكل مستخدم)
        db.rollback()
        raise HTTPException(status.HTTP_409_CONFLICT, "لديك غرفة بالفعل") from exc
    db.add(RoomMember(room_id=room.id, user_id=user.id, role="owner", seat_index=0, mic_on=False))
    db.add(
        RoomMessage(
            room_id=room.id,
            user_id=user.id,
            kind="system",
            text=f"تم إنشاء الغرفة بواسطة {user.display_name or user.username}",
        )
    )
    db.commit()
    db.refresh(room)
    return {"room": room_state(db, room, user)}


@router.get("/{room_id}")
def get_room(room_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    room = require_room(db, room_id)
    return {"room": room_state(db, room, user), "ban": _ban_payload(active_ban(db, room.id, user.id))}


@router.delete("/{room_id}")
def delete_room(room_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """حذف الغرفة (المالك): يحرّر حصة الغرفة الواحدة ويحذف أعضاءها وعقوباتها."""
    room = require_room(db, room_id)
    if not is_room_admin(room, user):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "حذف الغرفة من صلاحيات مالكها")
    member_ids = [
        row.user_id
        for row in db.execute(select(RoomMember).where(RoomMember.room_id == room.id)).scalars().all()
    ]
    db.delete(room)
    db.commit()
    for member_id in member_ids:
        if member_id != user.id:
            hub.notify_user(member_id, {"type": "room_deleted", "room_id": room_id})
    hub.notify_room(room_id, {"type": "room_deleted", "room_id": room_id})
    return {"status": "deleted", "room_id": room_id}


@router.patch("/{room_id}")
def update_room(
    room_id: int,
    payload: RoomPatch,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    room = require_room(db, room_id)
    member = membership(db, room.id, user.id)
    if not is_room_admin(room, user):
        require_member(db, room, user)
        require_role(member, "moderator")

    data = payload.model_dump(exclude_none=True)
    if "background" in data and data["background"] not in BACKGROUNDS:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "الخلفية غير متاحة")
    if "status" in data:
        if data["status"] not in {"open", "closed"}:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "حالة الغرفة غير صحيحة")
        other = _owned_open_room(db, room.owner_id)
        if data["status"] == "open" and other is not None and other.id != room.id:
            raise HTTPException(status.HTTP_409_CONFLICT, "الغرفة الواحدة لكل مستخدم: أغلق غرفتك الأخرى أولاً")
    if not is_room_admin(room, user) and set(data) - {"background", "rules", "gifts_enabled", "chat_enabled"}:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "المشرف لا يمكنه تغيير هذه الإعدادات")

    data.pop("clear_password", None)
    for key, value in data.items():
        setattr(room, key, value)
    if payload.clear_password:
        room.password_hash = None
    elif payload.password:
        room.password_hash = hash_password(payload.password)
        room.is_private = True
    db.commit()
    db.refresh(room)
    return {"room": _broadcast(db, room, user)}


@router.post("/{room_id}/join")
def join_room(
    room_id: int,
    payload: JoinIn,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """الانضمام مباشر: العضو يصبح مستمعاً فوراً بلا رفع يد ولا موافقة."""
    room = require_room(db, room_id)
    ban = active_ban(db, room.id, user.id)
    if ban is not None:
        raise HTTPException(status.HTTP_403_FORBIDDEN, _ban_message(ban))
    if room.status != "open":
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "الغرفة مغلقة حالياً")
    if room.password_hash and not verify_password(payload.password or "", room.password_hash):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "كلمة مرور الغرفة غير صحيحة")

    member = membership(db, room.id, user.id)
    if member is None:
        member = RoomMember(room_id=room.id, user_id=user.id, role="member", mic_on=False)
        db.add(member)
        db.add(
            RoomMessage(
                room_id=room.id,
                user_id=user.id,
                kind="system",
                text=f"انضم {user.display_name or user.username} إلى الغرفة",
            )
        )
        db.flush()
        user.xp = (user.xp or 0) + 5
    db.commit()
    db.refresh(room)
    hub.notify_room(room.id, {"type": "room_member_joined", "user_id": user.id})
    return {"room": _broadcast(db, room, user)}


@router.post("/{room_id}/leave", status_code=status.HTTP_200_OK)
def leave_room(room_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    room = require_room(db, room_id)
    member = membership(db, room.id, user.id)
    if member is not None:
        if room.owner_id == user.id:
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST,
                "مالك الغرفة لا يغادرها — غرفتك تبقى لك حتى تحذفها",
            )
        db.delete(member)
        db.add(
            RoomMessage(
                room_id=room.id,
                user_id=user.id,
                kind="system",
                text=f"غادر {user.display_name or user.username} الغرفة",
            )
        )
        db.commit()
    hub.notify_room(room.id, {"type": "room_member_left", "user_id": user.id})
    db.refresh(room)
    return {"room": _broadcast(db, room, user)}


@router.post("/{room_id}/like")
def toggle_like(room_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """إعجاب واحد لكل حساب: الضغط مرة أخرى يلغي الإعجاب."""
    room = require_room(db, room_id)
    require_member(db, room, user)
    like = db.execute(
        select(RoomLike).where(RoomLike.room_id == room.id, RoomLike.user_id == user.id)
    ).scalar_one_or_none()
    if like is None:
        db.add(RoomLike(room_id=room.id, user_id=user.id))
        liked = True
    else:
        db.delete(like)
        liked = False
    db.commit()
    count = like_count(db, room.id)
    hub.notify_room(
        room.id,
        {"type": "room_like", "room_id": room.id, "user_id": user.id, "liked": liked, "like_count": count},
    )
    state = room_state(db, room, user)
    hub.notify_room(room.id, {"type": "room_state", "room": state})
    return {"liked": liked, "like_count": count, "room": state}


@router.post("/{room_id}/seats/{seat_index}/take")
def take_seat(
    room_id: int,
    seat_index: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """الصعود مباشر لكل عضو إلى أي مقعد فارغ — المايك مكتوم حتى يفتحه بنفسه."""
    room = require_room(db, room_id)
    member = require_member(db, room, user)
    if seat_index < 0 or seat_index >= room.seat_count:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "رقم المقعد غير موجود")
    if seat_index in (room.locked_seats or []):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "هذا المقعد مقفل")

    occupied = db.execute(
        select(RoomMember).where(RoomMember.room_id == room.id, RoomMember.seat_index.is_not(None))
    ).scalars().all()
    taken = {row.seat_index for row in occupied}
    locked = {index for index in (room.locked_seats or []) if 0 <= int(index) < room.seat_count}
    if not (set(range(room.seat_count)) - taken - locked):
        raise HTTPException(status.HTTP_409_CONFLICT, "جميع المقاعد مشغولة")
    if seat_index in taken:
        raise HTTPException(status.HTTP_409_CONFLICT, "المقعد مشغول")

    # مقعد واحد لكل مستخدم: الانتقال إلى مقعد آخر يحرّر القديم أولاً.
    member.seat_index = seat_index
    member.mic_on = False
    db.commit()
    db.refresh(room)
    return {"room": _broadcast(db, room, user)}


@router.post("/{room_id}/seats/{seat_index}/release")
def release_seat(
    room_id: int,
    seat_index: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """النزول من المقعد: يتوقف إرسال الصوت ويعود العضو مستمعاً."""
    room = require_room(db, room_id)
    member = require_member(db, room, user)
    if member.seat_index != seat_index:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "أنت لا تجلس على هذا المقعد")
    member.seat_index = None
    member.mic_on = False
    db.commit()
    db.refresh(room)
    hub.notify_user(user.id, {"type": "voice_leave", "room_id": room.id})
    return {"room": _broadcast(db, room, user)}


@router.post("/{room_id}/seats/{seat_index}/lock")
def lock_seat(
    room_id: int,
    seat_index: int,
    payload: BoolIn,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    room = require_room(db, room_id)
    member = membership(db, room.id, user.id)
    if not is_room_admin(room, user):
        require_member(db, room, user)
        require_role(member, "moderator")
    if seat_index < 0 or seat_index >= room.seat_count:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "رقم المقعد غير موجود")

    locked = set(room.locked_seats or [])
    if payload.value:
        locked.add(seat_index)
        holder = db.execute(
            select(RoomMember).where(RoomMember.room_id == room.id, RoomMember.seat_index == seat_index)
        ).scalar_one_or_none()
        if holder is not None:
            holder.seat_index = None
            holder.mic_on = False
            hub.notify_user(holder.user_id, {"type": "unseated", "room_id": room.id})
    else:
        locked.discard(seat_index)
    room.locked_seats = sorted(locked)
    db.commit()
    db.refresh(room)
    return {"room": _broadcast(db, room, user)}


@router.post("/{room_id}/members/{target_id}/unseat")
def unseat_member(
    room_id: int,
    target_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """إنزال عضو من المقعد (المشرف) أو نزول المستخدم بنفسه."""
    room = require_room(db, room_id)
    actor = membership(db, room.id, user.id)
    if target_id != user.id:
        if not is_room_admin(room, user):
            require_member(db, room, user)
            require_role(actor, "moderator")
    target = membership(db, room.id, target_id)
    if target is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "المستخدم ليس في الغرفة")
    target.seat_index = None
    target.mic_on = False
    db.commit()
    if target_id != user.id:
        hub.notify_user(target_id, {"type": "unseated", "room_id": room.id})
    db.refresh(room)
    return {"room": _broadcast(db, room, user)}


@router.post("/{room_id}/members/{target_id}/mic")
def set_own_mic(
    room_id: int,
    target_id: int,
    payload: BoolIn,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """فتح/كتم المايك: المستخدم لنفسه، والمشرف للآخرين. التحقق كله على الخادم."""
    room = require_room(db, room_id)
    actor = require_member(db, room, user)
    if target_id != user.id and rank(actor) < 1 and not is_room_admin(room, user):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "لا تملك الصلاحية لتحكم مايك الآخرين")
    target = membership(db, room.id, target_id)
    if target is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "المستخدم ليس في الغرفة")
    if payload.value:
        if target.seat_index is None:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "يجب الجلوس على مقعد أولاً")
        if target.muted_by_mod:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "تم كتم المايك من قبل الإدارة")
    target.mic_on = payload.value
    db.commit()
    db.refresh(room)
    return {"room": _broadcast(db, room, user)}


@router.post("/{room_id}/members/{target_id}/mute")
def mute_member(
    room_id: int,
    target_id: int,
    payload: BoolIn,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    room = require_room(db, room_id)
    actor = membership(db, room.id, user.id)
    if not is_room_admin(room, user):
        require_member(db, room, user)
        require_role(actor, "moderator")
    target = membership(db, room.id, target_id)
    if target is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "المستخدم ليس في الغرفة")
    if target.user_id != user.id and rank(target) >= rank(actor) and not is_room_admin(room, user):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "لا يمكنك كتم من لديه صلاحية مساوية أو أعلى")

    target.muted_by_mod = payload.value
    if payload.value:
        target.mic_on = False
    db.commit()
    hub.notify_user(
        target_id,
        {"type": "muted", "room_id": room.id, "value": payload.value},
    )
    db.refresh(room)
    return {"room": _broadcast(db, room, user)}


@router.post("/{room_id}/members/{target_id}/kick")
def kick_member(
    room_id: int,
    target_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """إخراج فوري من الغرفة بلا عقوبة دائمة (منفصل عن أنواع الطرد)."""
    room = require_room(db, room_id)
    actor = membership(db, room.id, user.id)
    if not is_room_admin(room, user):
        require_member(db, room, user)
        require_role(actor, "moderator")
    target = membership(db, room.id, target_id)
    if target is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "المستخدم ليس في الغرفة")
    if room.owner_id == target_id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "لا يمكن طرد مالك الغرفة")
    if rank(target) >= rank(actor) and not is_room_admin(room, user):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "لا يمكنك طرد من لديه صلاحية مساوية أو أعلى")

    target.seat_index = None
    target.mic_on = False
    db.delete(target)
    db.add(
        RoomMessage(
            room_id=room.id,
            user_id=user.id,
            kind="system",
            text=f"تم طرد {db.get(User, target_id).username} من الغرفة",
        )
    )
    db.commit()
    hub.notify_user(target_id, {"type": "kicked", "room_id": room.id})
    db.refresh(room)
    return {"room": _broadcast(db, room, user)}


def _ban_message(ban: RoomBan) -> str:
    label = BAN_DURATIONS.get(ban.duration, ("", "مدة محددة"))[1]
    until = ban.expires_at.astimezone(dt.timezone.utc).strftime("%Y-%m-%d %H:%M")
    return f"أنت مطرود من هذه الغرفة ({label}) حتى {until} بتوقيت غرينتش — لا يمكنك الدخول قبل ذلك"


def _ban_payload(ban: Optional[RoomBan]) -> Optional[dict]:
    if ban is None:
        return None
    return {
        "duration": ban.duration,
        "reason": ban.reason,
        "starts_at": ban.created_at.isoformat(),
        "expires_at": ban.expires_at.isoformat(),
    }


def _ban_public(ban: RoomBan, db: Session) -> dict:
    target = db.get(User, ban.user_id)
    actor = db.get(User, ban.banned_by) if ban.banned_by else None
    return {
        "user": user_public(target) if target is not None else None,
        "user_id": ban.user_id,
        "duration": ban.duration,
        "duration_label": BAN_DURATIONS.get(ban.duration, ("", ban.duration))[1],
        "reason": ban.reason,
        "created_at": ban.created_at.isoformat(),
        "expires_at": ban.expires_at.isoformat(),
        "banned_by": user_public(actor) if actor is not None else None,
        "active": ban.expires_at > utcnow(),
    }


@router.get("/{room_id}/bans")
def room_bans(room_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """قائمة المحظورين: الاسم، السبب، بداية الحظر ونهايته (ساعة الخادم)."""
    room = require_room(db, room_id)
    require_ban_permission(db, room, user)
    purge_expired_bans(db, room.id)
    rows = (
        db.execute(select(RoomBan).where(RoomBan.room_id == room.id).order_by(RoomBan.id.desc()))
        .scalars()
        .all()
    )
    return {"bans": [_ban_public(ban, db) for ban in rows]}


@router.post("/{room_id}/members/{target_id}/ban")
def ban_member(
    room_id: int,
    target_id: int,
    payload: BanIn,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """طرد لمدة ساعتين أو 12 شهراً — يخرج فوراً ويُمنع من العودة حتى انتهاء المدة."""
    room = require_room(db, room_id)
    ban = ban_user(db, room, user, target_id, payload.duration, payload.reason)
    db.add(
        RoomMessage(
            room_id=room.id,
            user_id=user.id,
            kind="system",
            text=(
                f"تم طرد {db.get(User, target_id).username} "
                f"({BAN_DURATIONS[ban.duration][1]}){' — ' + ban.reason if ban.reason else ''}"
            ),
        )
    )
    db.commit()
    hub.notify_user(
        target_id,
        {
            "type": "banned",
            "room_id": room.id,
            "expires_at": ban.expires_at.isoformat(),
            "reason": ban.reason,
            "duration": ban.duration,
        },
    )
    db.refresh(room)
    return {"room": _broadcast(db, room, user), "ban": _ban_public(ban, db)}


@router.delete("/{room_id}/bans/{target_id}")
def unban_member(
    room_id: int,
    target_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """إلغاء الحظر يدوياً من مالك الغرفة (أو إدارة التطبيق)."""
    room = require_room(db, room_id)
    if not is_room_admin(room, user):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "إلغاء الحظر من صلاحيات مالك الغرفة")
    ban = db.execute(
        select(RoomBan).where(RoomBan.room_id == room.id, RoomBan.user_id == target_id)
    ).scalar_one_or_none()
    if ban is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "لا يوجد حظر على هذا المستخدم")
    db.delete(ban)
    db.commit()
    hub.notify_user(target_id, {"type": "unbanned", "room_id": room.id})
    return {"status": "unbanned", "room_id": room.id, "user_id": target_id}


@router.post("/{room_id}/members/{target_id}/permissions")
def set_member_permissions(
    room_id: int,
    target_id: int,
    payload: PermissionIn,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """المالك يمنح مشرفه صلاحية الطرد أو يسحبها."""
    room = require_room(db, room_id)
    if not is_room_admin(room, user):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "منح الصلاحيات من صلاحيات مالك الغرفة")
    target = membership(db, room.id, target_id)
    if target is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "المستخدم ليس في الغرفة")
    if target.user_id == room.owner_id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "مالك الغرفة لا يحتاج صلاحية طرد")
    target.can_ban = payload.can_ban
    db.commit()
    create_notification(
        db,
        target_id,
        "account",
        "تحديث صلاحية الطرد",
        ("تم منحك صلاحية الطرد" if payload.can_ban else "تم سحب صلاحية الطرد") + f" في {room.name}",
        {"room_id": room.id},
    )
    db.refresh(room)
    return {"room": _broadcast(db, room, user)}


@router.post("/{room_id}/members/{target_id}/role")
def set_role(
    room_id: int,
    target_id: int,
    payload: RoleIn,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    room = require_room(db, room_id)
    if not is_room_admin(room, user):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "تعيين المشرفين من صلاحيات مالك الغرفة")
    if payload.role not in ROOM_ROLES:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "صلاحية غير معروفة")
    target = membership(db, room.id, target_id)
    if target is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "المستخدم ليس في الغرفة")
    if target.user_id == room.owner_id and payload.role != "owner":
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "لا يمكن تغيير صلاحية مالك الغرفة")
    target.role = payload.role
    if payload.role != "moderator":
        target.can_ban = False
    db.commit()
    create_notification(
        db,
        target_id,
        "account",
        "تم تحديث صلاحيتك",
        f"صلاحيتك الجديدة في {room.name}: {payload.role}",
        {"room_id": room.id, "role": payload.role},
    )
    db.refresh(room)
    return {"room": _broadcast(db, room, user)}


@router.post("/{room_id}/owner")
def transfer_owner(
    room_id: int,
    payload: OwnerIn,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    room = require_room(db, room_id)
    if not is_room_admin(room, user):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "نقل الملكية من صلاحيات المالك")
    new_owner = membership(db, room.id, payload.user_id)
    if new_owner is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "المستخدم ليس في الغرفة")
    if _owned_open_room(db, payload.user_id) is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, "هذا المستخدم يملك غرفة بالفعل")

    previous = membership(db, room.id, room.owner_id)
    if previous is not None:
        previous.role = "member"
        previous.can_ban = False
    new_owner.role = "owner"
    room.owner_id = payload.user_id
    db.commit()
    db.refresh(room)
    return {"room": _broadcast(db, room, user)}


@router.post("/{room_id}/background")
def change_background(
    room_id: int,
    payload: dict,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    room = require_room(db, room_id)
    member = membership(db, room.id, user.id)
    if not is_room_admin(room, user):
        require_member(db, room, user)
        require_role(member, "moderator")
    background = str(payload.get("background", ""))
    if background not in BACKGROUNDS:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "الخلفية غير متاحة")
    room.background = background
    db.commit()
    db.refresh(room)
    return {"room": _broadcast(db, room, user)}


@router.post("/{room_id}/invite")
def invite_to_room(
    room_id: int,
    payload: InviteIn,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    room = require_room(db, room_id)
    require_member(db, room, user)
    if db.get(User, payload.user_id) is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "المستخدم غير موجود")
    create_notification(
        db,
        payload.user_id,
        "room_invite",
        "دعوة إلى غرفة",
        f"{user.display_name or user.username} دعاك إلى {room.name}",
        {"room_id": room.id, "from": user.id},
    )
    db.commit()
    return {"status": "invited"}


@router.get("/{room_id}/messages")
def room_messages(
    room_id: int,
    limit: int = Query(default=50, ge=1, le=200),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    room = require_room(db, room_id)
    require_member(db, room, user)
    rows = (
        db.execute(
            select(RoomMessage).where(RoomMessage.room_id == room.id).order_by(RoomMessage.id.desc()).limit(limit)
        )
        .scalars()
        .all()
    )
    rows.reverse()
    return {
        "messages": [message_public(row, db.get(User, row.user_id)) for row in rows],
        "chat_enabled": room.chat_enabled,
    }


@router.post("/{room_id}/messages", status_code=status.HTTP_201_CREATED)
def post_room_message(
    room_id: int,
    payload: MessageIn,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    room = require_room(db, room_id)
    member = require_member(db, room, user)
    if not room.chat_enabled and rank(member) < 1:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "الدردشة معطلة في هذه الغرفة")
    message = RoomMessage(room_id=room.id, user_id=user.id, kind="chat", text=payload.text.strip())
    db.add(message)
    db.commit()
    db.refresh(message)
    payload_out = {"type": "chat", "room_id": room.id, "message": message_public(message, user)}
    hub.notify_room(room.id, payload_out)
    return payload_out["message"]


@router.post("/{room_id}/report", status_code=status.HTTP_201_CREATED)
def report_room(
    room_id: int,
    payload: ReportIn,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    room = require_room(db, room_id)
    report = Report(
        reporter_id=user.id,
        target_type="room",
        target_id=room.id,
        reason=payload.reason,
        details=payload.details.strip()[:1000],
    )
    db.add(report)
    db.commit()
    return {"status": "reported"}


@router.get("/{room_id}/stats")
def room_stats(room_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    room = require_room(db, room_id)
    state = room_state(db, room, user)
    return {
        "members": state["member_count"],
        "seated": state["seated_count"],
        "free_seats": state["free_seats"],
        "seats": room.seat_count,
        "likes": state["like_count"],
        "bans": int(
            db.execute(
                select(func.count(RoomBan.id)).where(
                    RoomBan.room_id == room.id, RoomBan.expires_at > utcnow()
                )
            ).scalar()
            or 0
        ),
    }
