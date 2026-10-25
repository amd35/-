"""Store: coin/gold packs, offers and the purchase entry point.

A purchase only creates a pending order. Coins are added after the payment
provider confirms the payment (webhook) or an administrator approves the order
in the admin panel — never from the client alone.
"""
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..config import settings
from ..db import get_db
from ..models import RechargeOrder, StorePack, User
from ..security import get_current_user
from ..serializers import order_public, pack_public
from ..settings_store import all_settings, get_setting
from .wallet import _payment_status

router = APIRouter(prefix="/api/store", tags=["store"])


class PurchaseIn(BaseModel):
    price_currency: str = "IQD"
    idempotency_key: Optional[str] = Field(default=None, max_length=96)


@router.get("")
def store(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    packs = (
        db.execute(select(StorePack).where(StorePack.active.is_(True)).order_by(StorePack.sort, StorePack.id))
        .scalars()
        .all()
    )
    values = all_settings(db)
    return {
        "packs": [pack_public(pack) for pack in packs],
        "offers": values["offers"],
        "ads": values["ads"],
        "exchange_rate_usd_iqd": values["exchange_rate_usd_iqd"],
        "supported_currencies": values["supported_currencies"],
        "currency_default": values["currency_default"],
        "vip": {
            "price_coins": int(get_setting(db, "vip_price_coins", 5000)),
            "days": int(get_setting(db, "vip_days", 30)),
            "benefits": values["vip_benefits"],
        },
        "payment": _payment_status(),
    }


@router.post("/packs/{pack_id}/purchase", status_code=status.HTTP_201_CREATED)
def purchase(
    pack_id: int,
    payload: PurchaseIn,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    pack = db.get(StorePack, pack_id)
    if pack is None or not pack.active:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "الباقة غير متاحة")

    price_currency = payload.price_currency if payload.price_currency in {"IQD", "USD"} else "IQD"
    price_amount = pack.price_iqd if price_currency == "IQD" else pack.price_usd_cents
    key = (payload.idempotency_key or "").strip() or f"pack:{pack.id}:{user.id}:{int(user.last_seen_at.timestamp())}"

    existing = db.execute(select(RechargeOrder).where(RechargeOrder.idempotency_key == key)).scalar_one_or_none()
    if existing is not None:
        return {"order": order_public(existing), "payment": _payment_status()}

    order = RechargeOrder(
        user_id=user.id,
        pack_id=pack.id,
        currency=pack.kind,
        amount=pack.amount + pack.bonus,
        price_amount=price_amount,
        price_currency=price_currency,
        provider="stripe",
        status="pending",
        idempotency_key=key,
    )
    db.add(order)
    db.commit()
    db.refresh(order)
    return {
        "order": order_public(order),
        "pack": pack_public(pack),
        "payment": _payment_status(),
        "stripe_supported_currency": "USD",
        "note": (
            "Stripe لا يدعم الدفع بالدينار العراقي؛ يتم عرض السعر بالدينار وتحويله إلى الدولار "
            "بسعر الصرف المعتمد من لوحة الإدارة عند الدفع."
            if price_currency == "IQD"
            else "يتم الدفع بالدولار الأمريكي."
        ),
    }


@router.get("/purchases")
def purchases(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    rows = (
        db.execute(
            select(RechargeOrder).where(RechargeOrder.user_id == user.id).order_by(RechargeOrder.id.desc())
        )
        .scalars()
        .all()
    )
    return {"orders": [order_public(order) for order in rows], "payment": _payment_status()}
