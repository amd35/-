from sqlalchemy import select
from sqlalchemy.orm import Session

from .db import engine
from .models import Base, Friend, FriendRequest, Room

ROOMS = [
    {
        "title": "جلسة طرب وونسة",
        "category": "ونسة",
        "host": "أبو رعد",
        "listeners": 1284,
        "seats_taken": 8,
        "seats_total": 8,
        "featured": True,
    },
    {
        "title": "معركة لودو — تحدي مفتوح",
        "category": "ألعاب",
        "host": "كابتن علي",
        "listeners": 642,
        "seats_taken": 3,
        "seats_total": 4,
        "is_battle": True,
        "game": "ludo",
        "featured": True,
    },
    {
        "title": "ستاند أب وضحك",
        "category": "ترفيه",
        "host": "مصطفى",
        "listeners": 921,
        "seats_taken": 6,
        "seats_total": 8,
        "featured": True,
    },
    {
        "title": "شعر ونبط عراقي",
        "category": "شعر",
        "host": "أمير النبط",
        "listeners": 470,
        "seats_taken": 5,
        "seats_total": 8,
    },
    {
        "title": "قهوة الصباح",
        "category": "ونسة",
        "host": "سارة",
        "listeners": 213,
        "seats_taken": 4,
        "seats_total": 8,
    },
    {
        "title": "دومينو — بسرعة",
        "category": "ألعاب",
        "host": "حسن",
        "listeners": 88,
        "seats_taken": 2,
        "seats_total": 2,
        "is_battle": True,
        "game": "domino",
    },
    {
        "title": "تعلّم الإنجليزية خطوة بخطوة",
        "category": "تعليم",
        "host": "أستاذ يوسف",
        "listeners": 156,
        "seats_taken": 3,
        "seats_total": 6,
    },
    {
        "title": "أونو — غرفة التحدي",
        "category": "ألعاب",
        "host": "زينب",
        "listeners": 342,
        "seats_taken": 5,
        "seats_total": 6,
        "is_battle": True,
        "game": "uno",
        "featured": True,
    },
    {
        "title": "بلياردو تحدي الليل",
        "category": "ألعاب",
        "host": "مؤيد",
        "listeners": 197,
        "seats_taken": 2,
        "seats_total": 2,
        "is_battle": True,
        "game": "billiards",
    },
    {
        "title": "قرآن كريم وترتيل",
        "category": "ديني",
        "host": "الشيخ كريم",
        "listeners": 305,
        "seats_taken": 4,
        "seats_total": 8,
    },
]

FRIENDS = [
    {"name": "كابتن علي", "handle": "@ali_battle", "level": 34, "online": True, "room": "معركة لودو — تحدي مفتوح"},
    {"name": "سارة", "handle": "@sara", "level": 21, "online": True, "room": "قهوة الصباح"},
    {"name": "حسن", "handle": "@hassan", "level": 12, "online": False, "room": None},
    {"name": "زينب", "handle": "@zainab", "level": 27, "online": True, "room": "أونو — غرفة التحدي"},
    {"name": "أمير النبط", "handle": "@amir", "level": 41, "online": False, "room": None},
    {"name": "مصطفى", "handle": "@mustafa", "level": 18, "online": True, "room": "ستاند أب وضحك"},
    {"name": "نور", "handle": "@noor", "level": 7, "online": False, "room": None},
    {"name": "مؤيد", "handle": "@muayad", "level": 25, "online": True, "room": "بلياردو تحدي الليل"},
]

REQUESTS = [
    {"name": "ريم", "handle": "@reem", "mutual": 4},
    {"name": "أنس", "handle": "@anas", "mutual": 2},
    {"name": "هدى", "handle": "@huda", "mutual": 7},
]


def seed() -> None:
    Base.metadata.create_all(engine)
    with Session(engine) as session:
        if session.scalar(select(Room.id).limit(1)) is None:
            session.add_all([Room(**row) for row in ROOMS])
        if session.scalar(select(Friend.id).limit(1)) is None:
            session.add_all([Friend(**row) for row in FRIENDS])
        if session.scalar(select(FriendRequest.id).limit(1)) is None:
            session.add_all([FriendRequest(**row) for row in REQUESTS])
        session.commit()
