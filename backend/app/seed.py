"""Initial data: gifts, store packs, settings, the bootstrap admin and one room.

Idempotent: running it again never duplicates rows and never overwrites data
the operators changed.
"""
import logging
import sys

from sqlalchemy import select
from sqlalchemy.orm import Session

from . import royal
from .config import settings
from .economy import grant_reward, get_wallet
from .models import AppSetting, Gift, Room, RoomMember, RoomMessage, StoreItem, StorePack, User
from .security import hash_password, verify_password
from .settings_store import DEFAULTS, get_setting, set_setting

log = logging.getLogger("app.seed")

GIFTS = [
    ("وردة", "Rose", "normal", "🌹", 10, 0, "both", 1),
    ("قلب", "Heart", "normal", "❤️", 25, 0, "both", 2),
    ("قهوة", "Coffee", "normal", "☕", 50, 0, "both", 3),
    ("كيك", "Cake", "normal", "🍰", 80, 0, "both", 4),
    ("دبدوب", "Teddy", "premium", "🧸", 200, 0, "both", 5),
    ("سيارة", "Car", "premium", "🚗", 500, 0, "both", 6),
    ("تاج", "Crown", "premium", "👑", 1500, 0, "user", 7),
    ("صاروخ", "Rocket", "premium", "🚀", 2000, 0, "both", 8),
    ("قصر", "Castle", "luxury", "🏰", 5000, 25, "both", 9),
    ("يخت", "Yacht", "luxury", "🛥️", 8000, 40, "both", 10),
    ("طائرة", "Jet", "luxury", "✈️", 12000, 60, "room", 11),
    ("نجمة ذهبية", "Golden Star", "luxury", "🌟", 20000, 100, "both", 12),
]

# (النوع، الاسم، الكمية، المكافأة، نقاط رويال، السعر IQD، السعر بالسنت، الشارة، الترتيب)
# حزم الجواهر هي باقات رويال: كل باقة تمنح جواهر + نقاط رويال، وكلها قابلة للتعديل من
# لوحة الإدارة (الأسعار هنا باقات مبدئية فقط).
PACKS = [
    ("coins", "500 كوين", 500, 0, 0, 5000, 399, "", 1),
    ("coins", "1,200 كوين", 1200, 200, 0, 10000, 799, "الأكثر رواجاً", 2),
    ("coins", "2,500 كوين", 2500, 500, 0, 19000, 1499, "", 3),
    ("coins", "6,500 كوين", 6500, 1500, 0, 45000, 3499, "قيمة مميزة", 4),
    ("coins", "13,000 كوين", 13000, 4000, 0, 85000, 6999, "الأفضل", 5),
    ("gold", "100 ذهب", 100, 0, 0, 25000, 1999, "", 6),
    ("gold", "500 ذهب", 500, 50, 0, 110000, 8999, "قيمة مميزة", 7),
    ("gems", "400 جوهرة", 400, 0, 7, 1320, 100, "", 11),
    ("gems", "1,800 جوهرة", 1800, 0, 14, 6600, 500, "", 12),
    ("gems", "3,800 جوهرة", 3800, 0, 28, 13200, 1000, "الأكثر رواجاً", 13),
    ("gems", "8,000 جوهرة", 8000, 0, 60, 26400, 2000, "", 14),
    ("gems", "21,000 جوهرة", 21000, 0, 150, 66000, 5000, "قيمة مميزة", 15),
    ("gems", "43,000 جوهرة", 43000, 0, 300, 132000, 10000, "الأفضل", 16),
    ("gems", "53,000 جوهرة", 53000, 0, 700, 120000, 9091, "باقة خاصة", 17),
]

# Cosmetics sold inside the app for coins/gold. ``accent``/``pips`` draw the dice
# face; a real photo can be attached to an item later through ``image_url``.
ITEMS = [
    ("dice", "نرد الجوز", "Walnut dice", "خشب جوز داكن بحواف مصقولة", 1200, 0, "#5c3618", "#f4c662", 1),
    ("dice", "نرد الرخام", "Marble dice", "رخام كريمي بعروق رمادية", 2500, 0, "#efe7da", "#2b2117", 2),
    ("dice", "نرد العاج", "Ivory dice", "عاج عتيق دافئ بتشقيقات دقيقة", 4000, 8, "#efe2cb", "#5c4426", 3),
    ("dice", "نرد النحاس", "Brass dice", "نحاس مصقول بلمعان دافئ", 7000, 15, "#b07a2e", "#2b1c07", 4),
    ("dice", "نرد الفيروز", "Turquoise dice", "فيروز شرقي بعروق ذهبية", 1800, 0, "#2aa198", "#f4cc44", 5),
    ("dice", "نرد الليل", "Midnight dice", "أزرق ليلي بحواف فضية", 3200, 0, "#1f2a5c", "#cfe3ff", 6),
    ("dice", "نرد الياقوت", "Ruby dice", "ياقوت أحمر متوهج", 5200, 12, "#9b1b30", "#ffe1e6", 7),
    ("dice", "نرد الزمرد", "Emerald dice", "زمرد أخضر بلمعان زجاجي", 9000, 20, "#0f6b4f", "#e8fff6", 8),
]


def seed(db: Session) -> None:
    _seed_admin(db)
    _seed_gifts(db)
    _seed_packs(db)
    _seed_store_items(db)
    _seed_settings(db)
    _seed_room(db)
    db.commit()
    # مستويات رويال الخمسة: تُنشأ مرة واحدة وتُدار بعدها من لوحة الإدارة.
    royal.ensure_tiers(db)


# AppSetting key holding a hash of the ADMIN_PASSWORD value last applied to the
# bootstrap account. It is what lets a password changed from inside the admin
# panel survive a restart: the environment value only overrides it when the
# secret itself changes.
ENV_PASSWORD_KEY = "_admin_password_env_hash"


def _sync_env_password(db: Session, admin: User) -> bool:
    """Apply ADMIN_PASSWORD to the bootstrap account when the secret value changed.

    The marker stores a hash of the value last applied, so restarting the API no
    longer overwrites a password the administrator changed from the panel, while
    setting a new ADMIN_PASSWORD in the secrets dashboard still does (that is the
    documented way to recover a lost password).
    """
    if not settings.admin_password:
        return False
    marker = get_setting(db, ENV_PASSWORD_KEY, None)
    if isinstance(marker, str) and verify_password(settings.admin_password, marker):
        return False
    admin.password_hash = hash_password(settings.admin_password)
    set_setting(db, ENV_PASSWORD_KEY, hash_password(settings.admin_password))
    log.warning("Password of the bootstrap administrator '%s' synced with ADMIN_PASSWORD", admin.username)
    return True


def _seed_admin(db: Session) -> None:
    existing = db.execute(select(User).where(User.username == settings.admin_username)).scalar_one_or_none()
    if existing is not None:
        changed = False
        if not existing.is_admin:
            existing.is_admin = True
            existing.admin_role = "owner"
            changed = True
        if _sync_env_password(db, existing):
            changed = True
        if changed:
            db.commit()
        return
    if not settings.admin_password:
        log.warning(
            "ADMIN_PASSWORD is empty: no administrator account was created. "
            "Set ADMIN_PASSWORD and restart the API."
        )
        return
    admin = User(
        username=settings.admin_username,
        email=settings.admin_email,
        password_hash=hash_password(settings.admin_password),
        display_name="إدارة التطبيق",
        is_admin=True,
        admin_role="owner",
        email_verified=True,
        status="active",
        notif_prefs={},
        privacy={"show_online": True, "allow_room_invites": True, "allow_gifts": True},
        voice_prefs={"mic_auto_on": False, "speaker_volume": 100},
    )
    db.add(admin)
    db.flush()
    get_wallet(db, admin.id)
    set_setting(db, ENV_PASSWORD_KEY, hash_password(settings.admin_password))
    db.commit()
    log.info("Administrator account '%s' created", admin.username)


def _seed_gifts(db: Session) -> None:
    for name, name_en, category, emoji, coins, gold, target, sort in GIFTS:
        found = db.execute(select(Gift).where(Gift.name == name)).scalar_one_or_none()
        if found is not None:
            continue
        db.add(
            Gift(
                name=name,
                name_en=name_en,
                category=category,
                emoji=emoji,
                animation="float" if category == "normal" else ("pulse" if category == "premium" else "burst"),
                price_coins=coins,
                price_gold=gold,
                target=target,
                sort=sort,
            )
        )
    db.commit()


def _seed_packs(db: Session) -> None:
    for kind, name, amount, bonus, royal_points, iqd, usd_cents, badge, sort in PACKS:
        found = db.execute(select(StorePack).where(StorePack.name == name, StorePack.kind == kind)).scalar_one_or_none()
        if found is not None:
            continue
        db.add(
            StorePack(
                kind=kind,
                name=name,
                amount=amount,
                bonus=bonus,
                royal_points=royal_points,
                price_iqd=iqd,
                price_usd_cents=usd_cents,
                badge=badge,
                sort=sort,
            )
        )
    db.commit()


def _seed_store_items(db: Session) -> None:
    for kind, name, name_en, description, coins, gold, accent, pips, sort in ITEMS:
        found = db.execute(
            select(StoreItem).where(StoreItem.name == name, StoreItem.kind == kind)
        ).scalar_one_or_none()
        if found is not None:
            continue
        db.add(
            StoreItem(
                kind=kind,
                name=name,
                name_en=name_en,
                description=description,
                price_coins=coins,
                price_gold=gold,
                accent=accent,
                pips=pips,
                sort=sort,
            )
        )
    db.commit()


def _seed_settings(db: Session) -> None:
    defaults = dict(DEFAULTS)
    for key in ("exchange_rate_usd_iqd", "ads", "offers", "games_enabled"):
        if db.get(AppSetting, key) is None:
            set_setting(db, key, defaults[key])
    db.commit()


def _seed_room(db: Session) -> None:
    owner = db.execute(select(User).where(User.username == settings.admin_username)).scalar_one_or_none()
    if owner is None:
        return
    existing = db.execute(select(Room).where(Room.name == "غرفة الأصدقاء")).scalar_one_or_none()
    if existing is not None:
        return
    room = Room(
        name="غرفة الأصدقاء",
        description="الغرفة الرئيسية للتجربة والترحيب بالأعضاء الجدد.",
        background="sunset",
        rules=(
            "1. احترام جميع الأعضاء\n"
            "2. يمنع السب والشتم\n"
            "3. ممنوع إرسال الروابط\n"
            "4. يمنع طلب الهدايا أو التحويل\n"
            "5. عدم الترويج لأي حسابات خارجية\n"
            "6. الالتزام بالهدوء والنظام"
        ),
        seat_count=20,
        locked_seats=[7, 9, 13, 18],
        owner_id=owner.id,
        gifts_enabled=True,
        chat_enabled=True,
    )
    db.add(room)
    db.flush()
    db.add(RoomMember(room_id=room.id, user_id=owner.id, role="owner", seat_index=0, mic_granted=True))
    db.add(
        RoomMessage(
            room_id=room.id,
            user_id=owner.id,
            kind="system",
            text="مرحباً بكم في غرفة الأصدقاء 💛 التزموا بالقوانين واحترموا الجميع",
        )
    )
    db.commit()
    log.info("Sample room '%s' created", room.name)


def main() -> int:
    from .db import SessionLocal

    db = SessionLocal()
    try:
        seed(db)
        log.info("Seed completed")
    finally:
        db.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
