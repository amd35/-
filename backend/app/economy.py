"""Wallet / gold / diamonds movements.

Every balance change happens here, inside one database transaction, with the
wallet row locked (``SELECT ... FOR UPDATE``) and a ledger row written. Rows
carry a unique ``ref`` so a repeated request can never move money twice.
"""
import uuid
from typing import Iterable, Optional

from . import inventory, royal

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from .models import (
    Gift,
    GiftTransaction,
    LedgerEntry,
    RechargeOrder,
    StoreItem,
    User,
    UserItem,
    Wallet,
    WithdrawRequest,
    utcnow,
)
from .settings_store import get_setting

CURRENCIES = ("gold", "diamonds")

# كل عملة تحمل اسم عمودها في جدول المحافظ، واسمها العربي في الرسائل.
CURRENCY_LABELS = {"gold": "ذهب", "diamonds": "ماس"}


def _field(currency: str) -> str:
    if currency not in CURRENCIES:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Unknown currency: {currency}")
    return currency


def insufficient(currency: str, needed: int, available: int) -> HTTPException:
    label = CURRENCY_LABELS.get(currency, currency)
    return HTTPException(
        status.HTTP_400_BAD_REQUEST,
        f"الرصيد غير كافٍ من {label}: المطلوب {needed} والمتوفر {available}",
    )


def get_wallet(db: Session, user_id: int, lock: bool = False) -> Wallet:
    statement = select(Wallet).where(Wallet.user_id == user_id)
    if lock:
        statement = statement.with_for_update()
    wallet = db.execute(statement).scalar_one_or_none()
    if wallet is None:
        wallet = Wallet(user_id=user_id, gold=0, diamonds=0)
        db.add(wallet)
        db.flush()
    return wallet


def _locked_wallets(db: Session, user_ids: Iterable[int]) -> dict[int, Wallet]:
    """Lock wallets in a stable order so two transfers cannot deadlock."""
    wallets: dict[int, Wallet] = {}
    for user_id in sorted({int(uid) for uid in user_ids}):
        wallets[user_id] = get_wallet(db, user_id, lock=True)
    return wallets


def _move(
    db: Session,
    wallet: Wallet,
    currency: str,
    amount: int,
    kind: str,
    ref: Optional[str],
    note: str = "",
    counterparty_id: Optional[int] = None,
) -> LedgerEntry:
    field = _field(currency)
    if amount == 0:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Amount must not be zero")
    balance = getattr(wallet, field)
    new_balance = balance + amount
    if new_balance < 0:
        raise insufficient(currency, abs(amount), balance)
    setattr(wallet, field, new_balance)
    wallet.updated_at = utcnow()
    entry = LedgerEntry(
        user_id=wallet.user_id,
        currency=currency,
        amount=amount,
        balance_after=new_balance,
        kind=kind,
        ref=ref,
        note=note,
        counterparty_id=counterparty_id,
    )
    db.add(entry)
    try:
        db.flush()
    except IntegrityError:
        # The same movement already exists: never apply it twice.
        db.rollback()
        raise HTTPException(status.HTTP_409_CONFLICT, "هذه العملية مسجلة مسبقاً")
    return entry


def wallet_balances(db: Session, user_id: int) -> Wallet:
    return get_wallet(db, user_id)


def transfer(
    db: Session,
    sender: User,
    recipient: User,
    currency: str,
    amount: int,
    idempotency_key: Optional[str] = None,
) -> LedgerEntry:
    if amount <= 0:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Amount must be positive")
    if sender.id == recipient.id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "لا يمكن التحويل إلى نفس الحساب")

    ref_out = f"transfer:{sender.id}:{idempotency_key or uuid.uuid4().hex}"
    existing = db.execute(select(LedgerEntry).where(LedgerEntry.ref == ref_out)).scalar_one_or_none()
    if existing is not None:
        return existing

    wallets = _locked_wallets(db, [sender.id, recipient.id])
    _move(
        db,
        wallets[sender.id],
        currency,
        -amount,
        "transfer_out",
        ref=ref_out,
        note=f"تحويل إلى {recipient.username}",
        counterparty_id=recipient.id,
    )
    entry = _move(
        db,
        wallets[recipient.id],
        currency,
        amount,
        "transfer_in",
        ref=f"transfer:{sender.id}:{recipient.id}:{ref_out.split(':')[-1]}",
        note=f"تحويل من {sender.username}",
        counterparty_id=sender.id,
    )
    db.commit()
    return entry


def send_gift(
    db: Session,
    sender: User,
    gift: Gift,
    currency: str,
    receiver: Optional[User],
    room_id: Optional[int],
    idempotency_key: str,
) -> tuple[GiftTransaction, bool]:
    """Returns (transaction, created). A replayed key returns the original row."""
    if not gift.active:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "هذه الهدية غير متاحة حالياً")

    existing = db.execute(
        select(GiftTransaction).where(GiftTransaction.idempotency_key == idempotency_key)
    ).scalar_one_or_none()
    if existing is not None:
        return existing, False

    price = gift.price_diamonds if currency == "diamonds" else gift.price_gold
    if price <= 0:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "هذه الهدية غير متاحة بهذه العملة")

    receiver_amount = 0
    if receiver is not None:
        share = int(get_setting(db, "gift_receiver_share_percent", 60))
        receiver_amount = int(price * share / 100)
    elif room_id is not None:
        share = int(get_setting(db, "room_gift_receiver_share_percent", 0))
        receiver_amount = int(price * share / 100)

    participant_ids = [sender.id] + ([receiver.id] if receiver is not None else [])
    wallets = _locked_wallets(db, participant_ids)
    if getattr(wallets[sender.id], _field(currency)) < price:
        raise insufficient(currency, price, getattr(wallets[sender.id], _field(currency)))

    transaction = GiftTransaction(
        gift_id=gift.id,
        sender_id=sender.id,
        receiver_id=receiver.id if receiver else None,
        room_id=room_id,
        currency=currency,
        amount=price,
        receiver_amount=receiver_amount,
        idempotency_key=idempotency_key,
    )
    db.add(transaction)
    try:
        db.flush()
    except IntegrityError:
        db.rollback()
        existing = db.execute(
            select(GiftTransaction).where(GiftTransaction.idempotency_key == idempotency_key)
        ).scalar_one_or_none()
        if existing is None:
            raise HTTPException(status.HTTP_409_CONFLICT, "تعذر تسجيل الهدية")
        return existing, False

    _move(
        db,
        wallets[sender.id],
        currency,
        -price,
        "gift_sent",
        ref=f"gift:{transaction.id}:sender",
        note=f"إرسال هدية: {gift.name}",
        counterparty_id=receiver.id if receiver else None,
    )
    if receiver is not None and receiver_amount > 0:
        _move(
            db,
            wallets[receiver.id],
            currency,
            receiver_amount,
            "gift_received",
            ref=f"gift:{transaction.id}:receiver",
            note=f"هدية مستلمة: {gift.name}",
            counterparty_id=sender.id,
        )
    db.commit()
    return transaction, True


def credit_recharge_order(db: Session, order: RechargeOrder, note: str = "") -> Optional[LedgerEntry]:
    """Credit a paid order exactly once (the ledger ref makes it idempotent).

    A gold or diamonds pack also carries royal points; both movements happen in the same
    transaction and each carries its own unique ref, so a repeated webhook can
    never double-credit them.
    """
    reference = f"order:{order.id}"
    existing = db.execute(select(LedgerEntry).where(LedgerEntry.ref == reference)).scalar_one_or_none()
    if existing is not None:
        if order.status != "paid":
            order.status = "paid"
            db.commit()
        return existing

    wallet = get_wallet(db, order.user_id, lock=True)
    entry = _move(
        db,
        wallet,
        order.currency,
        order.amount,
        "recharge",
        ref=reference,
        note=note or f"شحن الطلب #{order.id}",
    )
    if order.royal_points:
        royal.add_points(
            db,
            order.user_id,
            order.royal_points,
            ref=f"order:{order.id}:royal",
            kind="recharge",
            note=note or f"نقاط رويال للطلب #{order.id}",
        )
    order.status = "paid"
    db.commit()
    return entry


def create_withdraw_request(
    db: Session,
    user: User,
    currency: str,
    amount: int,
    method: str,
    beneficiary: dict,
    idempotency_key: str,
    payout_currency: str = "IQD",
) -> WithdrawRequest:
    if not get_setting(db, "withdrawal_enabled", False):
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "السحب غير مفعّل حالياً. يتم تفعيله من لوحة الإدارة بعد ربط مزود الدفع.",
        )
    minimum = int(get_setting(db, "withdrawal_min_diamonds", 50000))
    if amount < minimum:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            f"الحد الأدنى للسحب {minimum}",
        )
    fee_percent = int(get_setting(db, "withdrawal_fee_percent", 10))
    fee = int(amount * fee_percent / 100)

    request = WithdrawRequest(
        user_id=user.id,
        currency=currency,
        amount=amount,
        fee=fee,
        net_amount=amount - fee,
        payout_currency=payout_currency,
        method=method,
        beneficiary=beneficiary,
        idempotency_key=idempotency_key,
    )
    db.add(request)
    try:
        db.flush()
    except IntegrityError:
        db.rollback()
        existing = db.execute(
            select(WithdrawRequest).where(WithdrawRequest.idempotency_key == idempotency_key)
        ).scalar_one_or_none()
        if existing is None:
            raise HTTPException(status.HTTP_409_CONFLICT, "تعذر تسجيل الطلب")
        return existing

    wallets = _locked_wallets(db, [user.id])
    _move(
        db,
        wallets[user.id],
        currency,
        -amount,
        "withdrawal",
        ref=f"withdrawal:{request.id}:hold",
        note=f"طلب سحب #{request.id}",
    )
    db.commit()
    return request


def settle_withdraw_request(db: Session, request: WithdrawRequest, approve: bool, note: str = "") -> WithdrawRequest:
    if request.status not in {"pending"}:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "تمت معالجة الطلب مسبقاً")
    if approve:
        request.status = "approved"
    else:
        request.status = "rejected"
        wallets = _locked_wallets(db, [request.user_id])
        _move(
            db,
            wallets[request.user_id],
            request.currency,
            request.amount,
            "withdrawal_refund",
            ref=f"withdrawal:{request.id}:refund",
            note=f"إرجاع مبلغ طلب مرفوض #{request.id}",
        )
    request.admin_note = note
    db.commit()
    return request


def admin_adjust(db: Session, user: User, currency: str, amount: int, note: str) -> LedgerEntry:
    wallets = _locked_wallets(db, [user.id])
    entry = _move(
        db,
        wallets[user.id],
        currency,
        amount,
        "admin_adjust",
        ref=f"admin:{uuid.uuid4().hex}",
        note=note,
    )
    db.commit()
    return entry


def purchase_item(
    db: Session, user: User, item: StoreItem, currency: str
) -> tuple[UserItem, Optional[LedgerEntry], bool]:
    """Buy a store cosmetic with diamonds/gold; returns (inventory row, entry, created).

    The item is permanent, so ``item:<user>:<item>`` is its own unique ref: a
    repeated request returns the stored rows instead of charging twice.
    """
    if not item.active:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "هذا العنصر غير متاح حالياً")

    field = _field(currency)
    price = item.price_diamonds if field == "diamonds" else item.price_gold
    if price <= 0:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "هذا العنصر غير متاح بهذه العملة")

    reference = f"item:{user.id}:{item.id}"
    owned = db.execute(
        select(UserItem).where(UserItem.user_id == user.id, UserItem.item_id == item.id)
    ).scalar_one_or_none()
    if owned is not None:
        entry = db.execute(select(LedgerEntry).where(LedgerEntry.ref == reference)).scalar_one_or_none()
        return owned, entry, False

    wallet = _locked_wallets(db, [user.id])[user.id]
    entry = _move(db, wallet, currency, -price, "store_item", ref=reference, note=f"شراء {item.name}")
    ownership = inventory.equip(db, user.id, item, create=True)
    db.commit()
    db.refresh(ownership)
    return ownership, entry, True


def grant_reward(db: Session, user: User, currency: str, amount: int, note: str, ref: str) -> Optional[LedgerEntry]:
    existing = db.execute(select(LedgerEntry).where(LedgerEntry.ref == ref)).scalar_one_or_none()
    if existing is not None:
        return None
    wallets = _locked_wallets(db, [user.id])
    entry = _move(db, wallets[user.id], currency, amount, "reward", ref=ref, note=note)
    db.commit()
    return entry
