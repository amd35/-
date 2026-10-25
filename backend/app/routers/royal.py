"""نظام رويال: حالة العضو، المستويات الخمسة، وحزم الشحن (ذهب أو ماس) التي تمنح النقاط.

Read-only here: royal points only move when a recharge order is confirmed on
the server (see :func:`app.economy.credit_recharge_order`) or when an
administrator adjusts them — never from the client.
"""
from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import royal
from ..db import get_db
from ..economy import get_wallet
from ..models import StorePack, User
from ..security import get_current_user
from ..serializers import pack_public, wallet_public
from .wallet import _payment_status

router = APIRouter(prefix="/api/royal", tags=["royal"])


@router.get("")
def royal_overview(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """المستويات (بما فيها المقفلة) + تقدّم العضو + كل حزم الشحن التي تمنح نقاط رويال."""
    packages = (
        db.execute(
            select(StorePack)
            .where(StorePack.active.is_(True), StorePack.royal_points > 0)
            .order_by(StorePack.sort, StorePack.id)
        )
        .scalars()
        .all()
    )
    return {
        "status": royal.status_for(db, user),
        "tiers": [royal.tier_public(tier) for tier in royal.tiers(db)],
        "history": royal.history(db, user.id),
        "packages": [pack_public(pack) for pack in packages],
        "wallet": wallet_public(get_wallet(db, user.id)),
        "payment": _payment_status(),
    }
