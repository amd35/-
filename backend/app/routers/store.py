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

from .. import inventory, royal
from ..config import settings
from ..db import get_db
from ..economy import get_wallet, purchase_item
from ..models import RechargeOrder, StorePack, User
from ..security import get_current_user
from ..serializers import item_public, ledger_public, order_public, pack_public, wallet_public
from ..settings_store import all_settings
from .wallet import _payment_status

router = APIRouter(prefix="/api/store", tags=["store"])


class PurchaseIn(BaseModel):
    price_currency: str = "IQD"
    idempotency_key: Optional[str] = Field(default=None, max_length=96)


class ItemBuyIn(BaseModel):
    currency: str = "coins"


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
        # نظام رويال هو نظام المستويات الوحيد الآن (لا عضوية تاج/VIP قديمة).
        "royal": royal.status_for(db, user),
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
        royal_points=pack.royal_points or 0,
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


@router.get("/cosmetics")
def cosmetics(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Dice (and board) cosmetics on sale, with this user's wallet and ownership."""
    items = inventory.active_items(db)
    owned = inventory.owned_map(db, user.id)
    return {
        "items": [item_public(item, owned.get(item.id)) for item in items],
        "balances": wallet_public(get_wallet(db, user.id)),
    }


@router.post("/cosmetics/{item_id}/purchase", status_code=status.HTTP_201_CREATED)
def buy_cosmetic(
    item_id: int,
    payload: ItemBuyIn,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Buy a cosmetic with coins/gold: the wallet is debited and the item is stored."""
    item = inventory.get_item(db, item_id)
    currency = payload.currency if payload.currency in {"coins", "gold"} else "coins"
    ownership, entry, created = purchase_item(db, user, item, currency)
    return {
        "item": item_public(item, ownership),
        "ledger": ledger_public(entry) if entry is not None else None,
        "balances": wallet_public(get_wallet(db, user.id)),
        "created": created,
    }


@router.post("/cosmetics/{item_id}/equip")
def equip_cosmetic(item_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Equip an owned cosmetic; only one item per kind stays equipped."""
    item = inventory.get_item(db, item_id)
    ownership = inventory.equip(db, user.id, item)
    db.commit()
    return {"item": item_public(item, ownership)}
