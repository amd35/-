"""الصفحة الرئيسية: كل أقسام تصميمها من بيانات حقيقية في طلب واحد.

- شرائح الغرف (تبويبات: شائع / غرف زرتها / غرفتي) مع صورتَي أعضاء كل غرفة.
- ثلاث لوحات ترتيب: العشاق (هدايا مُستلمة) · الشرف (نقاط رويال) · اللاعبين (نقاط الخبرة).
- الأعضاء الجدد، وأكثر الأعضاء متابعة (العدّاد مشتق من جدول ``follows``).
- عدّاد الدول الحقيقي (عدد الأعضاء النشطين في كل دولة).

لا رقم واحد مكتوب في الواجهة: كل قيمة تُحسب من الجداول هنا، والمحظورون (في الاتجاهين)
لا يظهرون في أي قائمة أو ترتيب.
"""
from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import Block, Follow, GiftTransaction, Room, RoomLike, RoomMember, User
from ..realtime import hub
from ..room_service import like_count, member_count
from ..security import get_current_user
from ..serializers import room_public, user_public

router = APIRouter(prefix="/api/home", tags=["home"])

HERO_LIMIT = 8  # عدد شرائح الشريط الدوّار
ROOM_MEMBERS = 4  # صور الأعضاء لكل غرفة في الحِزمة (الشريحة تعرض اثنتين)
RANK_SIZE = 3  # TOP 1..3 في كل لوحة ترتيب
NEW_USERS_LIMIT = 8
TOP_USERS_LIMIT = 6  # صور لوحة «الأكثر متابعة»
TABS = {"popular", "visited", "mine"}


def _public(user: User) -> dict:
    """العضو كما يظهر للآخرين، مع حالة الاتصال اللحظية من قناة الوقت الحقيقي."""
    return user_public(user, online_override=hub.is_online(user.id) or bool(user.online))


def _hidden_ids(db: Session, viewer_id: int) -> set[int]:
    """من حظرته أو حظرني: لا يظهر في قوائم الصفحة الرئيسية (الحظر في الاتجاهين)."""
    hidden = set(db.execute(select(Block.blocked_user_id).where(Block.user_id == viewer_id)).scalars().all())
    hidden.update(db.execute(select(Block.user_id).where(Block.blocked_user_id == viewer_id)).scalars().all())
    return hidden


def _my_room(db: Session, user_id: int) -> Optional[Room]:
    """غرفة المستخدم الواحدة (القيد الفريد على الغرف المفتوحة)."""
    return db.execute(select(Room).where(Room.owner_id == user_id, Room.status == "open")).scalars().first()


def _popular_statement():
    """الترتيب الشائع: عدد الأعضاء ثم الإعجابات ثم الأحدث."""
    members = (
        select(RoomMember.room_id.label("room_id"), func.count(RoomMember.id).label("members"))
        .group_by(RoomMember.room_id)
        .subquery()
    )
    likes = (
        select(RoomLike.room_id.label("room_id"), func.count(RoomLike.id).label("likes"))
        .group_by(RoomLike.room_id)
        .subquery()
    )
    return (
        select(Room)
        .outerjoin(members, members.c.room_id == Room.id)
        .outerjoin(likes, likes.c.room_id == Room.id)
        .where(Room.status == "open")
        .order_by(
            func.coalesce(members.c.members, 0).desc(),
            func.coalesce(likes.c.likes, 0).desc(),
            Room.id.desc(),
        )
    )


def _tab_rooms(db: Session, tab: str, viewer: User) -> list[Room]:
    if tab == "mine":
        own = _my_room(db, viewer.id)
        return [own] if own is not None else []
    if tab == "visited":
        # «غرف زرتها»: عضوية الغرفة تنشأ لحظة الانضمام، فهي سجل زيارات حقيقي.
        return list(
            db.execute(
                select(Room)
                .join(RoomMember, RoomMember.room_id == Room.id)
                .where(RoomMember.user_id == viewer.id, Room.status == "open")
                .order_by(RoomMember.joined_at.desc())
                .limit(HERO_LIMIT)
            )
            .scalars()
            .all()
        )
    return list(db.execute(_popular_statement().limit(HERO_LIMIT)).scalars().all())


def _members(db: Session, room_ids: list[int], limit: int = ROOM_MEMBERS) -> dict[int, list[dict]]:
    """أعضاء كل غرفة (المقاعد الأولى ثم الأقدم انضماماً) بجملة واحدة — بلا استعلام لكل غرفة."""
    if not room_ids:
        return {}
    rows = db.execute(
        select(RoomMember.room_id, User)
        .join(User, User.id == RoomMember.user_id)
        .where(RoomMember.room_id.in_(room_ids), User.status == "active")
        .order_by(
            RoomMember.room_id.asc(),
            RoomMember.seat_index.asc().nulls_last(),
            RoomMember.joined_at.asc(),
        )
    ).all()
    grouped: dict[int, list[dict]] = {}
    for room_id, member in rows:
        bucket = grouped.setdefault(room_id, [])
        if len(bucket) < limit:
            bucket.append(_public(member))
    return grouped


def _rooms_payload(db: Session, rooms: list[Room], viewer: User) -> list[dict]:
    ids = [room.id for room in rooms]
    liked = (
        set(
            db.execute(
                select(RoomLike.room_id).where(RoomLike.user_id == viewer.id, RoomLike.room_id.in_(ids))
            ).scalars().all()
        )
        if ids
        else set()
    )
    grouped = _members(db, ids)
    payload = []
    for room in rooms:
        owner = db.get(User, room.owner_id)
        item = room_public(room, owner, member_count(db, room.id), like_count(db, room.id), room.id in liked)
        item["members"] = grouped.get(room.id, [])
        payload.append(item)
    return payload


def _ranking(db: Session, column, score_attr: str, hidden: set[int]) -> list[dict]:
    conditions = [User.status == "active"]
    if hidden:
        conditions.append(User.id.notin_(hidden))
    rows = (
        db.execute(select(User).where(*conditions).order_by(column.desc(), User.id.asc()).limit(RANK_SIZE))
        .scalars()
        .all()
    )
    return [{**_public(user), "score": int(getattr(user, score_attr) or 0)} for user in rows]


def _lovers_ranking(db: Session, hidden: set[int]) -> list[dict]:
    """ترتيب العشاق: من استلم أكبر عدد هدايا (سجل الهدايا الحقيقي)."""
    received = (
        select(GiftTransaction.receiver_id.label("user_id"), func.count(GiftTransaction.id).label("gifts"))
        .where(GiftTransaction.receiver_id.is_not(None))
        .group_by(GiftTransaction.receiver_id)
        .subquery()
    )
    conditions = [User.status == "active"]
    if hidden:
        conditions.append(User.id.notin_(hidden))
    rows = db.execute(
        select(User, received.c.gifts)
        .join(received, received.c.user_id == User.id)
        .where(*conditions)
        .order_by(received.c.gifts.desc(), User.id.asc())
        .limit(RANK_SIZE)
    ).all()
    return [{**_public(user), "score": int(gifts or 0)} for user, gifts in rows]


def _new_users(db: Session, viewer: User, hidden: set[int]) -> list[dict]:
    conditions = [User.status == "active", User.id != viewer.id]
    if hidden:
        conditions.append(User.id.notin_(hidden))
    rows = (
        db.execute(
            select(User)
            .where(*conditions)
            .order_by(User.created_at.desc(), User.id.desc())
            .limit(NEW_USERS_LIMIT)
        )
        .scalars()
        .all()
    )
    return [_public(user) for user in rows]


def _top_users(db: Session, hidden: set[int]) -> list[dict]:
    """أكثر الأعضاء متابعة، ويكملهم الأحدث تسجيلاً حتى تكتمل صفّ الصور."""
    followers = (
        select(Follow.followed_user_id.label("user_id"), func.count(Follow.id).label("followers"))
        .group_by(Follow.followed_user_id)
        .subquery()
    )
    conditions = [User.status == "active"]
    if hidden:
        conditions.append(User.id.notin_(hidden))
    rows = db.execute(
        select(User, func.coalesce(followers.c.followers, 0))
        .outerjoin(followers, followers.c.user_id == User.id)
        .where(*conditions)
        .order_by(func.coalesce(followers.c.followers, 0).desc(), User.created_at.desc(), User.id.desc())
        .limit(TOP_USERS_LIMIT)
    ).all()
    return [{**_public(user), "followers": int(count or 0)} for user, count in rows]


def _countries(db: Session) -> list[dict]:
    rows = db.execute(
        select(User.country, func.count(User.id).label("total"))
        .where(User.status == "active", User.country != "")
        .group_by(User.country)
    ).all()
    return [
        {"code": code.upper(), "count": int(total)}
        for code, total in sorted(rows, key=lambda row: (-row[1], row[0]))
    ]


def _activity_room(db: Session) -> Optional[Room]:
    """غرفة الأنشطة الرسمية: غرفة يديرها مشرف، وإلا فالأكثر أعضاءً."""
    official = (
        db.execute(
            select(Room)
            .join(User, User.id == Room.owner_id)
            .where(Room.status == "open", User.is_admin.is_(True))
            .order_by(Room.id.desc())
            .limit(1)
        )
        .scalars()
        .first()
    )
    if official is not None:
        return official
    return db.execute(_popular_statement().limit(1)).scalars().first()


@router.get("")
def home_page(
    tab: str = Query(default="popular"),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    if tab not in TABS:
        tab = "popular"
    hidden = _hidden_ids(db, user.id)
    rooms = _tab_rooms(db, tab, user)
    activity = _activity_room(db)
    own = _my_room(db, user.id)
    return {
        "tab": tab,
        "my_room_id": own.id if own is not None else None,
        "rooms": _rooms_payload(db, rooms, user),
        "activity_room": _rooms_payload(db, [activity], user)[0] if activity is not None else None,
        "rankings": {
            "lovers": _lovers_ranking(db, hidden),
            "honor": _ranking(db, User.royal_points, "royal_points", hidden),
            "players": _ranking(db, User.xp, "xp", hidden),
        },
        "new_users": _new_users(db, user, hidden),
        "top_users": _top_users(db, hidden),
        "countries": _countries(db),
    }
