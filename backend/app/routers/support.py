"""Contact page: a user sends a support request and the team is notified in-app."""
from typing import Optional

from fastapi import APIRouter, Depends, Query, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import SupportMessage, User
from ..notifications import create_notification
from ..security import get_current_user, rate_limit
from ..serializers import support_public

router = APIRouter(prefix="/api/support", tags=["support"])

TOPICS = {"general", "bug", "payment", "abuse", "suggestion"}


class SupportIn(BaseModel):
    topic: str = "general"
    subject: str = Field(min_length=2, max_length=120)
    body: str = Field(min_length=5, max_length=2000)
    contact: str = Field(default="", max_length=120)


@router.post("", status_code=status.HTTP_201_CREATED)
def send_message(payload: SupportIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Store the message for the record and notify every administrator."""
    rate_limit(f"support:{user.id}", 10, 900)
    topic = payload.topic if payload.topic in TOPICS else "general"
    message = SupportMessage(
        user_id=user.id,
        topic=topic,
        subject=payload.subject.strip(),
        body=payload.body.strip(),
        contact=payload.contact.strip(),
    )
    db.add(message)
    db.flush()

    admins = db.execute(select(User).where(User.is_admin.is_(True), User.status == "active")).scalars().all()
    for admin in admins:
        create_notification(
            db,
            admin.id,
            "admin",
            f"رسالة دعم جديدة: {message.subject}",
            f"من {user.username}: {message.body[:300]}",
            {"support_id": message.id, "topic": topic, "from": user.id},
        )

    db.commit()
    db.refresh(message)
    return {"message": support_public(message), "notified": len(admins)}


@router.get("/mine")
def my_messages(
    limit: int = Query(default=30, ge=1, le=100),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    rows = (
        db.execute(
            select(SupportMessage)
            .where(SupportMessage.user_id == user.id)
            .order_by(SupportMessage.id.desc())
            .limit(limit)
        )
        .scalars()
        .all()
    )
    return {"messages": [support_public(row) for row in rows]}
