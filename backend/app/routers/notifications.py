"""In-app notifications, notification preferences and abuse reports."""
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import Notification, Report, User
from ..notifications import ALWAYS_TYPES, MUTABLE_TYPES
from ..security import get_current_user
from ..serializers import notification_public, report_public

router = APIRouter(prefix="/api", tags=["notifications"])


class PrefsIn(BaseModel):
    prefs: dict


class ReportIn(BaseModel):
    target_type: str
    target_id: int
    reason: str = Field(min_length=2, max_length=64)
    details: str = Field(default="", max_length=1000)


@router.get("/notifications")
def list_notifications(
    unread_only: bool = False,
    limit: int = Query(default=50, ge=1, le=200),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    statement = select(Notification).where(Notification.user_id == user.id)
    if unread_only:
        statement = statement.where(Notification.read.is_(False))
    rows = db.execute(statement.order_by(Notification.id.desc()).limit(limit)).scalars().all()
    unread = int(
        db.execute(
            select(func.count(Notification.id)).where(
                Notification.user_id == user.id, Notification.read.is_(False)
            )
        ).scalar()
        or 0
    )
    return {"notifications": [notification_public(row) for row in rows], "unread": unread}


@router.post("/notifications/{notification_id}/read")
def mark_read(notification_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    row = db.get(Notification, notification_id)
    if row is None or row.user_id != user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "الإشعار غير موجود")
    row.read = True
    db.commit()
    return {"status": "read"}


@router.post("/notifications/read-all")
def mark_all_read(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    db.execute(
        Notification.__table__.update()
        .where(Notification.user_id == user.id, Notification.read.is_(False))
        .values(read=True)
    )
    db.commit()
    return {"status": "all_read"}


@router.get("/notifications/preferences")
def get_preferences(user: User = Depends(get_current_user)):
    prefs = {key: True for key in sorted(MUTABLE_TYPES)}
    prefs.update(user.notif_prefs or {})
    return {"preferences": prefs, "always_on": sorted(ALWAYS_TYPES)}


@router.patch("/notifications/preferences")
def set_preferences(payload: PrefsIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    prefs = dict(user.notif_prefs or {})
    for key, value in payload.prefs.items():
        if key in MUTABLE_TYPES:
            prefs[key] = bool(value)
    user.notif_prefs = prefs
    db.commit()
    merged = {key: True for key in sorted(MUTABLE_TYPES)}
    merged.update(prefs)
    return {"preferences": merged}


@router.post("/reports", status_code=status.HTTP_201_CREATED)
def create_report(payload: ReportIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if payload.target_type not in {"user", "room", "message"}:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "نوع الهدف غير معروف")
    report = Report(
        reporter_id=user.id,
        target_type=payload.target_type,
        target_id=payload.target_id,
        reason=payload.reason,
        details=payload.details.strip(),
    )
    db.add(report)
    db.commit()
    db.refresh(report)
    return report_public(report)


@router.get("/reports/mine")
def my_reports(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    rows = (
        db.execute(select(Report).where(Report.reporter_id == user.id).order_by(Report.id.desc()))
        .scalars()
        .all()
    )
    return {"reports": [report_public(row) for row in rows]}
