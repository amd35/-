"""Gift catalogue and gift sending (server confirmed, idempotent)."""
from typing import Optional

from fastapi import APIRouter, Depends, Header, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..db import get_db
from ..economy import get_wallet, send_gift
from ..models import Gift, GiftTransaction, Room, User
from ..notifications import create_notification
from ..realtime import hub
from ..room_service import require_member, require_room
from ..security import get_current_user
from ..serializers import gift_public, user_public, wallet_public

router = APIRouter(prefix="/api/gifts", tags=["gifts"])


class SendGiftIn(BaseModel):
    gift_id: int
    currency: str = "coins"
    receiver_id: Optional[int] = None
    room_id: Optional[int] = None
    idempotency_key: Optional[str] = Field(default=None, max_length=96)


@router.get("")
def list_gifts(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    gifts = db.execute(select(Gift).where(Gift.active.is_(True)).order_by(Gift.sort, Gift.id)).scalars().all()
    grouped: dict[str, list] = {"normal": [], "premium": [], "luxury": []}
    for gift in gifts:
        grouped.setdefault(gift.category, []).append(gift_public(gift))
    return {"groups": grouped, "gifts": [gift_public(gift) for gift in gifts]}


@router.post("/send", status_code=status.HTTP_201_CREATED)
def send(
    payload: SendGiftIn,
    idempotency_key: Optional[str] = Header(default=None, alias="Idempotency-Key"),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    gift = db.get(Gift, payload.gift_id)
    if gift is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "الهدية غير موجودة")

    key = (payload.idempotency_key or idempotency_key or "").strip()
    if not key:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "مطلوب معرف فريد للعملية (Idempotency-Key) لمنع تكرار الخصم",
        )

    receiver = None
    if payload.receiver_id is not None:
        if gift.target == "room":
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "هذه الهدية مخصصة للغرف فقط")
        receiver = db.get(User, payload.receiver_id)
        if receiver is None or receiver.status != "active":
            raise HTTPException(status.HTTP_404_NOT_FOUND, "المستلم غير موجود")
        if receiver.privacy and receiver.privacy.get("allow_gifts") is False:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "المستلم لا يستقبل الهدايا حالياً")
    elif payload.room_id is not None:
        if gift.target == "user":
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "هذه الهدية مخصصة للمستخدمين فقط")
    else:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "حدد المستلم أو الغرفة")

    room = None
    if payload.room_id is not None:
        room = require_room(db, payload.room_id)
        require_member(db, room, user)
        if not room.gifts_enabled:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "الهدايا معطلة في هذه الغرفة")

    transaction, created = send_gift(db, user, gift, payload.currency, receiver, room.id if room else None, key)
    wallet = get_wallet(db, user.id)

    if created:
        if receiver is not None:
            create_notification(
                db,
                receiver.id,
                "gift",
                "استلمت هدية",
                f"{user.display_name or user.username} أرسل لك {gift.name}",
                {"gift_id": gift.id, "from": user.id, "amount": transaction.receiver_amount},
            )
            db.commit()
        if room is not None:
            hub.notify_room(
                room.id,
                {
                    "type": "gift",
                    "room_id": room.id,
                    "gift": gift_public(gift),
                    "sender": user_public(user),
                    "receiver": user_public(receiver) if receiver else None,
                    "amount": transaction.amount,
                    "currency": transaction.currency,
                },
            )

    return {
        "created": created,
        "transaction": {
            "id": transaction.id,
            "gift": gift_public(gift),
            "sender_id": transaction.sender_id,
            "receiver_id": transaction.receiver_id,
            "room_id": transaction.room_id,
            "currency": transaction.currency,
            "amount": transaction.amount,
            "receiver_amount": transaction.receiver_amount,
            "created_at": transaction.created_at.isoformat(),
        },
        "wallet": wallet_public(wallet),
    }


@router.get("/history")
def history(
    direction: str = Query(default="all"),
    limit: int = Query(default=30, ge=1, le=100),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    statement = select(GiftTransaction)
    if direction == "sent":
        statement = statement.where(GiftTransaction.sender_id == user.id)
    elif direction == "received":
        statement = statement.where(GiftTransaction.receiver_id == user.id)
    else:
        statement = statement.where(
            (GiftTransaction.sender_id == user.id) | (GiftTransaction.receiver_id == user.id)
        )
    rows = db.execute(statement.order_by(GiftTransaction.id.desc()).limit(limit)).scalars().all()
    return {
        "transactions": [
            {
                "id": row.id,
                "gift": gift_public(db.get(Gift, row.gift_id)),
                "sender": user_public(db.get(User, row.sender_id)) if db.get(User, row.sender_id) else None,
                "receiver": user_public(db.get(User, row.receiver_id)) if row.receiver_id and db.get(User, row.receiver_id) else None,
                "room_id": row.room_id,
                "currency": row.currency,
                "amount": row.amount,
                "receiver_amount": row.receiver_amount,
                "direction": "sent" if row.sender_id == user.id else "received",
                "created_at": row.created_at.isoformat(),
            }
            for row in rows
        ]
    }
