"""Room helpers: membership, roles, bans and the room state payload."""
from typing import Optional

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .models import Room, RoomBan, RoomMember, User
from .serializers import member_public, room_public

ROLE_RANK = {"owner": 3, "moderator": 2, "assistant": 1, "member": 0}


def membership(db: Session, room_id: int, user_id: int) -> Optional[RoomMember]:
    return db.execute(
        select(RoomMember).where(RoomMember.room_id == room_id, RoomMember.user_id == user_id)
    ).scalar_one_or_none()


def member_count(db: Session, room_id: int) -> int:
    return int(
        db.execute(select(func.count(RoomMember.id)).where(RoomMember.room_id == room_id)).scalar() or 0
    )


def is_banned(db: Session, room_id: int, user_id: int) -> bool:
    return (
        db.execute(
            select(RoomBan.id).where(RoomBan.room_id == room_id, RoomBan.user_id == user_id)
        ).first()
        is not None
    )


def require_room(db: Session, room_id: int) -> Room:
    room = db.get(Room, room_id)
    if room is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "الغرفة غير موجودة")
    return room


def require_member(db: Session, room: Room, user: User) -> RoomMember:
    member = membership(db, room.id, user.id)
    if member is None:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "أنت لست عضواً في هذه الغرفة")
    return member


def rank(member: Optional[RoomMember]) -> int:
    if member is None:
        return -1
    return ROLE_RANK.get(member.role, 0)


def require_role(member: RoomMember, minimum: str) -> None:
    if ROLE_RANK.get(member.role, 0) < ROLE_RANK[minimum]:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "لا تملك الصلاحية لهذا الإجراء")


def room_state(db: Session, room: Room) -> dict:
    """Everything a client needs to render a room: members, seats, hands."""
    rows = (
        db.execute(select(RoomMember, User).join(User, User.id == RoomMember.user_id).where(RoomMember.room_id == room.id))
        .all()
    )
    members = [member_public(member, user) for member, user in rows]
    owner = db.get(User, room.owner_id)
    payload = room_public(room, owner, len(members))
    payload["members"] = members
    payload["hand_requests"] = [
        {"user_id": user.id, "seat_index": member.seat_index}
        for member, user in rows
        if member.hand_raised and not member.mic_granted
    ]
    return payload
