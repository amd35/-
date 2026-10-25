"""Administrator API.

Every route depends on ``get_admin_user`` (server-side check of the admin flag
and role) and on a per-role permission. Hiding buttons in the panel is not a
security boundary; these checks are.
"""
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from ..config import settings
from ..db import get_db
from ..economy import admin_adjust, credit_recharge_order, get_wallet, settle_withdraw_request
from ..models import (
    AppSetting,
    AuditLog,
    Gift,
    LedgerEntry,
    Notification,
    RechargeOrder,
    Report,
    Room,
    StorePack,
    User,
    WithdrawRequest,
    utcnow,
)
from ..notifications import create_notification
from ..security import get_admin_user
from ..serializers import (
    audit_public,
    gift_public,
    ledger_public,
    order_public,
    pack_public,
    report_public,
    user_private,
    wallet_public,
    withdrawal_public,
)
from ..settings_store import DEFAULTS, all_settings, get_setting, set_setting

router = APIRouter(prefix="/api/admin", tags=["admin"])

ROLE_PERMISSIONS: dict[str, set[str]] = {
    "owner": {"*"},
    "admin": {
        "stats", "users", "users_sensitive", "rooms", "gifts", "store", "orders",
        "withdrawals", "reports", "broadcast", "audit", "ledger", "settings",
    },
    "moderator": {"stats", "users", "rooms", "gifts", "reports", "audit", "ledger"},
    "support": {"stats", "users", "reports", "audit"},
}


def require_permission(user: User, permission: str) -> None:
    permissions = ROLE_PERMISSIONS.get(user.admin_role, set())
    if "*" in permissions or permission in permissions:
        return
    raise HTTPException(status.HTTP_403_FORBIDDEN, f"الصلاحية المطلوبة غير متوفرة: {permission}")


def audit(db: Session, actor: User, action: str, target_type: str = "", target_id: str = "", details: dict | None = None) -> None:
    db.add(
        AuditLog(
            actor_id=actor.id,
            action=action,
            target_type=target_type,
            target_id=str(target_id),
            details=details or {},
        )
    )


class UserPatch(BaseModel):
    status: Optional[str] = None
    is_admin: Optional[bool] = None
    admin_role: Optional[str] = None
    vip_days: Optional[int] = None
    display_name: Optional[str] = None
    note: str = ""


class WalletPatch(BaseModel):
    currency: str = "coins"
    amount: int
    note: str = Field(min_length=2, max_length=200)


class RoomPatch(BaseModel):
    status: Optional[str] = None
    gifts_enabled: Optional[bool] = None
    chat_enabled: Optional[bool] = None
    seat_count: Optional[int] = Field(default=None, ge=4, le=24)
    name: Optional[str] = None


class GiftIn(BaseModel):
    name: str
    name_en: str = ""
    category: str = "normal"
    emoji: str = "🎁"
    animation: str = "pulse"
    price_coins: int = 0
    price_gold: int = 0
    target: str = "both"
    active: bool = True
    sort: int = 0


class GiftPatch(BaseModel):
    name: Optional[str] = None
    name_en: Optional[str] = None
    category: Optional[str] = None
    emoji: Optional[str] = None
    animation: Optional[str] = None
    price_coins: Optional[int] = None
    price_gold: Optional[int] = None
    target: Optional[str] = None
    active: Optional[bool] = None
    sort: Optional[int] = None


class PackIn(BaseModel):
    kind: str
    name: str
    amount: int
    bonus: int = 0
    price_iqd: int = 0
    price_usd_cents: int = 0
    badge: str = ""
    active: bool = True
    sort: int = 0


class PackPatch(BaseModel):
    name: Optional[str] = None
    amount: Optional[int] = None
    bonus: Optional[int] = None
    price_iqd: Optional[int] = None
    price_usd_cents: Optional[int] = None
    badge: Optional[str] = None
    active: Optional[bool] = None
    sort: Optional[int] = None


class SettingsPatch(BaseModel):
    settings: dict


class BroadcastIn(BaseModel):
    title: str = Field(min_length=2, max_length=120)
    body: str = Field(default="", max_length=500)
    segment: str = "all"  # all|online|vip|admins


class ReportPatch(BaseModel):
    status: str
    action: Optional[str] = None  # none|ban_user|close_room
    note: str = ""


class OrderDecision(BaseModel):
    note: str = ""


@router.get("/me")
def me(user: User = Depends(get_admin_user)):
    permissions = ROLE_PERMISSIONS.get(user.admin_role, set())
    return {
        "user": user_private(user),
        "role": user.admin_role,
        "permissions": sorted(permissions),
    }


@router.get("/stats")
def stats(user: User = Depends(get_admin_user), db: Session = Depends(get_db)):
    require_permission(user, "stats")
    day_start = utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
    paid_orders = db.execute(select(RechargeOrder).where(RechargeOrder.status == "paid")).scalars().all()
    revenue_iqd = sum(order.price_amount for order in paid_orders if order.price_currency == "IQD")
    revenue_usd = sum(order.price_amount for order in paid_orders if order.price_currency == "USD")
    return {
        "users": {
            "total": int(db.execute(select(func.count(User.id))).scalar() or 0),
            "active": int(db.execute(select(func.count(User.id)).where(User.status == "active")).scalar() or 0),
            "banned": int(db.execute(select(func.count(User.id)).where(User.status == "banned")).scalar() or 0),
            "new_today": int(
                db.execute(select(func.count(User.id)).where(User.created_at >= day_start)).scalar() or 0
            ),
            "online": int(db.execute(select(func.count(User.id)).where(User.online.is_(True))).scalar() or 0),
            "vip": int(
                db.execute(select(func.count(User.id)).where(User.vip_until.is_not(None), User.vip_until > utcnow())).scalar()
                or 0
            ),
        },
        "rooms": {
            "total": int(db.execute(select(func.count(Room.id))).scalar() or 0),
            "open": int(db.execute(select(func.count(Room.id)).where(Room.status == "open")).scalar() or 0),
        },
        "orders": {
            "pending": int(
                db.execute(select(func.count(RechargeOrder.id)).where(RechargeOrder.status == "pending")).scalar() or 0
            ),
            "paid": len(paid_orders),
            "revenue_iqd": revenue_iqd,
            "revenue_usd_cents": revenue_usd,
        },
        "withdrawals": {
            "pending": int(
                db.execute(select(func.count(WithdrawRequest.id)).where(WithdrawRequest.status == "pending")).scalar() or 0
            )
        },
        "reports": {
            "open": int(db.execute(select(func.count(Report.id)).where(Report.status == "open")).scalar() or 0)
        },
        "gifts": {
            "sent_today": int(
                db.execute(select(func.count(LedgerEntry.id)).where(LedgerEntry.kind == "gift_sent", LedgerEntry.created_at >= day_start)).scalar()
                or 0
            )
        },
        "service": {
            "mail_configured": settings.mail_configured,
            "payments_configured": settings.payments_configured,
            "turn_configured": bool(settings.turn_url),
        },
    }


@router.get("/users")
def list_users(
    query: Optional[str] = None,
    status_filter: Optional[str] = Query(default=None, alias="status"),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    user: User = Depends(get_admin_user),
    db: Session = Depends(get_db),
):
    require_permission(user, "users")
    statement = select(User)
    if query:
        pattern = f"%{query.strip()}%"
        statement = statement.where(
            or_(User.username.ilike(pattern), User.email.ilike(pattern), User.phone.ilike(pattern), User.display_name.ilike(pattern))
        )
    if status_filter:
        statement = statement.where(User.status == status_filter)
    rows = db.execute(statement.order_by(User.id.desc()).offset(offset).limit(limit)).scalars().all()
    payload = []
    for row in rows:
        item = user_private(row)
        item["wallet"] = wallet_public(get_wallet(db, row.id))
        payload.append(item)
    return {"users": payload}


@router.patch("/users/{user_id}")
def update_user(
    user_id: int,
    payload: UserPatch,
    actor: User = Depends(get_admin_user),
    db: Session = Depends(get_db),
):
    require_permission(actor, "users")
    target = db.get(User, user_id)
    if target is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "المستخدم غير موجود")

    if payload.status is not None:
        if payload.status not in {"active", "suspended", "banned", "deleted"}:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "حالة الحساب غير معروفة")
        if target.is_admin and actor.admin_role != "owner":
            raise HTTPException(status.HTTP_403_FORBIDDEN, "تعديل حسابات الإدارة من صلاحيات المالك")
        target.status = payload.status
        if payload.status == "banned":
            target.online = False
        audit(db, actor, "user.status", "user", target.id, {"status": payload.status, "note": payload.note})

    if payload.display_name is not None:
        target.display_name = payload.display_name.strip()[:64]
        audit(db, actor, "user.display_name", "user", target.id, {"value": target.display_name})

    if payload.vip_days is not None:
        require_permission(actor, "users_sensitive")
        import datetime as dt

        base = target.vip_until if target.vip_until and target.vip_until > utcnow() else utcnow()
        target.vip_until = base + dt.timedelta(days=payload.vip_days)
        audit(db, actor, "user.vip", "user", target.id, {"days": payload.vip_days})

    if payload.is_admin is not None or payload.admin_role is not None:
        require_permission(actor, "admin_staff")
        if actor.admin_role != "owner":
            raise HTTPException(status.HTTP_403_FORBIDDEN, "إدارة صلاحيات الإدارة من صلاحيات المالك")
        if payload.is_admin is not None:
            target.is_admin = payload.is_admin
        if payload.admin_role is not None:
            if payload.admin_role and payload.admin_role not in ROLE_PERMISSIONS:
                raise HTTPException(status.HTTP_400_BAD_REQUEST, "دور إداري غير معروف")
            target.admin_role = payload.admin_role
            if payload.admin_role:
                target.is_admin = True
        audit(db, actor, "user.admin_role", "user", target.id, {"is_admin": target.is_admin, "role": target.admin_role})

    db.commit()
    create_notification(
        db,
        target.id,
        "admin",
        "تحديث على حسابك",
        payload.note or "تم تحديث بيانات حسابك من قبل الإدارة",
        {"status": target.status},
    )
    db.commit()
    return {"user": user_private(target), "wallet": wallet_public(get_wallet(db, target.id))}


@router.post("/users/{user_id}/wallet")
def adjust_wallet(
    user_id: int,
    payload: WalletPatch,
    actor: User = Depends(get_admin_user),
    db: Session = Depends(get_db),
):
    require_permission(actor, "users_sensitive")
    target = db.get(User, user_id)
    if target is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "المستخدم غير موجود")
    if payload.currency not in {"coins", "gold"}:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "العملة غير معروفة")
    if payload.amount == 0:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "حدد مبلغاً غير صفري")

    entry = admin_adjust(db, target, payload.currency, payload.amount, payload.note)
    audit(
        db,
        actor,
        "wallet.adjust",
        "user",
        target.id,
        {"currency": payload.currency, "amount": payload.amount, "note": payload.note},
    )
    db.commit()
    return {
        "entry": ledger_public(entry),
        "wallet": wallet_public(get_wallet(db, target.id)),
    }


@router.get("/ledger")
def ledger(
    currency: Optional[str] = None,
    kind: Optional[str] = None,
    user_id: Optional[int] = None,
    limit: int = Query(default=100, ge=1, le=500),
    actor: User = Depends(get_admin_user),
    db: Session = Depends(get_db),
):
    require_permission(actor, "ledger")
    statement = select(LedgerEntry)
    if currency in {"coins", "gold"}:
        statement = statement.where(LedgerEntry.currency == currency)
    if kind:
        statement = statement.where(LedgerEntry.kind == kind)
    if user_id:
        statement = statement.where(LedgerEntry.user_id == user_id)
    rows = db.execute(statement.order_by(LedgerEntry.id.desc()).limit(limit)).scalars().all()
    return {"entries": [ledger_public(row) for row in rows]}


@router.get("/rooms")
def admin_rooms(
    query: Optional[str] = None,
    limit: int = Query(default=50, ge=1, le=200),
    actor: User = Depends(get_admin_user),
    db: Session = Depends(get_db),
):
    require_permission(actor, "rooms")
    from ..room_service import member_count
    from ..serializers import room_public

    statement = select(Room)
    if query:
        statement = statement.where(Room.name.ilike(f"%{query.strip()}%"))
    rooms = db.execute(statement.order_by(Room.id.desc()).limit(limit)).scalars().all()
    return {
        "rooms": [
            {
                **room_public(room, db.get(User, room.owner_id), member_count(db, room.id)),
                "owner_username": (db.get(User, room.owner_id) or User()).username,
            }
            for room in rooms
        ]
    }


@router.patch("/rooms/{room_id}")
def admin_update_room(
    room_id: int,
    payload: RoomPatch,
    actor: User = Depends(get_admin_user),
    db: Session = Depends(get_db),
):
    require_permission(actor, "rooms")
    room = db.get(Room, room_id)
    if room is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "الغرفة غير موجودة")
    changes = {}
    for field, value in payload.model_dump(exclude_none=True).items():
        if field == "status" and value not in {"open", "closed"}:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "حالة غير معروفة")
        setattr(room, field, value)
        changes[field] = value
    audit(db, actor, "room.update", "room", room.id, changes)
    db.commit()
    return {"status": "updated", "changes": changes}


@router.delete("/rooms/{room_id}")
def admin_close_room(
    room_id: int,
    actor: User = Depends(get_admin_user),
    db: Session = Depends(get_db),
):
    require_permission(actor, "rooms")
    room = db.get(Room, room_id)
    if room is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "الغرفة غير موجودة")
    room.status = "closed"
    audit(db, actor, "room.close", "room", room.id, {})
    db.commit()
    return {"status": "closed"}


@router.get("/gifts")
def admin_gifts(actor: User = Depends(get_admin_user), db: Session = Depends(get_db)):
    require_permission(actor, "gifts")
    rows = db.execute(select(Gift).order_by(Gift.sort, Gift.id)).scalars().all()
    return {"gifts": [gift_public(row) for row in rows]}


@router.post("/gifts", status_code=status.HTTP_201_CREATED)
def create_gift(payload: GiftIn, actor: User = Depends(get_admin_user), db: Session = Depends(get_db)):
    require_permission(actor, "gifts")
    gift = Gift(**payload.model_dump())
    db.add(gift)
    audit(db, actor, "gift.create", "gift", "", payload.model_dump())
    db.commit()
    db.refresh(gift)
    return {"gift": gift_public(gift)}


@router.patch("/gifts/{gift_id}")
def update_gift(
    gift_id: int,
    payload: GiftPatch,
    actor: User = Depends(get_admin_user),
    db: Session = Depends(get_db),
):
    require_permission(actor, "gifts")
    gift = db.get(Gift, gift_id)
    if gift is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "الهدية غير موجودة")
    changes = payload.model_dump(exclude_none=True)
    for field, value in changes.items():
        setattr(gift, field, value)
    audit(db, actor, "gift.update", "gift", gift.id, changes)
    db.commit()
    return {"gift": gift_public(gift)}


@router.delete("/gifts/{gift_id}")
def disable_gift(gift_id: int, actor: User = Depends(get_admin_user), db: Session = Depends(get_db)):
    require_permission(actor, "gifts")
    gift = db.get(Gift, gift_id)
    if gift is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "الهدية غير موجودة")
    gift.active = False
    audit(db, actor, "gift.disable", "gift", gift.id, {})
    db.commit()
    return {"gift": gift_public(gift)}


@router.get("/packs")
def admin_packs(actor: User = Depends(get_admin_user), db: Session = Depends(get_db)):
    require_permission(actor, "store")
    rows = db.execute(select(StorePack).order_by(StorePack.sort, StorePack.id)).scalars().all()
    return {"packs": [pack_public(row) for row in rows]}


@router.post("/packs", status_code=status.HTTP_201_CREATED)
def create_pack(payload: PackIn, actor: User = Depends(get_admin_user), db: Session = Depends(get_db)):
    require_permission(actor, "store")
    if payload.kind not in {"coins", "gold"}:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "النوع غير معروف")
    pack = StorePack(**payload.model_dump())
    db.add(pack)
    audit(db, actor, "pack.create", "pack", "", payload.model_dump())
    db.commit()
    db.refresh(pack)
    return {"pack": pack_public(pack)}


@router.patch("/packs/{pack_id}")
def update_pack(
    pack_id: int,
    payload: PackPatch,
    actor: User = Depends(get_admin_user),
    db: Session = Depends(get_db),
):
    require_permission(actor, "store")
    pack = db.get(StorePack, pack_id)
    if pack is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "الباقة غير موجودة")
    changes = payload.model_dump(exclude_none=True)
    for field, value in changes.items():
        setattr(pack, field, value)
    audit(db, actor, "pack.update", "pack", pack.id, changes)
    db.commit()
    return {"pack": pack_public(pack)}


@router.get("/orders")
def admin_orders(
    status_filter: Optional[str] = Query(default=None, alias="status"),
    limit: int = Query(default=100, ge=1, le=300),
    actor: User = Depends(get_admin_user),
    db: Session = Depends(get_db),
):
    require_permission(actor, "orders")
    statement = select(RechargeOrder)
    if status_filter:
        statement = statement.where(RechargeOrder.status == status_filter)
    rows = db.execute(statement.order_by(RechargeOrder.id.desc()).limit(limit)).scalars().all()
    return {
        "orders": [
            {**order_public(row), "username": (db.get(User, row.user_id) or User()).username}
            for row in rows
        ],
        "payment_configured": settings.payments_configured,
    }


@router.post("/orders/{order_id}/approve")
def approve_order(
    order_id: int,
    payload: OrderDecision,
    actor: User = Depends(get_admin_user),
    db: Session = Depends(get_db),
):
    require_permission(actor, "orders")
    order = db.get(RechargeOrder, order_id)
    if order is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "الطلب غير موجود")
    if order.status == "paid":
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "الطلب مدفوع مسبقاً")
    entry = credit_recharge_order(db, order, note=f"موافقة الإدارة على الطلب #{order.id}")
    audit(db, actor, "order.approve", "order", order.id, {"amount": order.amount, "currency": order.currency, "note": payload.note})
    db.commit()
    create_notification(
        db,
        order.user_id,
        "account",
        "تم تأكيد شحن رصيدك",
        f"أُضيف {order.amount} إلى رصيدك",
        {"order_id": order.id},
    )
    db.commit()
    return {"order": order_public(order), "entry": ledger_public(entry) if entry else None}


@router.post("/orders/{order_id}/reject")
def reject_order(
    order_id: int,
    payload: OrderDecision,
    actor: User = Depends(get_admin_user),
    db: Session = Depends(get_db),
):
    require_permission(actor, "orders")
    order = db.get(RechargeOrder, order_id)
    if order is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "الطلب غير موجود")
    if order.status == "paid":
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "لا يمكن رفض طلب مدفوع")
    order.status = "failed"
    audit(db, actor, "order.reject", "order", order.id, {"note": payload.note})
    db.commit()
    create_notification(
        db, order.user_id, "account", "تم رفض طلب الشحن", payload.note or "تم رفض الطلب", {"order_id": order.id}
    )
    db.commit()
    return {"order": order_public(order)}


@router.get("/withdrawals")
def admin_withdrawals(
    status_filter: Optional[str] = Query(default=None, alias="status"),
    actor: User = Depends(get_admin_user),
    db: Session = Depends(get_db),
):
    require_permission(actor, "withdrawals")
    statement = select(WithdrawRequest)
    if status_filter:
        statement = statement.where(WithdrawRequest.status == status_filter)
    rows = db.execute(statement.order_by(WithdrawRequest.id.desc())).scalars().all()
    return {
        "requests": [
            {**withdrawal_public(row), "username": (db.get(User, row.user_id) or User()).username}
            for row in rows
        ]
    }


@router.post("/withdrawals/{request_id}/approve")
def approve_withdrawal(
    request_id: int,
    payload: OrderDecision,
    actor: User = Depends(get_admin_user),
    db: Session = Depends(get_db),
):
    require_permission(actor, "withdrawals")
    request = db.get(WithdrawRequest, request_id)
    if request is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "الطلب غير موجود")
    request.handled_by = actor.id
    settle_withdraw_request(db, request, approve=True, note=payload.note or "تمت الموافقة")
    audit(db, actor, "withdrawal.approve", "withdrawal", request.id, {"amount": request.amount})
    db.commit()
    create_notification(
        db, request.user_id, "account", "تمت الموافقة على طلب السحب",
        "سيتم تحويل المبلغ حسب طريقة الدفع المختارة.", {"request_id": request.id},
    )
    db.commit()
    return {"request": withdrawal_public(request)}


@router.post("/withdrawals/{request_id}/reject")
def reject_withdrawal(
    request_id: int,
    payload: OrderDecision,
    actor: User = Depends(get_admin_user),
    db: Session = Depends(get_db),
):
    require_permission(actor, "withdrawals")
    request = db.get(WithdrawRequest, request_id)
    if request is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "الطلب غير موجود")
    request.handled_by = actor.id
    settle_withdraw_request(db, request, approve=False, note=payload.note or "تم الرفض")
    audit(db, actor, "withdrawal.reject", "withdrawal", request.id, {"note": payload.note})
    db.commit()
    create_notification(
        db, request.user_id, "account", "تم رفض طلب السحب", payload.note or "تم رفض الطلب", {"request_id": request.id}
    )
    db.commit()
    return {"request": withdrawal_public(request)}


@router.get("/settings")
def get_settings(actor: User = Depends(get_admin_user), db: Session = Depends(get_db)):
    require_permission(actor, "settings")
    return {"settings": all_settings(db)}


@router.patch("/settings")
def patch_settings(payload: SettingsPatch, actor: User = Depends(get_admin_user), db: Session = Depends(get_db)):
    require_permission(actor, "settings")
    applied = {}
    for key, value in payload.settings.items():
        if key not in DEFAULTS and db.get(AppSetting, key) is None:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, f"إعداد غير معروف: {key}")
        set_setting(db, key, value)
        applied[key] = value
    audit(db, actor, "settings.update", "settings", "", applied)
    db.commit()
    return {"settings": all_settings(db)}


@router.post("/broadcast", status_code=status.HTTP_201_CREATED)
def broadcast(payload: BroadcastIn, actor: User = Depends(get_admin_user), db: Session = Depends(get_db)):
    require_permission(actor, "broadcast")
    statement = select(User).where(User.status == "active")
    if payload.segment == "online":
        statement = statement.where(User.online.is_(True))
    elif payload.segment == "vip":
        statement = statement.where(User.vip_until.is_not(None), User.vip_until > utcnow())
    elif payload.segment == "admins":
        statement = statement.where(User.is_admin.is_(True))
    else:
        payload.segment = "all"

    targets = db.execute(statement).scalars().all()
    for target in targets:
        db.add(
            Notification(
                user_id=target.id,
                type="admin",
                title=payload.title,
                body=payload.body,
                data={"segment": payload.segment},
            )
        )
    audit(db, actor, "broadcast", "users", payload.segment, {"title": payload.title, "count": len(targets)})
    db.commit()
    return {"sent": len(targets), "segment": payload.segment}


@router.get("/reports")
def admin_reports(
    status_filter: Optional[str] = Query(default=None, alias="status"),
    actor: User = Depends(get_admin_user),
    db: Session = Depends(get_db),
):
    require_permission(actor, "reports")
    statement = select(Report)
    if status_filter:
        statement = statement.where(Report.status == status_filter)
    rows = db.execute(statement.order_by(Report.id.desc()).limit(200)).scalars().all()
    return {
        "reports": [
            {
                **report_public(row),
                "reporter_username": (db.get(User, row.reporter_id) or User()).username,
            }
            for row in rows
        ]
    }


@router.patch("/reports/{report_id}")
def handle_report(
    report_id: int,
    payload: ReportPatch,
    actor: User = Depends(get_admin_user),
    db: Session = Depends(get_db),
):
    require_permission(actor, "reports")
    report = db.get(Report, report_id)
    if report is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "البلاغ غير موجود")
    if payload.status not in {"open", "reviewing", "resolved", "rejected"}:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "حالة البلاغ غير معروفة")
    report.status = payload.status
    report.handled_by = actor.id

    if payload.action == "ban_user" and report.target_type == "user":
        target = db.get(User, report.target_id)
        if target is not None:
            target.status = "banned"
            target.online = False
            audit(db, actor, "user.ban", "user", target.id, {"report_id": report.id})
    elif payload.action == "close_room" and report.target_type == "room":
        room = db.get(Room, report.target_id)
        if room is not None:
            room.status = "closed"
            audit(db, actor, "room.close", "room", room.id, {"report_id": report.id})

    audit(db, actor, "report.handle", "report", report.id, {"status": payload.status, "action": payload.action, "note": payload.note})
    db.commit()
    return {"report": report_public(report)}


@router.get("/audit-logs")
def audit_logs(
    limit: int = Query(default=100, ge=1, le=500),
    actor: User = Depends(get_admin_user),
    db: Session = Depends(get_db),
):
    require_permission(actor, "audit")
    rows = db.execute(select(AuditLog).order_by(AuditLog.id.desc()).limit(limit)).scalars().all()
    return {
        "logs": [
            {**audit_public(row), "actor_username": (db.get(User, row.actor_id) or User()).username if row.actor_id else "system"}
            for row in rows
        ]
    }
