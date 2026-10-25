"""Registration, login, verification and password recovery."""
import datetime as dt
import logging
import random
import re
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, Field
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from .. import inventory
from ..config import settings
from ..db import get_db
from ..economy import get_wallet, grant_reward
from ..mailer import send_email
from ..models import User, VerificationCode, utcnow
from ..notifications import create_notification
from ..security import (
    create_access_token,
    get_current_user,
    hash_code,
    hash_password,
    rate_limit,
    verify_password,
)
from ..serializers import item_public, user_private, wallet_public
from ..settings_store import get_setting

log = logging.getLogger("app.auth")
router = APIRouter(prefix="/api/auth", tags=["auth"])

USERNAME_RE = re.compile(r"^[A-Za-z0-9_]{3,24}$")
EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[A-Za-z]{2,}$")
PHONE_RE = re.compile(r"^\+?[0-9]{8,15}$")


class RegisterIn(BaseModel):
    username: str
    password: str = Field(min_length=6, max_length=128)
    email: Optional[str] = None
    phone: Optional[str] = None
    display_name: str = ""
    locale: str = "ar"


class LoginIn(BaseModel):
    identifier: str
    password: str


class CodeRequestIn(BaseModel):
    channel: str = "email"


class CodeConfirmIn(BaseModel):
    channel: str = "email"
    code: str


class ResetRequestIn(BaseModel):
    identifier: str


class ResetConfirmIn(BaseModel):
    identifier: str
    code: str
    new_password: str = Field(min_length=6, max_length=128)


def equipped_public(db: Session, user: User) -> list[dict]:
    """Cosmetics this user equipped (one per kind: dice, theme)."""
    return [item_public(item, row) for item, row in inventory.equipped_items(db, user.id)]


def auth_payload(db: Session, user: User) -> dict:
    wallet = get_wallet(db, user.id)
    return {
        "token": create_access_token(user.id),
        "user": user_private(user),
        "wallet": wallet_public(wallet),
        "equipped_items": equipped_public(db, user),
    }


def _issue_code(db: Session, user: User, channel: str, purpose: str) -> str:
    code = f"{random.randint(0, 999999):06d}"
    db.add(
        VerificationCode(
            user_id=user.id,
            channel=channel,
            purpose=purpose,
            code_hash=hash_code(code),
            expires_at=utcnow() + dt.timedelta(minutes=15),
        )
    )
    db.commit()
    return code


def _consume_code(db: Session, user: User, channel: str, purpose: str, code: str) -> None:
    rows = (
        db.execute(
            select(VerificationCode)
            .where(
                VerificationCode.user_id == user.id,
                VerificationCode.channel == channel,
                VerificationCode.purpose == purpose,
                VerificationCode.used.is_(False),
            )
            .order_by(VerificationCode.id.desc())
        )
        .scalars()
        .all()
    )
    for row in rows:
        if row.expires_at < utcnow():
            continue
        if verify_password(code, row.code_hash):
            row.used = True
            db.commit()
            return
    raise HTTPException(status.HTTP_400_BAD_REQUEST, "الرمز غير صحيح أو منتهي الصلاحية")


@router.post("/register", status_code=status.HTTP_201_CREATED)
def register(payload: RegisterIn, request: Request, db: Session = Depends(get_db)):
    rate_limit(f"register:{request.client.host if request.client else 'unknown'}", 10, 3600)

    username = payload.username.strip()
    email = (payload.email or "").strip().lower() or None
    phone = (payload.phone or "").strip() or None

    if not USERNAME_RE.match(username):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "اسم المستخدم يجب أن يكون بين 3 و24 حرفاً إنجليزياً أو رقماً")
    if not email and not phone:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "أدخل البريد الإلكتروني أو رقم الهاتف")
    if email and not EMAIL_RE.match(email):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "البريد الإلكتروني غير صحيح")
    if phone and not PHONE_RE.match(phone):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "رقم الهاتف غير صحيح")

    if db.execute(select(User.id).where(User.username == username)).first():
        raise HTTPException(status.HTTP_409_CONFLICT, "اسم المستخدم مستخدم مسبقاً")
    if email and db.execute(select(User.id).where(User.email == email)).first():
        raise HTTPException(status.HTTP_409_CONFLICT, "البريد الإلكتروني مسجل مسبقاً")
    if phone and db.execute(select(User.id).where(User.phone == phone)).first():
        raise HTTPException(status.HTTP_409_CONFLICT, "رقم الهاتف مسجل مسبقاً")

    user = User(
        username=username,
        email=email,
        phone=phone,
        password_hash=hash_password(payload.password),
        display_name=(payload.display_name or username).strip()[:64],
        locale=payload.locale if payload.locale in {"ar", "en"} else "ar",
        notif_prefs={},
        privacy={"show_online": True, "allow_room_invites": True, "allow_gifts": True},
        voice_prefs={"mic_auto_on": False, "speaker_volume": 100},
    )
    db.add(user)
    db.flush()
    get_wallet(db, user.id)

    bonus = int(get_setting(db, "welcome_bonus_coins", 500))
    if bonus > 0:
        grant_reward(db, user, "coins", bonus, "مكافأة الترحيب", ref=f"welcome:{user.id}")

    create_notification(
        db,
        user.id,
        "admin",
        "مرحباً بك",
        "أكمل ملفك الشخصي وتعرّف على الغرف الصوتية.",
        push=False,
    )
    db.commit()
    db.refresh(user)
    return auth_payload(db, user)


@router.post("/login")
def login(payload: LoginIn, request: Request, db: Session = Depends(get_db)):
    identifier = payload.identifier.strip()
    rate_limit(f"login:{identifier.lower()}:{request.client.host if request.client else ''}", 10, 300)

    user = db.execute(
        select(User).where(
            or_(
                User.username == identifier,
                User.email == identifier.lower(),
                User.phone == identifier,
            )
        )
    ).scalar_one_or_none()

    if user is None or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "بيانات الدخول غير صحيحة")
    if user.status == "banned":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "تم حظر هذا الحساب")
    if user.status == "suspended":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "الحساب موقوف مؤقتاً")
    if user.status == "deleted":
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "بيانات الدخول غير صحيحة")

    user.last_seen_at = utcnow()
    db.commit()
    db.refresh(user)
    return auth_payload(db, user)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    user.online = False
    user.last_seen_at = utcnow()
    db.commit()


@router.get("/me")
def me(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return {
        "user": user_private(user),
        "wallet": wallet_public(get_wallet(db, user.id)),
        "equipped_items": equipped_public(db, user),
    }


@router.post("/verify/request")
def request_verification(
    payload: CodeRequestIn,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    rate_limit(f"verify:{user.id}", 5, 600)
    channel = "phone" if payload.channel == "phone" else "email"
    destination = user.phone if channel == "phone" else user.email
    if not destination:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "لا يوجد عنوان مسجل لهذه القناة")

    code = _issue_code(db, user, channel, "verify")
    delivered = (
        send_email(destination, "رمز التحقق", f"رمز التحقق الخاص بك: {code}")
        if channel == "email"
        else False
    )
    if not delivered:
        # No SMS gateway is configured; the code stays in the server log.
        log.warning("Verification code for user %s (%s): %s", user.id, channel, code)
    return {
        "sent": delivered,
        "channel": channel,
        "delivery": "email" if delivered else "manual",
        "message": (
            "تم إرسال الرمز إلى بريدك الإلكتروني"
            if delivered
            else "لم يتم إعداد مزود البريد أو الرسائل؛ الرمز مسجّل لدى الإدارة"
        ),
    }


@router.post("/verify/confirm")
def confirm_verification(
    payload: CodeConfirmIn,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    channel = "phone" if payload.channel == "phone" else "email"
    _consume_code(db, user, channel, "verify", payload.code)
    if channel == "phone":
        user.phone_verified = True
    else:
        user.email_verified = True
    db.commit()
    return {"user": user_private(user)}


@router.post("/password/reset-request", status_code=status.HTTP_202_ACCEPTED)
def reset_request(payload: ResetRequestIn, request: Request, db: Session = Depends(get_db)):
    identifier = payload.identifier.strip()
    rate_limit(f"reset:{identifier.lower()}", 5, 900)
    user = db.execute(
        select(User).where(
            or_(User.username == identifier, User.email == identifier.lower(), User.phone == identifier)
        )
    ).scalar_one_or_none()
    # Always the same answer: no account enumeration.
    if user is None:
        return {"status": "accepted"}
    channel = "phone" if identifier == user.phone and not user.email else "email"
    code = _issue_code(db, user, channel, "reset")
    delivered = False
    if channel == "email" and user.email:
        delivered = send_email(user.email, "استعادة كلمة المرور", f"رمز الاستعادة: {code}")
    if not delivered:
        log.warning("Password reset code for user %s (%s): %s", user.id, channel, code)
    return {"status": "accepted"}


@router.post("/password/reset-confirm")
def reset_confirm(payload: ResetConfirmIn, db: Session = Depends(get_db)):
    identifier = payload.identifier.strip()
    rate_limit(f"reset-confirm:{identifier.lower()}", 10, 900)
    user = db.execute(
        select(User).where(
            or_(User.username == identifier, User.email == identifier.lower(), User.phone == identifier)
        )
    ).scalar_one_or_none()
    if user is None:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "الرمز غير صحيح أو منتهي الصلاحية")
    channel = "phone" if identifier == user.phone and not user.email else "email"
    _consume_code(db, user, channel, "reset", payload.code)
    user.password_hash = hash_password(payload.new_password)
    db.commit()
    return {"status": "password_updated", "settings": {"mail_configured": settings.mail_configured}}
