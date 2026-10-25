"""Public metadata: health, ICE servers and the admin-managed settings."""
from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..config import settings
from ..db import get_db, healthy
from ..models import User
from ..serializers import user_public
from ..settings_store import public_settings

router = APIRouter(prefix="/api", tags=["meta"])


@router.get("/health")
def health() -> dict:
    return {"status": "ok" if healthy() else "degraded", "database": healthy()}


@router.get("/meta/public")
def meta_public(db: Session = Depends(get_db)) -> dict:
    payload = public_settings(db)
    payload.update(
        {
            "ice_servers": settings.ice_servers(),
            "languages": ["ar", "en"],
            "mail_configured": settings.mail_configured,
            "payments_configured": settings.payments_configured,
            "turn_configured": bool(settings.turn_url),
        }
    )
    return payload


@router.get("/meta/leaderboard")
def leaderboard(db: Session = Depends(get_db)) -> dict:
    top = db.execute(select(User).where(User.status == "active").order_by(User.xp.desc()).limit(20)).scalars().all()
    return {"users": [user_public(user) for user in top]}
