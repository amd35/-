"""Room helpers: membership, roles, seats, likes, temporary bans and state."""
import datetime as dt
from typing import Optional

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .models import Room, RoomBan, RoomLike, RoomMember, User, utcnow
from .serializers import member_public, room_public

ROLE_RANK = {"owner": 3, "moderator": 2, "assistant": 1, "member": 0}

# منصة صوتية واحدة بـ 12 مقعداً لكل غرفة.
ROOM_SEATS = 12

# أنواع العقوبة: ساعتان أو 12 شهراً. المدة تُحسب بتوقيت الخادم حصراً.
BAN_DURATIONS = {
    "2h": (dt.timedelta(hours=2), "ساعتين"),
    "12mo": (dt.timedelta(days=365), "12 شهراً"),
}


def membership(db: Session, room_id: int, user_id: int) -> Optional[RoomMember]:
    return db.execute(
        select(RoomMember).where(RoomMember.room_id == room_id, RoomMember.user_id == user_id)
    ).scalar_one_or_none()


def member_count(db: Session, room_id: int) -> int:
    return int(
        db.execute(select(func.count(RoomMember.id)).where(RoomMember.room_id == room_id)).scalar() or 0
    )


def like_count(db: Session, room_id: int) -> int:
    return int(
        db.execute(select(func.count(RoomLike.id)).where(RoomLike.room_id == room_id)).scalar() or 0
    )


def has_liked(db: Session, room_id: int, user_id: int) -> bool:
    return (
        db.execute(
            select(RoomLike.id).where(RoomLike.room_id == room_id, RoomLike.user_id == user_id)
        ).first()
        is not None
    )


def active_ban(db: Session, room_id: int, user_id: int) -> Optional[RoomBan]:
    """الحظر الساري فقط — المنتهي يُهمَل تلقائياً فور انتهاء مدته (بتوقيت الخادم)."""
    ban = db.execute(
        select(RoomBan).where(RoomBan.room_id == room_id, RoomBan.user_id == user_id)
    ).scalar_one_or_none()
    if ban is None:
        return None
    if ban.expires_at <= utcnow():
        return None
    return ban


def is_banned(db: Session, room_id: int, user_id: int) -> bool:
    return active_ban(db, room_id, user_id) is not None


def purge_expired_bans(db: Session, room_id: Optional[int] = None) -> int:
    """حذف عقوبات انتهت مدتها؛ الحظر يُرفع تلقائياً بحسب ساعة الخادم."""
    statement = select(RoomBan).where(RoomBan.expires_at <= utcnow())
    if room_id is not None:
        statement = statement.where(RoomBan.room_id == room_id)
    rows = db.execute(statement).scalars().all()
    for row in rows:
        db.delete(row)
    if rows:
        db.commit()
    return len(rows)


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


def is_room_admin(room: Room, user: User) -> bool:
    return room.owner_id == user.id or bool(user.is_admin)


def may_ban(db: Session, room: Room, user: User) -> bool:
    """المالك (أو إدارة التطبيق) دائماً، والمشرف فقط إذا منحه المالك صلاحية الطرد."""
    if is_room_admin(room, user):
        return True
    member = membership(db, room.id, user.id)
    return bool(member is not None and member.role == "moderator" and member.can_ban)


def require_ban_permission(db: Session, room: Room, user: User) -> None:
    if not may_ban(db, room, user):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "الطرد من صلاحيات مالك الغرفة أو مشرف مخوّل")


def ban_expiry(duration: str) -> dt.datetime:
    if duration not in BAN_DURATIONS:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "مدة الحظر غير صحيحة")
    return utcnow() + BAN_DURATIONS[duration][0]


def ban_user(
    db: Session,
    room: Room,
    actor: User,
    target_id: int,
    duration: str,
    reason: str = "",
) -> RoomBan:
    """تطبيق عقوبة طرد على عضو: تُسجَّل بمدة وتاريخ انتهاء وتُخرجه فوراً من الغرفة."""
    require_ban_permission(db, room, actor)
    expires_at = ban_expiry(duration)
    if target_id == actor.id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "لا يمكنك طرد نفسك")
    if target_id == room.owner_id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "لا يمكن طرد مالك الغرفة")

    target_user = db.get(User, target_id)
    if target_user is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "المستخدم غير موجود")
    target = membership(db, room.id, target_id)
    if target is not None and not is_room_admin(room, actor) and rank(target) >= rank(membership(db, room.id, actor.id)):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "لا يمكنك طرد من لديه صلاحية مساوية أو أعلى")

    ban = db.execute(
        select(RoomBan).where(RoomBan.room_id == room.id, RoomBan.user_id == target_id)
    ).scalar_one_or_none()
    if ban is None:
        ban = RoomBan(room_id=room.id, user_id=target_id, banned_by=actor.id)
        db.add(ban)
    ban.banned_by = actor.id
    ban.duration = duration
    ban.reason = reason.strip()[:200]
    ban.expires_at = expires_at
    ban.created_at = utcnow()

    if target is not None:
        # إنزال فوري من المقعد + إيقاف المايك قبل إخراجه من الغرفة.
        target.seat_index = None
        target.mic_on = False
        db.delete(target)
    return ban


def room_state(db: Session, room: Room, viewer: Optional[User] = None) -> dict:
    """Everything a client needs to render a room: members, seats, likes."""
    rows = (
        db.execute(select(RoomMember, User).join(User, User.id == RoomMember.user_id).where(RoomMember.room_id == room.id))
        .all()
    )
    members = [member_public(member, user) for member, user in rows]
    members.sort(key=lambda item: (item["seat_index"] is None, item["seat_index"] or 0, item["user"]["id"]))
    owner = db.get(User, room.owner_id)
    payload = room_public(
        room,
        owner,
        len(members),
        like_count(db, room.id),
        has_liked(db, room.id, viewer.id) if viewer is not None else False,
    )
    payload["members"] = members
    occupied = {member["seat_index"] for member in members if member["seat_index"] is not None}
    locked = {index for index in (room.locked_seats or []) if 0 <= int(index) < room.seat_count}
    payload["seated_count"] = len(occupied)
    payload["free_seats"] = max(room.seat_count - len(occupied | locked), 0)
    return payload
