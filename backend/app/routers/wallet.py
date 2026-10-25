"""Wallet: balances, ledger, transfers, recharge orders and withdrawals."""
import uuid
from typing import Optional

from fastapi import APIRouter, Depends, Header, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import royal
from ..config import settings
from ..db import get_db
from ..economy import (
    CURRENCIES,
    create_withdraw_request,
    get_wallet,
    settle_withdraw_request,
    transfer as ledger_transfer,
)
from ..models import LedgerEntry, RechargeOrder, StorePack, User, WithdrawRequest
from ..notifications import create_notification
from ..security import get_current_user
from ..serializers import ledger_public, order_public, user_public, wallet_public, withdrawal_public
from ..settings_store import get_setting

router = APIRouter(prefix="/api/wallet", tags=["wallet"])


class TransferIn(BaseModel):
    to_username: str
    currency: str = "diamonds"
    amount: int = Field(gt=0)
    idempotency_key: Optional[str] = Field(default=None, max_length=96)


class RechargeIn(BaseModel):
    pack_id: Optional[int] = None
    currency: Optional[str] = None
    amount: Optional[int] = None
    price_amount: Optional[int] = None
    price_currency: str = "IQD"
    idempotency_key: Optional[str] = Field(default=None, max_length=96)


class WithdrawIn(BaseModel):
    currency: str = "diamonds"
    amount: int = Field(gt=0)
    method: str = Field(min_length=2, max_length=32)
    payout_currency: str = "IQD"
    beneficiary: dict = {}
    idempotency_key: Optional[str] = Field(default=None, max_length=96)


@router.get("")
def wallet(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    wallet_row = get_wallet(db, user.id)
    recent = (
        db.execute(
            select(LedgerEntry).where(LedgerEntry.user_id == user.id).order_by(LedgerEntry.id.desc()).limit(10)
        )
        .scalars()
        .all()
    )
    return {
        "wallet": wallet_public(wallet_row),
        "recent": [ledger_public(entry) for entry in recent],
        # نظام رويال بديل نظام التاج القديم: المستوى والنقاط من الخادم فقط.
        "royal": royal.status_for(db, user),
        "withdrawal": {
            "enabled": bool(get_setting(db, "withdrawal_enabled", False)),
            "minimum": int(get_setting(db, "withdrawal_min_diamonds", 50000)),
            "fee_percent": int(get_setting(db, "withdrawal_fee_percent", 10)),
            "exchange_rate_usd_iqd": int(get_setting(db, "exchange_rate_usd_iqd", 1320)),
        },
    }


@router.get("/ledger")
def ledger(
    currency: Optional[str] = None,
    kind: Optional[str] = None,
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    statement = select(LedgerEntry).where(LedgerEntry.user_id == user.id)
    if currency in CURRENCIES:
        statement = statement.where(LedgerEntry.currency == currency)
    if kind:
        statement = statement.where(LedgerEntry.kind == kind)
    rows = db.execute(statement.order_by(LedgerEntry.id.desc()).offset(offset).limit(limit)).scalars().all()
    return {"entries": [ledger_public(entry) for entry in rows]}


@router.post("/transfer", status_code=status.HTTP_201_CREATED)
def transfer(
    payload: TransferIn,
    idempotency_key: Optional[str] = Header(default=None, alias="Idempotency-Key"),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    recipient = db.execute(select(User).where(User.username == payload.to_username.strip())).scalar_one_or_none()
    if recipient is None or recipient.status != "active":
        raise HTTPException(status.HTTP_404_NOT_FOUND, "المستخدم غير موجود")
    key = (payload.idempotency_key or idempotency_key or uuid.uuid4().hex).strip()
    entry = ledger_transfer(db, user, recipient, payload.currency, payload.amount, key)
    create_notification(
        db,
        recipient.id,
        "account",
        "تحويل وارد",
        f"استلمت {payload.amount} {'ذهب' if payload.currency == 'gold' else 'ماس'} من {user.username}",
        {"from": user.id, "amount": payload.amount, "currency": payload.currency},
    )
    db.commit()
    return {
        "entry": ledger_public(entry),
        "wallet": wallet_public(get_wallet(db, user.id)),
        "recipient": user_public(recipient),
    }


@router.post("/recharge-orders", status_code=status.HTTP_201_CREATED)
def create_recharge_order(
    payload: RechargeIn,
    idempotency_key: Optional[str] = Header(default=None, alias="Idempotency-Key"),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Create a pending order. Nothing is credited until a payment is verified."""
    pack: Optional[StorePack] = None
    if payload.pack_id is not None:
        pack = db.get(StorePack, payload.pack_id)
        if pack is None or not pack.active:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "الباقة غير متاحة")
        currency = pack.kind
        amount = pack.amount + pack.bonus
        price_currency = payload.price_currency if payload.price_currency in {"IQD", "USD"} else "IQD"
        price_amount = pack.price_iqd if price_currency == "IQD" else pack.price_usd_cents
    else:
        if payload.currency not in CURRENCIES or not payload.amount or payload.amount <= 0:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "حدد الباقة أو الكمية والعملة")
        currency = payload.currency
        amount = payload.amount
        price_currency = payload.price_currency if payload.price_currency in {"IQD", "USD"} else "IQD"
        if not payload.price_amount or payload.price_amount <= 0:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "حدد السعر المطلوب")
        price_amount = payload.price_amount

    key = (payload.idempotency_key or idempotency_key or uuid.uuid4().hex).strip()
    existing = db.execute(
        select(RechargeOrder).where(RechargeOrder.idempotency_key == key)
    ).scalar_one_or_none()
    if existing is not None:
        return {"order": order_public(existing), "payment": _payment_status()}

    order = RechargeOrder(
        user_id=user.id,
        pack_id=pack.id if pack else None,
        currency=currency,
        amount=amount,
        price_amount=price_amount,
        price_currency=price_currency,
        provider="stripe",
        status="pending",
        idempotency_key=key,
    )
    db.add(order)
    db.commit()
    db.refresh(order)
    return {"order": order_public(order), "payment": _payment_status()}


def _payment_status() -> dict:
    return {
        "configured": settings.payments_configured,
        "message": (
            "طلبك بانتظار تأكيد الدفع من مزود الدفع."
            if settings.payments_configured
            else "لم يتم إعداد مزود الدفع بعد، لذلك يبقى الطلب معلّقاً ولا يُضاف أي رصيد. أضف مفاتيح Stripe لتفعيل الشحن."
        ),
    }


@router.get("/recharge-orders")
def my_orders(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    rows = (
        db.execute(
            select(RechargeOrder).where(RechargeOrder.user_id == user.id).order_by(RechargeOrder.id.desc())
        )
        .scalars()
        .all()
    )
    return {"orders": [order_public(order) for order in rows], "payment": _payment_status()}


@router.post("/recharge-orders/{order_id}/cancel")
def cancel_order(order_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    order = db.get(RechargeOrder, order_id)
    if order is None or order.user_id != user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "الطلب غير موجود")
    if order.status != "pending":
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "لا يمكن إلغاء هذا الطلب")
    order.status = "cancelled"
    db.commit()
    return {"order": order_public(order)}


@router.post("/withdrawals", status_code=status.HTTP_201_CREATED)
def create_withdrawal(
    payload: WithdrawIn,
    idempotency_key: Optional[str] = Header(default=None, alias="Idempotency-Key"),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not payload.beneficiary:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "أدخل بيانات المستفيد")
    key = (payload.idempotency_key or idempotency_key or uuid.uuid4().hex).strip()
    request = create_withdraw_request(
        db,
        user,
        payload.currency,
        payload.amount,
        payload.method,
        payload.beneficiary,
        key,
        payload.payout_currency,
    )
    return {
        "request": withdrawal_public(request),
        "wallet": wallet_public(get_wallet(db, user.id)),
        "note": "الطلب بانتظار مراجعة الإدارة. لا يتم أي تحويل نقدي تلقائياً.",
    }


@router.get("/withdrawals")
def my_withdrawals(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    rows = (
        db.execute(
            select(WithdrawRequest).where(WithdrawRequest.user_id == user.id).order_by(WithdrawRequest.id.desc())
        )
        .scalars()
        .all()
    )
    return {"requests": [withdrawal_public(row) for row in rows]}


@router.post("/withdrawals/{request_id}/cancel")
def cancel_withdrawal(request_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    request = db.get(WithdrawRequest, request_id)
    if request is None or request.user_id != user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "الطلب غير موجود")
    settle_withdraw_request(db, request, approve=False, note="إلغاء من المستخدم")
    return {"request": withdrawal_public(request), "wallet": wallet_public(get_wallet(db, user.id))}
