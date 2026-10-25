"""Notifications: stored in the database and pushed over the live socket."""
from typing import Any, Optional

from sqlalchemy.orm import Session

from .models import Notification, User
from .realtime import hub
from .serializers import notification_public

# Types a user may switch off from Settings. Administrative notices are always
# delivered.
MUTABLE_TYPES = {
    "friend_request",
    "friend_accepted",
    "message",
    "room_invite",
    "gift",
    "store_offer",
    "account",
    "game",
}
ALWAYS_TYPES = {"admin"}


def create_notification(
    db: Session,
    user_id: int,
    type_: str,
    title: str,
    body: str = "",
    data: Optional[dict[str, Any]] = None,
    push: bool = True,
) -> Optional[Notification]:
    if type_ in MUTABLE_TYPES:
        user = db.get(User, user_id)
        prefs = (user.notif_prefs or {}) if user else {}
        if prefs.get(type_) is False:
            return None

    notification = Notification(
        user_id=user_id,
        type=type_,
        title=title,
        body=body,
        data=data or {},
    )
    db.add(notification)
    db.flush()
    if push:
        hub.notify_user(
            user_id,
            {"type": "notification", "notification": notification_public(notification)},
        )
    return notification
