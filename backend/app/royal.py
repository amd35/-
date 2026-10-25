"""نظام رويال: نقاط تُكتسب من الشحن فقط، ومستويات عتباتها قابلة للتعديل.

Royal points are their own counter on the member (never mixed with the gold /
diamonds wallet). They only move through :func:`add_points`, which writes an
append-only ``royal_point_entries`` row with a unique ``ref`` — so a repeated
payment or a replayed admin action can never grant the same points twice.

A member's level is *derived*: the highest :class:`RoyalTier` whose
``required_points`` the member already passed. Upgrade rules therefore stay
independent from the points earned by recharging, and the admin panel can change
them at any time.
"""
import time

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from .models import RoyalPointEntry, RoyalTier, User

# الصفوف المميّزة: تُعرض كأزرار امتيازات كبيرة (صفّان).
FEATURED_PRIVILEGES = [
    ("cover_exchange", "الاستبدال الفائق لقطع الغلاف", "Super cover exchange", "palette"),
    ("game_xp_reward", "مكافأة نقاط خبرة اللعبة", "Game XP reward", "trophy"),
    ("reward_tower", "برج مكافآت رويال", "Royal rewards tower", "star"),
    ("visitor_log", "المزيد من سجل الزوار", "More visitor log", "hand"),
]

# الشبكة السفلية: امتيازات بأيقونات (ثلاثة أعمدة).
GRID_PRIVILEGES = [
    ("royal_items", "عناصر رويال", "Royal items", "cart"),
    ("profile_zoom", "تكبير صورة الملف الشخصي", "Profile zoom", "star"),
    ("royal_badge", "شعار رويال", "Royal badge", "crown"),
    ("profile_frame", "إطار الملف الشخصي", "Profile frame", "palette"),
    ("rank_priority", "أولوية الترتيب", "Ranking priority", "trophy"),
    ("top_display", "العرض في الأعلى", "Top display", "megaphone"),
    ("gift_commission", "عمولة الهدايا اليومية", "Daily gift commission", "gift"),
    ("recharge_ticket", "تذكرة مكافأة الشحن", "Recharge reward ticket", "bag"),
    ("pin_friends", "تثبيت الأصدقاء في الأعلى", "Pin friends on top", "friends"),
    ("theme_sync", "مزامنة الموضوع", "Theme sync", "palette"),
    ("cover_sync", "مزامنة الغلاف", "Cover sync", "dice"),
    ("exclusive_start", "واجهة البداية الحصرية", "Exclusive start screen", "house"),
    ("full_room_entry", "دخول الغرفة مكتملة العدد", "Full room entry", "lock"),
    ("royal_stickers", "ملصقات رويال", "Royal stickers", "party"),
    ("app_icon", "أيقونة تطبيق رويال", "Royal app icon", "bag"),
    ("support", "خدمة العملاء", "Customer service", "hand"),
]

# المستويات الخمسة وشكل تاج كل مستوى (لون الوهج والحجر).
# العتبات الافتراضية المطلوبة: أول مستوى يفتح عند 7000 نقطة (والمستوى الأخير 35000)،
# ويعدّلها المشرف من لوحة الإدارة متى شاء — لا عتبة مكتوبة في الواجهة.
_LEVEL_STYLES = [
    (1, "رويال 1", "Royal 1", 7000, "#45d2ba", "#7ff2df"),
    (2, "رويال 2", "Royal 2", 14000, "#9fd8ff", "#4a90e2"),
    (3, "رويال 3", "Royal 3", 21000, "#a78bfa", "#7c5cff"),
    (4, "رويال 4", "Royal 4", 28000, "#ff8fa3", "#e2374f"),
    (5, "رويال 5", "Royal 5", 35000, "#f4cc44", "#ffd76a"),
]


def default_privileges(level: int) -> list[dict]:
    """امتيازات المستوى: الأزرار الأربعة + شبكة تكبر مع المستوى."""
    featured = [
        {"key": key, "title_ar": title_ar, "title_en": title_en, "icon": icon, "featured": True}
        for key, title_ar, title_en, icon in FEATURED_PRIVILEGES
    ]
    size = min(len(GRID_PRIVILEGES), 4 + 2 * level)
    grid = [
        {"key": key, "title_ar": title_ar, "title_en": title_en, "icon": icon, "featured": False}
        for key, title_ar, title_en, icon in GRID_PRIVILEGES[:size]
    ]
    return featured + grid


DEFAULT_TIERS = [
    {
        "level": level,
        "name_ar": name_ar,
        "name_en": name_en,
        "required_points": required,
        "accent": accent,
        "jewel": jewel,
        "privileges": default_privileges(level),
        "active": True,
    }
    for level, name_ar, name_en, required, accent, jewel in _LEVEL_STYLES
]

_CACHE: dict = {"stamp": 0.0, "tiers": []}
CACHE_TTL = 5.0

# لقطة خفيفة من العتبات تُستخدم في الترميز (serializers) حيث لا تتوفر جلسة قاعدة بيانات.
_THRESHOLDS: list[dict] = [
    {
        "level": tier["level"],
        "name_ar": tier["name_ar"],
        "name_en": tier["name_en"],
        "required_points": tier["required_points"],
        "accent": tier["accent"],
    }
    for tier in DEFAULT_TIERS
]


def _snapshot(rows) -> list[dict]:
    return [
        {
            "level": row.level,
            "name_ar": row.name_ar,
            "name_en": row.name_en,
            "required_points": row.required_points,
            "accent": row.accent,
        }
        for row in rows
    ]


def invalidate() -> None:
    """يُنادى بعد أي تعديل إداري على المستويات حتى لا يعتمد العرض على ذاكرة قديمة."""
    _CACHE["stamp"] = 0.0
    _CACHE["tiers"] = []


def thresholds() -> list[dict]:
    return _THRESHOLDS


def normalize_privileges(raw) -> list[dict]:
    items: list[dict] = []
    for index, entry in enumerate(raw or []):
        if isinstance(entry, str):
            entry = {"title_ar": entry}
        if not isinstance(entry, dict):
            continue
        title_ar = str(entry.get("title_ar") or entry.get("title") or "").strip()[:80]
        if not title_ar:
            continue
        items.append(
            {
                "key": str(entry.get("key") or f"privilege_{index + 1}")[:48],
                "title_ar": title_ar,
                "title_en": str(entry.get("title_en") or "").strip()[:80],
                "icon": str(entry.get("icon") or "star")[:24],
                "featured": bool(entry.get("featured")),
            }
        )
    return items


def tier_public(tier: RoyalTier | None) -> dict | None:
    if tier is None:
        return None
    return {
        "level": tier.level,
        "name_ar": tier.name_ar,
        "name_en": tier.name_en,
        "required_points": tier.required_points,
        "accent": tier.accent,
        "jewel": tier.jewel,
        "privileges": normalize_privileges(tier.privileges),
        "active": bool(tier.active),
    }


def ensure_tiers(db: Session) -> None:
    """ينشئ المستويات الخمسة مرة واحدة، ولا يلمس ما عدّله المشرف."""
    existing = {row.level for row in db.execute(select(RoyalTier)).scalars()}
    missing = [payload for payload in DEFAULT_TIERS if payload["level"] not in existing]
    if not missing:
        return
    for payload in missing:
        db.add(RoyalTier(**payload))
    db.commit()
    invalidate()


def tiers(db: Session, active_only: bool = False) -> list[RoyalTier]:
    rows = db.execute(select(RoyalTier).order_by(RoyalTier.required_points, RoyalTier.level)).scalars().all()
    return [row for row in rows if row.active] if active_only else list(rows)


def cached_tiers(db: Session) -> list[RoyalTier]:
    global _THRESHOLDS
    now = time.monotonic()
    if _CACHE["tiers"] and now - _CACHE["stamp"] < CACHE_TTL:
        return _CACHE["tiers"]
    rows = tiers(db, active_only=True)
    _CACHE["tiers"] = rows
    _CACHE["stamp"] = now
    _THRESHOLDS = _snapshot(rows)
    return rows


def refresh(db: Session) -> list[RoyalTier]:
    """يُستخدم بعد تعديل إداري: يُفرغ الذاكرة ويعيد تحميل العتبات فوراً."""
    invalidate()
    return cached_tiers(db)


def level_from_points(points: int) -> dict | None:
    """أعلى مستوى تجاوزه العضو — يعتمد على آخر لقطة عتبات محمّلة."""
    reached = [row for row in _THRESHOLDS if points >= row["required_points"]]
    return reached[-1] if reached else None


def level_for_points(points: int, rows: list[RoyalTier]) -> RoyalTier | None:
    reached = [row for row in sorted(rows, key=lambda item: item.required_points) if points >= row.required_points]
    return reached[-1] if reached else None


def status_from_points(points: int, rows: list[RoyalTier]) -> dict:
    current = level_for_points(points, rows)
    ordered = sorted(rows, key=lambda item: item.required_points)
    nxt = next((row for row in ordered if row.required_points > points), None)
    base = current.required_points if current else 0
    span = (nxt.required_points - base) if nxt else 0
    progress = 100 if not nxt else (max(0, min(100, round((points - base) * 100 / span))) if span else 100)
    return {
        "points": int(points),
        "level": current.level if current else 0,
        "tier": tier_public(current),
        "next": tier_public(nxt),
        "points_to_next": max(0, nxt.required_points - points) if nxt else 0,
        "progress": progress,
    }


def status_for(db: Session, user: User) -> dict:
    return status_from_points(user.royal_points or 0, cached_tiers(db))


def level_name_for(db: Session, user: User) -> str:
    """اسم مستوى المستخدم — يُستخدم في الملف الشخصي والشارات."""
    tier = level_for_points(user.royal_points or 0, cached_tiers(db))
    return tier.name_ar if tier else ""


def add_points(
    db: Session,
    user_id: int,
    points: int,
    ref: str | None = None,
    kind: str = "recharge",
    note: str = "",
) -> RoyalPointEntry | None:
    """يحرّك نقاط رويال مرة واحدة فقط لكل ``ref`` (تكرار الطلب يعيد السجل الأصلي)."""
    if points == 0:
        return None
    if ref:
        existing = db.execute(select(RoyalPointEntry).where(RoyalPointEntry.ref == ref)).scalar_one_or_none()
        if existing is not None:
            return existing

    user = db.execute(select(User).where(User.id == user_id).with_for_update()).scalar_one_or_none()
    if user is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "المستخدم غير موجود")

    balance = user.royal_points or 0
    if points < 0 and balance + points < 0:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            f"نقاط رويال غير كافية: المطلوب {abs(points)} والمتوفر {balance}",
        )

    user.royal_points = balance + points
    entry = RoyalPointEntry(
        user_id=user_id,
        points=points,
        balance_after=user.royal_points,
        kind=kind,
        ref=ref,
        note=note,
    )
    db.add(entry)
    try:
        db.flush()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status.HTTP_409_CONFLICT, "هذه العملية مسجلة مسبقاً")
    return entry


def history(db: Session, user_id: int, limit: int = 50) -> list[dict]:
    rows = (
        db.execute(
            select(RoyalPointEntry)
            .where(RoyalPointEntry.user_id == user_id)
            .order_by(RoyalPointEntry.id.desc())
            .limit(limit)
        )
        .scalars()
        .all()
    )
    return [
        {
            "id": row.id,
            "points": row.points,
            "balance_after": row.balance_after,
            "kind": row.kind,
            "note": row.note,
            "created_at": row.created_at.isoformat() if row.created_at else None,
        }
        for row in rows
    ]
