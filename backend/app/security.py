"""Password hashing, access tokens and server-side permission checks."""
import datetime as dt
import time
from collections import defaultdict, deque
from typing import Optional

import bcrypt
import jwt
from fastapi import Depends, Header, HTTPException, status
from sqlalchemy.orm import Session

from .config import settings
from .db import get_db
from .models import User, utcnow

ADMIN_ROLES = {"owner", "admin", "moderator", "support"}


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(password: str, password_hash: str) -> bool:
    try:
        return bcrypt.checkpw(password.encode("utf-8"), password_hash.encode("utf-8"))
    except (ValueError, TypeError):
        return False


def hash_code(code: str) -> str:
    return bcrypt.hashpw(code.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def create_access_token(user_id: int) -> str:
    payload = {
        "sub": str(user_id),
        "iat": int(dt.datetime.now(dt.timezone.utc).timestamp()),
        "exp": dt.datetime.now(dt.timezone.utc) + dt.timedelta(days=settings.access_token_days),
    }
    return jwt.encode(payload, settings.secret_key, algorithm="HS256")


def decode_token(token: str) -> Optional[int]:
    try:
        payload = jwt.decode(token, settings.secret_key, algorithms=["HS256"])
        return int(payload["sub"])
    except (jwt.PyJWTError, KeyError, TypeError, ValueError):
        return None


def get_current_user(
    authorization: Optional[str] = Header(default=None),
    db: Session = Depends(get_db),
) -> User:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Authentication required")
    user_id = decode_token(authorization.split(" ", 1)[1].strip())
    if user_id is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid or expired token")
    user = db.get(User, user_id)
    if user is None or user.status == "deleted":
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Account not found")
    if user.status == "banned":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "This account is banned")
    return user


def get_admin_user(user: User = Depends(get_current_user)) -> User:
    """Admin rights are enforced here, on the server, for every admin route."""
    if not user.is_admin or user.admin_role not in ADMIN_ROLES:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Administrator privileges required")
    if user.status != "active":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Administrator account is not active")
    return user


def get_optional_user(
    authorization: Optional[str] = Header(default=None),
    db: Session = Depends(get_db),
) -> Optional[User]:
    if not authorization or not authorization.lower().startswith("bearer "):
        return None
    user_id = decode_token(authorization.split(" ", 1)[1].strip())
    return db.get(User, user_id) if user_id else None


# --- very small in-process rate limiter (per worker; see README for Redis) ---

_attempts: dict[str, deque] = defaultdict(deque)


def rate_limit(key: str, limit: int, window_seconds: int) -> None:
    if settings.rate_limit_disabled:
        return
    now = time.monotonic()
    bucket = _attempts[key]
    while bucket and now - bucket[0] > window_seconds:
        bucket.popleft()
    if len(bucket) >= limit:
        raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, "Too many requests, try again later")
    bucket.append(now)


def touch_user(db: Session, user: User) -> None:
    user.last_seen_at = utcnow()
    db.add(user)
