from datetime import datetime, timedelta, timezone

from sqlalchemy import select, text
from sqlalchemy.orm import Session

from .db import engine
from .models import (
    Activity,
    Base,
    Friend,
    FriendRequest,
    Notification,
    Profile,
    Room,
    Task,
    now_iso,
)

ROOMS = [
    {"title": "جلسة طرب وونسة", "category": "ونسة", "host": "أبو رعد", "listeners": 1284, "seats_taken": 8, "seats_total": 8, "featured": True},
    {"title": "معركة لودو — تحدي مفتوح", "category": "ألعاب", "host": "كابتن علي", "listeners": 642, "seats_taken": 3, "seats_total": 4, "is_battle": True, "game": "ludo", "featured": True},
    {"title": "ستاند أب وضحك", "category": "ترفيه", "host": "مصطفى", "listeners": 921, "seats_taken": 6, "seats_total": 8, "featured": True},
    {"title": "شعر ونبط عراقي", "category": "شعر", "host": "أمير النبط", "listeners": 470, "seats_taken": 5, "seats_total": 8},
    {"title": "قهوة الصباح", "category": "ونسة", "host": "سارة", "listeners": 213, "seats_taken": 4, "seats_total": 8},
    {"title": "دومينو — بسرعة", "category": "ألعاب", "host": "حسن", "listeners": 88, "seats_taken": 2, "seats_total": 2, "is_battle": True, "game": "domino"},
    {"title": "تعلّم الإنجليزية خطوة بخطوة", "category": "تعليم", "host": "أستاذ يوسف", "listeners": 156, "seats_taken": 3, "seats_total": 6},
    {"title": "أونو — غرفة التحدي", "category": "ألعاب", "host": "زينب", "listeners": 342, "seats_taken": 5, "seats_total": 6, "is_battle": True, "game": "uno", "featured": True},
    {"title": "بلياردو تحدي الليل", "category": "ألعاب", "host": "مؤيد", "listeners": 197, "seats_taken": 2, "seats_total": 2, "is_battle": True, "game": "billiards"},
    {"title": "قرآن كريم وترتيل", "category": "ديني", "host": "الشيخ كريم", "listeners": 305, "seats_taken": 4, "seats_total": 8},
]

FRIENDS = [
    {"name": "كابتن علي", "handle": "@ali_battle", "level": 34, "online": True, "room": "معركة لودو — تحدي مفتوح", "last_seen": None},
    {"name": "سارة", "handle": "@sara", "level": 21, "online": True, "room": "قهوة الصباح", "last_seen": None},
    {"name": "حسن", "handle": "@hassan", "level": 12, "online": False, "room": None, "last_seen": "قبل 25 دقيقة"},
    {"name": "زينب", "handle": "@zainab", "level": 27, "online": True, "room": "أونو — غرفة التحدي", "last_seen": None},
    {"name": "أمير النبط", "handle": "@amir", "level": 41, "online": False, "room": None, "last_seen": "أمس"},
    {"name": "مصطفى", "handle": "@mustafa", "level": 18, "online": True, "room": "ستاند أب وضحك", "last_seen": None},
    {"name": "نور", "handle": "@noor", "level": 7, "online": False, "room": None, "last_seen": "قبل 3 أيام"},
    {"name": "مؤيد", "handle": "@muayad", "level": 25, "online": True, "room": "بلياردو تحدي الليل", "last_seen": None},
    {"name": "ليلى", "handle": "@layla", "level": 9, "online": True, "room": None, "last_seen": None},
]

REQUESTS = [
    {"name": "ريم", "handle": "@reem", "mutual": 4},
    {"name": "أنس", "handle": "@anas", "mutual": 2},
    {"name": "هدى", "handle": "@huda", "mutual": 7},
]

TASKS = [
    {"title": "مراجعة مقاعد الغرف الصوتية", "project": "التطوير", "done": False},
    {"title": "إضافة ألعاب جديدة إلى قسم المعركة", "project": "التطوير", "done": False},
    {"title": "تحسين صفحة الأصدقاء على الجوال", "project": "التصميم", "done": True},
    {"title": "اختبار تدفق إنشاء الغرفة", "project": "الجودة", "done": False},
    {"title": "كتابة دليل المضيف الجديد", "project": "المحتوى", "done": True},
]

NOTIFICATIONS = [
    {"title": "غرفة جديدة في قسم المعركة", "body": "أضاف كابتن علي غرفة لودو جديدة — انضم للتحدي.", "kind": "info", "read": False},
    {"title": "أكملت 5 معارك", "body": "حصلت على 1000 عملة إضافية في محفظتك.", "kind": "reward", "read": False},
    {"title": "طلب صداقة جديد", "body": "أرسلت هدى طلب صداقة — راجع صفحة الأصدقاء.", "kind": "social", "read": False},
    {"title": "تحديث مدة الجلسة", "body": "أصبح بإمكانك البقاء في الغرفة حتى 4 ساعات.", "kind": "info", "read": True},
    {"title": "صيانة مجدولة", "body": "ستتوقف خدمة الغرف يوم الجمعة 2:00 صباحًا لمدة 20 دقيقة.", "kind": "alert", "read": True},
]

ACTIVITY = [
    ("room_created", "أُنشئت الغرفة: جلسة طرب وونسة", 6),
    ("room_joined", "انضم 128 مستخدمًا إلى: جلسة طرب وونسة", 5),
    ("task_completed", "أُنجزت مهمة: تحسين صفحة الأصدقاء على الجوال", 4),
    ("room_created", "أُنشئت الغرفة: معركة لودو — تحدي مفتوح", 4),
    ("friend_added", "أُضيف الصديق: ليلى", 3),
    ("room_joined", "انضم 64 مستخدمًا إلى: أونو — غرفة التحدي", 3),
    ("notification_read", "تم قراءة تنبيه: تحديث مدة الجلسة", 2),
    ("room_left", "خرج المضيف من: بلياردو تحدي الليل", 2),
    ("task_created", "مهمة جديدة: اختبار تدفق إنشاء الغرفة", 1),
    ("profile_updated", "تم تحديث الملف الشخصي", 1),
    ("room_created", "أُنشئت الغرفة: ستاند أب وضحك", 0),
    ("friend_added", "أُضيف الصديق: مؤيد", 0),
]


def _add_column(connection, table: str, column: str, ddl: str) -> None:
    if connection.dialect.name != "postgresql":
        return
    connection.execute(text(f"ALTER TABLE {table} ADD COLUMN IF NOT EXISTS {column} {ddl}"))


def seed() -> None:
    Base.metadata.create_all(engine)

    # Columns added after the first release; keep existing databases in sync.
    with engine.begin() as connection:
        _add_column(connection, "friends", "last_seen", "VARCHAR(40)")
        _add_column(connection, "rooms", "created_at", "VARCHAR(40)")
        connection.execute(
            text("UPDATE rooms SET created_at = :ts WHERE created_at IS NULL"),
            {"ts": now_iso()},
        )

    with Session(engine) as session:
        if session.scalar(select(Room.id).limit(1)) is None:
            session.add_all([Room(**row) for row in ROOMS])

        for row in FRIENDS:
            friend = session.scalar(select(Friend).where(Friend.handle == row["handle"]))
            if friend is None:
                session.add(Friend(**row))
                continue
            friend.name = row["name"]
            friend.level = row["level"]
            friend.online = row["online"]
            friend.room = row["room"]
            friend.last_seen = row["last_seen"]

        if session.scalar(select(FriendRequest.id).limit(1)) is None:
            session.add_all([FriendRequest(**row) for row in REQUESTS])

        if session.get(Profile, 1) is None:
            session.add(Profile(id=1))

        if session.scalar(select(Task.id).limit(1)) is None:
            session.add_all([Task(**row, created_at=now_iso()) for row in TASKS])

        if session.scalar(select(Notification.id).limit(1)) is None:
            session.add_all(
                [Notification(**row, created_at=now_iso()) for row in NOTIFICATIONS]
            )

        if session.scalar(select(Activity.id).limit(1)) is None:
            now = datetime.now(timezone.utc)
            session.add_all(
                [
                    Activity(
                        action=action,
                        detail=detail,
                        created_at=(now - timedelta(days=days)).isoformat(timespec="seconds"),
                    )
                    for action, detail, days in ACTIVITY
                ]
            )

        session.commit()
