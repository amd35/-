"""Voice rooms: creation, membership, seats, mic permissions, moderation."""
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import Report, Room, RoomBan, RoomMember, RoomMessage, User
from ..notifications import create_notification
from ..realtime import hub
from ..room_service import (
    is_banned,
    member_count,
    membership,
    rank,
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
    seat_count: int = Field(default=20, ge=4, le=24)
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
    seat_count: Optional[int] = Field(default=None, ge=4, le=24)
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


class OwnerIn(BaseModel):
    user_id: int


class MessageIn(BaseModel):
    text: str = Field(min_length=1, max_length=1000)


class InviteIn(BaseModel):
    user_id: int


class ReportIn(BaseModel):
    reason: str = Field(min_length=2, max_length=64)
    details: str = ""


def _broadcast(db: Session, room: Room) -> dict:
    state = room_state(db, room)
    hub.notify_room(room.id, {"type": "room_state", "room": state})
    return state


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
        payload.append(room_public(room, owner, member_count(db, room.id)))
    return {"rooms": payload}


@router.post("", status_code=status.HTTP_201_CREATED)
def create_room(payload: RoomIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    background = payload.background if payload.background in BACKGROUNDS else "sunset"
    room = Room(
        name=payload.name.strip(),
        description=payload.description.strip()[:500],
        image_url=payload.image_url.strip()[:512],
        background=background,
        rules=payload.rules.strip()[:2000],
        seat_count=payload.seat_count,
        is_private=payload.is_private,
        password_hash=hash_password(payload.password) if payload.is_private and payload.password else None,
        gifts_enabled=payload.gifts_enabled,
        chat_enabled=payload.chat_enabled,
        mic_settings=payload.mic_settings or {},
        locked_seats=[],
        owner_id=user.id,
    )
    db.add(room)
    db.flush()
    db.add(
        RoomMember(
            room_id=room.id,
            user_id=user.id,
            role="owner",
            seat_index=0,
            mic_granted=True,
        )
    )
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
    return {"room": room_state(db, room)}


@router.get("/{room_id}")
def get_room(room_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    room = require_room(db, room_id)
    return {"room": room_state(db, room)}


@router.patch("/{room_id}")
def update_room(
    room_id: int,
    payload: RoomPatch,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    room = require_room(db, room_id)
    member = membership(db, room.id, user.id)
    if room.owner_id != user.id and not user.is_admin:
        require_member(db, room, user)
        require_role(member, "moderator")

    data = payload.model_dump(exclude_none=True)
    if "background" in data and data["background"] not in BACKGROUNDS:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "الخلفية غير متاحة")
    if "status" in data and data["status"] not in {"open", "closed"}:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "حالة الغرفة غير صحيحة")
    if room.owner_id != user.id and not user.is_admin and set(data) - {"background", "rules", "gifts_enabled", "chat_enabled"}:
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
    return {"room": _broadcast(db, room)}


@router.post("/{room_id}/join")
def join_room(
    room_id: int,
    payload: JoinIn,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    room = require_room(db, room_id)
    if room.status != "open":
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "الغرفة مغلقة حالياً")
    if is_banned(db, room.id, user.id):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "أنت محظور من هذه الغرفة")
    if room.password_hash and not verify_password(payload.password or "", room.password_hash):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "كلمة مرور الغرفة غير صحيحة")

    member = membership(db, room.id, user.id)
    if member is None:
        member = RoomMember(room_id=room.id, user_id=user.id, role="member")
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
    return {"room": _broadcast(db, room), "member": {"seat_index": member.seat_index, "mic_granted": member.mic_granted}}


@router.post("/{room_id}/leave", status_code=status.HTTP_200_OK)
def leave_room(room_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    room = require_room(db, room_id)
    member = membership(db, room.id, user.id)
    if member is not None:
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
    return {"room": _broadcast(db, room)}


@router.post("/{room_id}/seats/{seat_index}/take")
def take_seat(
    room_id: int,
    seat_index: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    room = require_room(db, room_id)
    member = require_member(db, room, user)
    if seat_index < 0 or seat_index >= room.seat_count:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "رقم المقعد غير موجود")
    if seat_index in (room.locked_seats or []):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "هذا المقعد مقفل")
    if seat_index == 0 and room.owner_id != user.id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "مقعد المالك محجوز لصاحب الغرفة")

    occupied = db.execute(
        select(RoomMember).where(RoomMember.room_id == room.id, RoomMember.seat_index == seat_index)
    ).scalar_one_or_none()
    if occupied is not None and occupied.user_id != user.id:
        raise HTTPException(status.HTTP_409_CONFLICT, "المقعد مشغول")

    if rank(member) == 0 and not member.mic_granted:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "ارفع يدك وانتظر موافقة الإدارة على المايك")

    member.seat_index = seat_index
    member.hand_raised = False
    db.commit()
    db.refresh(room)
    return {"room": _broadcast(db, room)}


@router.post("/{room_id}/seats/{seat_index}/release")
def release_seat(
    room_id: int,
    seat_index: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    room = require_room(db, room_id)
    member = require_member(db, room, user)
    if member.seat_index != seat_index:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "أنت لا تجلس على هذا المقعد")
    member.seat_index = None
    member.mic_on = False
    db.commit()
    db.refresh(room)
    return {"room": _broadcast(db, room)}


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
    if room.owner_id != user.id and not user.is_admin:
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
    else:
        locked.discard(seat_index)
    room.locked_seats = sorted(locked)
    db.commit()
    db.refresh(room)
    return {"room": _broadcast(db, room)}


@router.post("/{room_id}/hand")
def raise_hand(
    room_id: int,
    payload: BoolIn,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    room = require_room(db, room_id)
    member = require_member(db, room, user)
    member.hand_raised = payload.value
    if not payload.value:
        member.mic_granted = member.mic_granted and member.seat_index is not None
    db.commit()
    db.refresh(room)
    state = _broadcast(db, room)
    if payload.value:
        owner_ids = [
            row.user_id
            for row in db.execute(
                select(RoomMember).where(
                    RoomMember.room_id == room.id,
                    RoomMember.role.in_(["owner", "moderator", "assistant"]),
                )
            ).scalars().all()
        ]
        hub.notify_users(
            owner_ids,
            {"type": "mic_request", "room_id": room.id, "user": user_public(user)},
        )
    return {"room": state}


@router.get("/{room_id}/hands")
def hand_requests(room_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    room = require_room(db, room_id)
    member = membership(db, room.id, user.id)
    if room.owner_id != user.id and not user.is_admin:
        require_member(db, room, user)
        require_role(member, "assistant")
    rows = db.execute(
        select(RoomMember).where(RoomMember.room_id == room.id, RoomMember.hand_raised.is_(True))
    ).scalars().all()
    return {
        "requests": [
            {"user": user_public(db.get(User, row.user_id)), "seat_index": row.seat_index}
            for row in rows
        ]
    }


@router.post("/{room_id}/hands/{target_id}/approve")
def approve_hand(
    room_id: int,
    target_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    room = require_room(db, room_id)
    actor = membership(db, room.id, user.id)
    if room.owner_id != user.id and not user.is_admin:
        require_member(db, room, user)
        require_role(actor, "assistant")
    target = membership(db, room.id, target_id)
    if target is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "المستخدم ليس في الغرفة")
    target.mic_granted = True
    target.hand_raised = False
    db.commit()
    create_notification(
        db,
        target_id,
        "account",
        "تمت الموافقة على المايك",
        f"يمكنك الآن الجلوس على مقعد في {room.name}",
        {"room_id": room.id},
    )
    hub.notify_user(target_id, {"type": "mic_granted", "room_id": room.id})
    db.refresh(room)
    return {"room": _broadcast(db, room)}


@router.post("/{room_id}/hands/{target_id}/reject")
def reject_hand(
    room_id: int,
    target_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    room = require_room(db, room_id)
    actor = membership(db, room.id, user.id)
    if room.owner_id != user.id and not user.is_admin:
        require_member(db, room, user)
        require_role(actor, "assistant")
    target = membership(db, room.id, target_id)
    if target is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "المستخدم ليس في الغرفة")
    target.hand_raised = False
    target.mic_granted = False
    db.commit()
    hub.notify_user(target_id, {"type": "mic_rejected", "room_id": room.id})
    db.refresh(room)
    return {"room": _broadcast(db, room)}


@router.post("/{room_id}/members/{target_id}/mic")
def set_own_mic(
    room_id: int,
    target_id: int,
    payload: BoolIn,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Turn your own microphone on/off (a moderator may do it for anyone)."""
    room = require_room(db, room_id)
    actor = require_member(db, room, user)
    if target_id != user.id and rank(actor) < 1:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "لا تملك الصلاحية لتحكم مايك الآخرين")
    target = membership(db, room.id, target_id)
    if target is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "المستخدم ليس في الغرفة")
    if payload.value:
        if target.seat_index is None:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "يجب الجلوس على مقعد أولاً")
        if target.muted_by_mod:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "تم كتم المايك من قبل الإدارة")
        if target_id == user.id and rank(target) == 0 and not target.mic_granted:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "لم يتم منحك إذن المايك بعد")
    target.mic_on = payload.value
    db.commit()
    db.refresh(room)
    return {"room": _broadcast(db, room)}


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
    if room.owner_id != user.id and not user.is_admin:
        require_member(db, room, user)
        require_role(actor, "assistant")
    target = membership(db, room.id, target_id)
    if target is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "المستخدم ليس في الغرفة")
    if target.user_id != user.id and rank(target) >= rank(actor) and room.owner_id != user.id:
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
    return {"room": _broadcast(db, room)}


@router.post("/{room_id}/members/{target_id}/kick")
def kick_member(
    room_id: int,
    target_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    room = require_room(db, room_id)
    actor = membership(db, room.id, user.id)
    if room.owner_id != user.id and not user.is_admin:
        require_member(db, room, user)
        require_role(actor, "moderator")
    target = membership(db, room.id, target_id)
    if target is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "المستخدم ليس في الغرفة")
    if room.owner_id == target_id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "لا يمكن طرد مالك الغرفة")
    if rank(target) >= rank(actor) and room.owner_id != user.id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "لا يمكنك طرد من لديه صلاحية مساوية أو أعلى")

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
    return {"room": _broadcast(db, room)}


@router.post("/{room_id}/members/{target_id}/ban")
def ban_member(
    room_id: int,
    target_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    room = require_room(db, room_id)
    actor = membership(db, room.id, user.id)
    if room.owner_id != user.id and not user.is_admin:
        require_member(db, room, user)
        require_role(actor, "moderator")
    if room.owner_id == target_id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "لا يمكن حظر مالك الغرفة")

    if not is_banned(db, room.id, target_id):
        db.add(RoomBan(room_id=room.id, user_id=target_id, banned_by=user.id))
    target = membership(db, room.id, target_id)
    if target is not None:
        db.delete(target)
    db.commit()
    hub.notify_user(target_id, {"type": "banned", "room_id": room.id})
    db.refresh(room)
    return {"room": _broadcast(db, room)}


@router.post("/{room_id}/members/{target_id}/role")
def set_role(
    room_id: int,
    target_id: int,
    payload: RoleIn,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    room = require_room(db, room_id)
    if room.owner_id != user.id and not user.is_admin:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "تعيين المشرفين من صلاحيات مالك الغرفة")
    if payload.role not in ROOM_ROLES:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "صلاحية غير معروفة")
    target = membership(db, room.id, target_id)
    if target is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "المستخدم ليس في الغرفة")
    target.role = payload.role
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
    return {"room": _broadcast(db, room)}


@router.post("/{room_id}/owner")
def transfer_owner(
    room_id: int,
    payload: OwnerIn,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    room = require_room(db, room_id)
    if room.owner_id != user.id and not user.is_admin:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "نقل الملكية من صلاحيات المالك")
    new_owner = membership(db, room.id, payload.user_id)
    if new_owner is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "المستخدم ليس في الغرفة")

    previous = membership(db, room.id, room.owner_id)
    if previous is not None:
        previous.role = "member"
    new_owner.role = "owner"
    new_owner.mic_granted = True
    room.owner_id = payload.user_id
    db.commit()
    db.refresh(room)
    return {"room": _broadcast(db, room)}


@router.post("/{room_id}/background")
def change_background(
    room_id: int,
    payload: dict,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    room = require_room(db, room_id)
    member = membership(db, room.id, user.id)
    if room.owner_id != user.id and not user.is_admin:
        require_member(db, room, user)
        require_role(member, "moderator")
    background = str(payload.get("background", ""))
    if background not in BACKGROUNDS:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "الخلفية غير متاحة")
    room.background = background
    db.commit()
    db.refresh(room)
    return {"room": _broadcast(db, room)}


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
    seated = int(
        db.execute(
            select(func.count(RoomMember.id)).where(
                RoomMember.room_id == room.id, RoomMember.seat_index.is_not(None)
            )
        ).scalar()
        or 0
    )
    return {
        "members": member_count(db, room.id),
        "seated": seated,
        "seats": room.seat_count,
        "hands": int(
            db.execute(
                select(func.count(RoomMember.id)).where(
                    RoomMember.room_id == room.id, RoomMember.hand_raised.is_(True)
                )
            ).scalar()
            or 0
        ),
    }
