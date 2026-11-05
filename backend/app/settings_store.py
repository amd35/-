"""Runtime settings managed from the admin panel (prices, fees, adverts...)."""
from typing import Any

from sqlalchemy.orm import Session

from .models import AppSetting

DEFAULTS: dict[str, Any] = {
    "app_name": "يلا لوهان",
    "currency_default": "IQD",
    "supported_currencies": ["IQD", "USD"],
    "exchange_rate_usd_iqd": 1320,
    "gift_receiver_share_percent": 60,
    "room_gift_receiver_share_percent": 0,
    "withdrawal_enabled": False,
    "withdrawal_min_diamonds": 50000,
    "withdrawal_fee_percent": 10,
    "welcome_bonus_diamonds": 1000,
    "ads": [
        {
            "id": "ad_welcome",
            "title": "مرحباً بك في التطبيق",
            "body": "أكمل ملفك الشخصي واحصل على 100 ماس إضافية.",
            "kind": "info",
        }
    ],
    "offers": [
        {
            "id": "offer_first_recharge",
            "title": "عرض الشحن الأول",
            "body": "احصل على 20% ماس إضافية عند أول عملية شحن.",
            "percent": 20,
            "active": True,
        }
    ],
    "games_enabled": {"ludo": True, "domino": True},
    "domino_target_score": 100,
    "game_win_reward_diamonds": 500,
    "game_win_xp": 50,
    "maintenance": False,
}


def get_setting(db: Session, key: str, default: Any = None) -> Any:
    row = db.get(AppSetting, key)
    if row is not None:
        return row.value
    if key in DEFAULTS:
        return DEFAULTS[key]
    return default


def set_setting(db: Session, key: str, value: Any) -> AppSetting:
    row = db.get(AppSetting, key)
    if row is None:
        row = AppSetting(key=key, value=value)
    else:
        row.value = value
    db.add(row)
    return row


def all_settings(db: Session) -> dict[str, Any]:
    merged = dict(DEFAULTS)
    for row in db.query(AppSetting).all():
        if row.key.startswith("_"):
            # Internal bookkeeping (e.g. the admin-password marker), not an
            # operator-editable setting: never listed or written through the panel.
            continue
        merged[row.key] = row.value
    return merged


def public_settings(db: Session) -> dict[str, Any]:
    values = all_settings(db)
    return {
        "app_name": values["app_name"],
        "currency_default": values["currency_default"],
        "supported_currencies": values["supported_currencies"],
        "exchange_rate_usd_iqd": values["exchange_rate_usd_iqd"],
        "ads": values["ads"],
        "offers": values["offers"],
        "withdrawal_enabled": values["withdrawal_enabled"],
        "withdrawal_min_diamonds": values["withdrawal_min_diamonds"],
        "withdrawal_fee_percent": values["withdrawal_fee_percent"],
        "games_enabled": values["games_enabled"],
        "maintenance": values["maintenance"],
    }
