"""Payment provider integration (Stripe).

Nothing is credited from the client. Coins are added only after
``credit_recharge_order`` runs, which happens on a verified provider webhook or
when an administrator approves the order. Until the provider keys exist,
every route here refuses with 503 instead of pretending to work.
"""
import logging

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..config import settings
from ..db import get_db
from ..economy import credit_recharge_order
from ..models import RechargeOrder, User
from ..security import get_current_user
from ..serializers import order_public
from ..settings_store import get_setting

log = logging.getLogger("app.payments")
router = APIRouter(prefix="/api/payments", tags=["payments"])

NOT_CONFIGURED = (
    "لم يتم إعداد مزود الدفع (Stripe). أضف STRIPE_SECRET_KEY و STRIPE_WEBHOOK_SECRET "
    "من صفحة الأسرار ثم أعد تشغيل الخدمة."
)


@router.get("/status")
def payment_status(db: Session = Depends(get_db)) -> dict:
    return {
        "configured": settings.payments_configured,
        "provider": "stripe",
        "provider_supports_iqd": False,
        "display_currency_default": get_setting(db, "currency_default", "IQD"),
        "message": None if settings.payments_configured else NOT_CONFIGURED,
    }


def _charge_amount(db: Session, order: RechargeOrder) -> tuple[int, str]:
    """Stripe does not support IQD, so IQD prices are charged as USD."""
    if order.price_currency == "USD":
        return max(order.price_amount, 50), "usd"
    rate = int(get_setting(db, "exchange_rate_usd_iqd", 1320)) or 1320
    usd_cents = round(order.price_amount / rate * 100)
    return max(usd_cents, 50), "usd"


@router.post("/orders/{order_id}/checkout")
def create_checkout(
    order_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    order = db.get(RechargeOrder, order_id)
    if order is None or order.user_id != user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "الطلب غير موجود")
    if order.status != "pending":
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "لا يمكن الدفع لهذا الطلب")
    if not settings.payments_configured:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, NOT_CONFIGURED)

    import stripe

    stripe.api_key = settings.stripe_secret_key
    amount, currency_code = _charge_amount(db, order)
    success_url = f"{settings.web_origin or 'http://localhost:3000'}/store?order={order.id}"
    session = stripe.checkout.Session.create(
        mode="payment",
        line_items=[
            {
                "price_data": {
                    "currency": currency_code,
                    "unit_amount": amount,
                    "product_data": {"name": f"{order.amount} {order.currency}"},
                },
                "quantity": 1,
            }
        ],
        metadata={"order_id": str(order.id), "user_id": str(user.id)},
        success_url=success_url,
        cancel_url=success_url,
    )
    order.provider_ref = session["id"]
    db.commit()
    return {"checkout_url": session["url"], "session_id": session["id"], "charged": {"amount": amount, "currency": currency_code}}


@router.post("/webhook/stripe")
async def stripe_webhook(request: Request, db: Session = Depends(get_db)):
    if not settings.payments_configured:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, NOT_CONFIGURED)

    payload = await request.body()
    signature = request.headers.get("stripe-signature", "")
    import stripe

    try:
        event = stripe.Webhook.construct_event(payload, signature, settings.stripe_webhook_secret)
    except Exception as exc:
        log.warning("Rejected Stripe webhook: %s", exc)
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "توقيع الدفع غير صالح")

    event_type = event["type"] if isinstance(event, dict) else event.type
    if event_type not in {"checkout.session.completed", "payment_intent.succeeded"}:
        return {"status": "ignored", "type": event_type}

    data = event["data"]["object"]
    metadata = dict(data.get("metadata") or {})
    order_id = metadata.get("order_id")
    order = None
    if order_id:
        order = db.get(RechargeOrder, int(order_id))
    if order is None:
        reference = data.get("id")
        order = db.execute(select(RechargeOrder).where(RechargeOrder.provider_ref == reference)).scalar_one_or_none()
    if order is None:
        log.warning("Webhook for unknown order: %s", metadata)
        return {"status": "unknown_order"}

    entry = credit_recharge_order(db, order, note=f"دفعة مؤكدة من Stripe ({data.get('id')})")
    return {
        "status": "credited" if entry else "already_credited",
        "order": order_public(order),
    }
