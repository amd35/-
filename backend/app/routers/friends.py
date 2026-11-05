"""Friends, blocking and private messages."""
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy import and_, func, or_, select
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import Block, DirectMessage, Follow, FriendRequest, Friendship, User
from ..notifications import create_notification
from ..realtime import hub
from ..security import get_current_user
from ..serializers import message_public, user_public

router = APIRouter(prefix="/api", tags=["friends"])


class FriendRequestIn(BaseModel):
    username: str
    message: str = Field(default="", max_length=200)


class MessageIn(BaseModel):
    text: str = Field(min_length=1, max_length=2000)


def _is_blocked(db: Session, user_id: int, other_id: int) -> bool:
    return (
        db.execute(
            select(Block.id).where(
                or_(
                    and_(Block.user_id == user_id, Block.blocked_user_id == other_id),
                    and_(Block.user_id == other_id, Block.blocked_user_id == user_id),
                )
            )
        ).first()
        is not None
    )


@router.get("/friends")
def list_friends(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    friend_ids = [
        row.friend_id for row in db.execute(select(Friendship).where(Friendship.user_id == user.id)).scalars().all()
    ]
    friends = []
    for friend_id in friend_ids:
        friend = db.get(User, friend_id)
        if friend is None or friend.status == "deleted":
            continue
        payload = user_public(friend, online_override=hub.is_online(friend.id) or bool(friend.online))
        friends.append(payload)
    friends.sort(key=lambda item: (not item["online"], item["username"]))
    return {"friends": friends, "online": sum(1 for item in friends if item["online"])}


@router.get("/friends/requests")
def list_requests(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    incoming = (
        db.execute(
            select(FriendRequest).where(
                FriendRequest.to_user_id == user.id, FriendRequest.status == "pending"
            )
        )
        .scalars()
        .all()
    )
    outgoing = (
        db.execute(
            select(FriendRequest).where(
                FriendRequest.from_user_id == user.id, FriendRequest.status == "pending"
            )
        )
        .scalars()
        .all()
    )
    return {
        "incoming": [
            {"id": row.id, "user": user_public(db.get(User, row.from_user_id)), "message": row.message, "created_at": row.created_at.isoformat()}
            for row in incoming
        ],
        "outgoing": [
            {"id": row.id, "user": user_public(db.get(User, row.to_user_id)), "message": row.message, "created_at": row.created_at.isoformat()}
            for row in outgoing
        ],
    }


@router.post("/friends/requests", status_code=status.HTTP_201_CREATED)
def send_request(payload: FriendRequestIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    target = db.execute(select(User).where(User.username == payload.username.strip())).scalar_one_or_none()
    if target is None or target.status != "active":
        raise HTTPException(status.HTTP_404_NOT_FOUND, "المستخدم غير موجود")
    if target.id == user.id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "لا يمكن إرسال طلب لنفسك")
    if _is_blocked(db, user.id, target.id):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "لا يمكن إرسال طلب لهذا المستخدم")
    if db.execute(
        select(Friendship.id).where(Friendship.user_id == user.id, Friendship.friend_id == target.id)
    ).first():
        raise HTTPException(status.HTTP_409_CONFLICT, "أنتما صديقان بالفعل")

    reverse = db.execute(
        select(FriendRequest).where(
            FriendRequest.from_user_id == target.id,
            FriendRequest.to_user_id == user.id,
            FriendRequest.status == "pending",
        )
    ).scalar_one_or_none()
    if reverse is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, "لديك طلب صداقة وارد من هذا المستخدم، اقبله من القائمة")

    existing = db.execute(
        select(FriendRequest).where(
            FriendRequest.from_user_id == user.id,
            FriendRequest.to_user_id == target.id,
        )
    ).scalar_one_or_none()
    if existing is not None and existing.status == "pending":
        raise HTTPException(status.HTTP_409_CONFLICT, "تم إرسال الطلب مسبقاً")
    if existing is not None:
        existing.status = "pending"
        existing.message = payload.message
        request = existing
    else:
        request = FriendRequest(from_user_id=user.id, to_user_id=target.id, message=payload.message)
        db.add(request)
    db.commit()
    create_notification(
        db,
        target.id,
        "friend_request",
        "طلب صداقة جديد",
        f"{user.display_name or user.username} أرسل لك طلب صداقة",
        {"from": user.id},
    )
    db.commit()
    return {"id": request.id, "status": "pending"}


@router.post("/friends/requests/{request_id}/accept")
def accept_request(request_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    request = db.get(FriendRequest, request_id)
    if request is None or request.to_user_id != user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "الطلب غير موجود")
    if request.status != "pending":
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "تمت معالجة الطلب مسبقاً")

    request.status = "accepted"
    pairs = [(request.from_user_id, request.to_user_id), (request.to_user_id, request.from_user_id)]
    for left, right in pairs:
        if not db.execute(
            select(Friendship.id).where(Friendship.user_id == left, Friendship.friend_id == right)
        ).first():
            db.add(Friendship(user_id=left, friend_id=right))
    db.commit()
    create_notification(
        db,
        request.from_user_id,
        "friend_accepted",
        "تم قبول طلب الصداقة",
        f"{user.display_name or user.username} أصبح صديقك",
        {"user_id": user.id},
    )
    db.commit()
    return {"status": "accepted"}


@router.post("/friends/requests/{request_id}/reject")
def reject_request(request_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    request = db.get(FriendRequest, request_id)
    if request is None or request.to_user_id != user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "الطلب غير موجود")
    request.status = "rejected"
    db.commit()
    return {"status": "rejected"}


@router.delete("/friends/{friend_id}", status_code=status.HTTP_200_OK)
def remove_friend(friend_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    rows = (
        db.execute(
            select(Friendship).where(
                or_(
                    and_(Friendship.user_id == user.id, Friendship.friend_id == friend_id),
                    and_(Friendship.user_id == friend_id, Friendship.friend_id == user.id),
                )
            )
        )
        .scalars()
        .all()
    )
    for row in rows:
        db.delete(row)
    db.commit()
    return {"status": "removed"}


@router.get("/blocks")
def list_blocks(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    rows = db.execute(select(Block).where(Block.user_id == user.id)).scalars().all()
    return {"blocked": [user_public(db.get(User, row.blocked_user_id)) for row in rows]}


@router.post("/blocks", status_code=status.HTTP_201_CREATED)
def block_user(payload: dict, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    target_id = int(payload.get("user_id", 0))
    if target_id == user.id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "لا يمكن حظر نفسك")
    if db.get(User, target_id) is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "المستخدم غير موجود")
    if not db.execute(select(Block.id).where(Block.user_id == user.id, Block.blocked_user_id == target_id)).first():
        db.add(Block(user_id=user.id, blocked_user_id=target_id))
        db.commit()
    return {"status": "blocked"}


@router.delete("/blocks/{blocked_id}")
def unblock_user(blocked_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    row = db.execute(
        select(Block).where(Block.user_id == user.id, Block.blocked_user_id == blocked_id)
    ).scalar_one_or_none()
    if row is not None:
        db.delete(row)
        db.commit()
    return {"status": "unblocked"}


@router.get("/messages/threads")
def threads(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    rows = (
        db.execute(
            select(DirectMessage).where(
                or_(DirectMessage.sender_id == user.id, DirectMessage.recipient_id == user.id)
            )
        )
        .scalars()
        .all()
    )
    latest: dict[int, DirectMessage] = {}
    unread: dict[int, int] = {}
    for message in rows:
        other = message.recipient_id if message.sender_id == user.id else message.sender_id
        if other not in latest or latest[other].id < message.id:
            latest[other] = message
        if message.recipient_id == user.id and message.read_at is None:
            unread[other] = unread.get(other, 0) + 1
    payload = [
        {
            "user": user_public(db.get(User, other)),
            "last_message": message_public(message),
            "unread": unread.get(other, 0),
        }
        for other, message in sorted(latest.items(), key=lambda item: item[1].id, reverse=True)
    ]
    return {"threads": payload}


@router.get("/messages/{other_id}")
def conversation(
    other_id: int,
    limit: int = Query(default=50, ge=1, le=200),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    other = db.get(User, other_id)
    if other is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "المستخدم غير موجود")
    rows = (
        db.execute(
            select(DirectMessage)
            .where(
                or_(
                    and_(DirectMessage.sender_id == user.id, DirectMessage.recipient_id == other_id),
                    and_(DirectMessage.sender_id == other_id, DirectMessage.recipient_id == user.id),
                )
            )
            .order_by(DirectMessage.id.desc())
            .limit(limit)
        )
        .scalars()
        .all()
    )
    rows.reverse()
    for row in rows:
        if row.recipient_id == user.id and row.read_at is None:
            row.read_at = row.created_at
    db.commit()
    return {
        "user": user_public(other),
        "messages": [
            {
                **message_public(row),
                "mine": row.sender_id == user.id,
            }
            for row in rows
        ],
    }


@router.post("/messages/{other_id}", status_code=status.HTTP_201_CREATED)
def send_message(
    other_id: int,
    payload: MessageIn,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    other = db.get(User, other_id)
    if other is None or other.status != "active":
        raise HTTPException(status.HTTP_404_NOT_FOUND, "المستخدم غير موجود")
    if _is_blocked(db, user.id, other_id):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "لا يمكن إرسال رسالة إلى هذا المستخدم")

    message = DirectMessage(sender_id=user.id, recipient_id=other_id, text=payload.text.strip())
    db.add(message)
    db.commit()
    db.refresh(message)
    create_notification(
        db,
        other_id,
        "message",
        "رسالة جديدة",
        f"{user.display_name or user.username}: {payload.text.strip()[:80]}",
        {"from": user.id, "message_id": message.id},
    )
    db.commit()
    hub.notify_user(other_id, {"type": "dm", "message": {**message_public(message), "sender": user_public(user)}})
    return message_public(message)


@router.get("/friends/suggestions")
def suggestions(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    friend_ids = set(
        row.friend_id for row in db.execute(select(Friendship).where(Friendship.user_id == user.id)).scalars().all()
    )
    candidates = (
        db.execute(select(User).where(User.status == "active", User.id != user.id).order_by(User.xp.desc()).limit(40))
        .scalars()
        .all()
    )
    blocked = set(row.blocked_user_id for row in db.execute(select(Block).where(Block.user_id == user.id)).scalars().all())
    # حالة المتابعة تُحسب هنا بجملة واحدة (لا استعلام لكل مقترح) ليظهر زر المتابعة صحيحًا.
    followed_ids = set(
        db.execute(select(Follow.followed_user_id).where(Follow.user_id == user.id)).scalars().all()
    )
    out = []
    for candidate in candidates:
        if candidate.id in friend_ids or candidate.id in blocked:
            continue
        payload = user_public(candidate)
        payload["following"] = candidate.id in followed_ids
        out.append(payload)
    return {"users": out[:12]}
