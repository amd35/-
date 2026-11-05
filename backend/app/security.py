"""Password hashing, access tokens and server-side permission checks."""
import datetime as dt
import logging
import math
import threading
import time
import uuid
from collections import defaultdict, deque
from typing import Optional

import bcrypt
import jwt
import redis
from fastapi import Depends, Header, HTTPException, status
from sqlalchemy.orm import Session

from .config import settings
from .db import get_db
from .models import User, utcnow

ADMIN_ROLES = {"owner", "admin", "moderator", "support"}

log = logging.getLogger(__name__)


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


# --- rate limiting: one sliding window shared in Redis, memory fallback ---
#
# The counter lives in Redis so every API worker (and every replica behind a
# load balancer) sees the same window: a client cannot multiply its budget by
# hitting another process. Without REDIS_URL, or while Redis is unreachable, the
# limiter degrades to the in-process buckets below — correct for a single worker.

_REDIS_KEY_PREFIX = "ratelimit:"

# One atomic sliding window: drop entries older than the window, then either
# refuse (returning the milliseconds until the oldest entry expires) or record
# the hit. Redis' own clock is used, so workers with skewed clocks still agree.
_SLIDING_WINDOW_LUA = """
local key = KEYS[1]
local limit = tonumber(ARGV[1])
local window = tonumber(ARGV[2])
local member = ARGV[3]
local clock = redis.call('TIME')
local now = tonumber(clock[1]) + tonumber(clock[2]) / 1000000
redis.call('ZREMRANGEBYSCORE', key, '-inf', now - window)
local count = redis.call('ZCARD', key)
if count >= limit then
  local oldest = redis.call('ZRANGE', key, 0, 0, 'WITHSCORES')
  local remaining_ms = math.floor((window - (now - tonumber(oldest[2]))) * 1000)
  if remaining_ms < 1000 then remaining_ms = 1000 end
  return {0, remaining_ms}
end
redis.call('ZADD', key, now, member)
redis.call('PEXPIRE', key, math.ceil(window * 1000))
return {1, 0}
"""

_redis_client: Optional[redis.Redis] = None
_redis_checked = False

# In-process fallback (also used by the tests, see backend/tests/test_rate_limits.py).
_attempts: dict[str, deque] = defaultdict(deque)
_attempts_lock = threading.Lock()
_PRUNE_EVERY_SECONDS = 300.0
_IDLE_BUCKET_SECONDS = 3600.0
_next_prune = {"at": 0.0}


def _redis() -> Optional[redis.Redis]:
    """Shared counter client, or None when REDIS_URL is not configured."""
    global _redis_client, _redis_checked
    if not _redis_checked:
        _redis_checked = True
        if settings.redis_url:
            _redis_client = redis.Redis.from_url(
                settings.redis_url,
                decode_responses=True,
                socket_connect_timeout=0.3,
                socket_timeout=0.3,
            )
    return _redis_client


def reset_rate_limits() -> None:
    """Forget the cached client and the in-process buckets (tests, config reloads)."""
    global _redis_client, _redis_checked
    _redis_client = None
    _redis_checked = False
    with _attempts_lock:
        _attempts.clear()


def _prune_attempts(now: float) -> None:
    """Drop idle buckets so one-off keys cannot grow the dict forever."""
    for key, bucket in list(_attempts.items()):
        if not bucket or now - bucket[-1] > _IDLE_BUCKET_SECONDS:
            _attempts.pop(key, None)


def _shared_hit(key: str, limit: int, window_seconds: int) -> Optional[int]:
    """Seconds to wait when the shared window is full; 0 when the call is allowed.

    None means "no shared counter available", so the caller uses the local one.
    """
    client = _redis()
    if client is None:
        return None
    try:
        allowed, remaining_ms = client.eval(
            _SLIDING_WINDOW_LUA,
            1,
            f"{_REDIS_KEY_PREFIX}{key}",
            limit,
            window_seconds,
            uuid.uuid4().hex,
        )
    except redis.RedisError as exc:
        log.warning("rate limiter: Redis unavailable (%s); counting in-process", exc)
        return None
    if allowed:
        return 0
    return max(1, math.ceil(int(remaining_ms) / 1000))


def _local_hit(key: str, limit: int, window_seconds: int) -> int:
    """In-process sliding window; returns seconds to wait (0 when allowed)."""
    now = time.monotonic()
    with _attempts_lock:
        if now >= _next_prune["at"]:
            _prune_attempts(now)
            _next_prune["at"] = now + _PRUNE_EVERY_SECONDS
        bucket = _attempts[key]
        while bucket and now - bucket[0] > window_seconds:
            bucket.popleft()
        if len(bucket) >= limit:
            return max(1, math.ceil(window_seconds - (now - bucket[0])))
        bucket.append(now)
        return 0


def rate_limit(key: str, limit: int, window_seconds: int) -> None:
    """Allow at most `limit` calls per rolling window for one key.

    Raises HTTP 429 with a Retry-After header once the window is full. Call it
    before any wallet or side-effecting work so a rejected request costs nothing.
    The Redis script is atomic, and the local fallback holds a lock because sync
    routes run in a thread pool: otherwise concurrent requests could both read
    the last free slot and pass together.
    """
    if settings.rate_limit_disabled:
        return
    retry_after = _shared_hit(key, limit, window_seconds)
    if retry_after is None:
        retry_after = _local_hit(key, limit, window_seconds)
    if retry_after:
        raise HTTPException(
            status.HTTP_429_TOO_MANY_REQUESTS,
            "Too many requests, try again later",
            headers={"Retry-After": str(retry_after)},
        )


def touch_user(db: Session, user: User) -> None:
    user.last_seen_at = utcnow()
    db.add(user)
