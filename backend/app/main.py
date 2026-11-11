import os
import time
from collections import Counter
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from sqlalchemy import select, text
from sqlalchemy.exc import OperationalError
from sqlalchemy.orm import Session

from .db import engine
from .models import (
    Activity,
    Base,
    ContactMessage,
    Friend,
    FriendRequest,
    Notification,
    Profile,
    Room,
    Task,
    now_iso,
)
from .seed import seed

GAMES = [
    {"key": "ludo", "name": "لودو", "players": "2 - 4", "accent": "#f59e0b"},
    {"key": "domino", "name": "دومينو", "players": "2", "accent": "#22d3ee"},
    {"key": "uno", "name": "أونو", "players": "2 - 6", "accent": "#ef4444"},
    {"key": "billiards", "name": "بلياردو", "players": "2", "accent": "#a855f7"},
]


@asynccontextmanager
async def lifespan(_: FastAPI):
    for attempt in range(15):
        try:
            seed()
            break
        except OperationalError:
            if attempt == 14:
                raise
            time.sleep(2)
    yield


app = FastAPI(title="يلا فون API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        origin.strip()
        for origin in os.environ.get(
            "ALLOWED_ORIGINS", "http://localhost:3000,http://localhost:5173"
        ).split(",")
        if origin.strip()
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class RoomCreate(BaseModel):
    title: str = Field(min_length=2, max_length=120)
    category: str = "ونسة"
    host: str = "المستخدم"
    seats_total: int = Field(default=8, ge=2, le=12)
    is_battle: bool = False
    game: str | None = None


class TaskCreate(BaseModel):
    title: str = Field(min_length=2, max_length=140)
    project: str = "عام"


class TaskUpdate(BaseModel):
    done: bool


class ProfileUpdate(BaseModel):
    name: str | None = None
    handle: str | None = None
    bio: str | None = None
    language: str | None = None
    push_enabled: bool | None = None
    sound_enabled: bool | None = None


class ContactCreate(BaseModel):
    name: str = Field(min_length=2, max_length=80)
    email: str = Field(min_length=3, max_length=120)
    message: str = Field(min_length=3, max_length=1000)


def log(session: Session, action: str, detail: str) -> None:
    session.add(Activity(action=action, detail=detail, created_at=now_iso()))


def room_dict(room: Room) -> dict:
    return {
        "id": room.id,
        "title": room.title,
        "category": room.category,
        "host": room.host,
        "listeners": room.listeners,
        "seats_taken": room.seats_taken,
        "seats_total": room.seats_total,
        "language": room.language,
        "is_battle": room.is_battle,
        "game": room.game,
        "featured": room.featured,
        "created_at": room.created_at,
    }


def task_dict(task: Task) -> dict:
    return {
        "id": task.id,
        "title": task.title,
        "project": task.project,
        "done": task.done,
        "created_at": task.created_at,
    }


def notification_dict(item: Notification) -> dict:
    return {
        "id": item.id,
        "title": item.title,
        "body": item.body,
        "kind": item.kind,
        "read": item.read,
        "created_at": item.created_at,
    }


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


# --- profile -----------------------------------------------------------------


@app.get("/api/me")
def me() -> dict:
    with Session(engine) as session:
        profile = session.get(Profile, 1)
        if profile is None:
            raise HTTPException(status_code=500, detail="الملف الشخصي غير مهيأ")
        return {
            "name": profile.name,
            "handle": profile.handle,
            "level": profile.level,
            "coins": profile.coins,
            "diamonds": profile.diamonds,
            "bio": profile.bio,
            "language": profile.language,
            "push_enabled": profile.push_enabled,
            "sound_enabled": profile.sound_enabled,
        }


@app.patch("/api/me")
def update_me(payload: ProfileUpdate) -> dict:
    with Session(engine) as session:
        profile = session.get(Profile, 1)
        if profile is None:
            raise HTTPException(status_code=500, detail="الملف الشخصي غير مهيأ")
        for key, value in payload.model_dump(exclude_none=True).items():
            setattr(profile, key, value)
        log(session, "profile_updated", "تم تحديث الملف الشخصي")
        session.commit()
    return me()


# --- rooms -------------------------------------------------------------------


@app.get("/api/games")
def games() -> list[dict[str, str]]:
    return GAMES


@app.get("/api/rooms")
def rooms(
    battle: bool | None = None, featured: bool | None = None, q: str | None = None
) -> list[dict]:
    with Session(engine) as session:
        query = select(Room).order_by(Room.listeners.desc())
        if battle is not None:
            query = query.where(Room.is_battle.is_(battle))
        if featured is not None:
            query = query.where(Room.featured.is_(featured))
        rows = session.scalars(query).all()
        term = (q or "").strip()
        if term:
            rows = [row for row in rows if term in row.title or term in row.host]
        return [room_dict(row) for row in rows]


@app.get("/api/rooms/{room_id}")
def room(room_id: int) -> dict:
    with Session(engine) as session:
        found = session.get(Room, room_id)
        if found is None:
            raise HTTPException(status_code=404, detail="الغرفة غير موجودة")
        return room_dict(found)


@app.post("/api/rooms", status_code=201)
def create_room(payload: RoomCreate) -> dict:
    with Session(engine) as session:
        created = Room(
            title=payload.title,
            category=payload.category,
            host=payload.host,
            listeners=1,
            seats_taken=1,
            seats_total=payload.seats_total,
            is_battle=payload.is_battle,
            game=payload.game,
            created_at=now_iso(),
        )
        session.add(created)
        log(session, "room_created", f"أُنشئت الغرفة: {payload.title}")
        session.commit()
        session.refresh(created)
        return room_dict(created)


@app.delete("/api/rooms/{room_id}", status_code=204)
def delete_room(room_id: int) -> None:
    with Session(engine) as session:
        found = session.get(Room, room_id)
        if found is None:
            raise HTTPException(status_code=404, detail="الغرفة غير موجودة")
        session.delete(found)
        log(session, "room_deleted", f"حُذفت الغرفة: {found.title}")
        session.commit()


@app.post("/api/rooms/{room_id}/join")
def join_room(room_id: int) -> dict:
    with Session(engine) as session:
        found = session.get(Room, room_id)
        if found is None:
            raise HTTPException(status_code=404, detail="الغرفة غير موجودة")
        found.listeners += 1
        log(session, "room_joined", f"انضممت إلى: {found.title}")
        session.commit()
        session.refresh(found)
        return room_dict(found)


@app.post("/api/rooms/{room_id}/leave")
def leave_room(room_id: int) -> dict:
    with Session(engine) as session:
        found = session.get(Room, room_id)
        if found is None:
            raise HTTPException(status_code=404, detail="الغرفة غير موجودة")
        found.listeners = max(0, found.listeners - 1)
        log(session, "room_left", f"خرجت من: {found.title}")
        session.commit()
        session.refresh(found)
        return room_dict(found)


# --- friends -----------------------------------------------------------------


@app.get("/api/friends")
def friends() -> list[dict]:
    with Session(engine) as session:
        rows = session.scalars(
            select(Friend).order_by(Friend.online.desc(), Friend.name)
        ).all()
        return [
            {
                "id": row.id,
                "name": row.name,
                "handle": row.handle,
                "level": row.level,
                "online": row.online,
                "room": row.room,
                "last_seen": row.last_seen,
            }
            for row in rows
        ]


@app.get("/api/friend-requests")
def friend_requests() -> list[dict]:
    with Session(engine) as session:
        rows = session.scalars(select(FriendRequest).order_by(FriendRequest.id)).all()
        return [
            {"id": row.id, "name": row.name, "handle": row.handle, "mutual": row.mutual}
            for row in rows
        ]


# --- tasks -------------------------------------------------------------------


@app.get("/api/tasks")
def tasks() -> list[dict]:
    with Session(engine) as session:
        rows = session.scalars(select(Task).order_by(Task.done, Task.id.desc())).all()
        return [task_dict(row) for row in rows]


@app.post("/api/tasks", status_code=201)
def create_task(payload: TaskCreate) -> dict:
    with Session(engine) as session:
        task = Task(title=payload.title, project=payload.project, created_at=now_iso())
        session.add(task)
        log(session, "task_created", f"مهمة جديدة: {payload.title}")
        session.commit()
        session.refresh(task)
        return task_dict(task)


@app.patch("/api/tasks/{task_id}")
def update_task(task_id: int, payload: TaskUpdate) -> dict:
    with Session(engine) as session:
        task = session.get(Task, task_id)
        if task is None:
            raise HTTPException(status_code=404, detail="المهمة غير موجودة")
        task.done = payload.done
        log(
            session,
            "task_completed" if payload.done else "task_reopened",
            f"{task.title}",
        )
        session.commit()
        session.refresh(task)
        return task_dict(task)


@app.delete("/api/tasks/{task_id}", status_code=204)
def delete_task(task_id: int) -> None:
    with Session(engine) as session:
        task = session.get(Task, task_id)
        if task is None:
            raise HTTPException(status_code=404, detail="المهمة غير موجودة")
        session.delete(task)
        log(session, "task_deleted", task.title)
        session.commit()


# --- activity, notifications, contact ---------------------------------------


@app.get("/api/activity")
def activity(limit: int = 40) -> list[dict]:
    with Session(engine) as session:
        rows = session.scalars(
            select(Activity).order_by(Activity.id.desc()).limit(limit)
        ).all()
        return [
            {
                "id": row.id,
                "action": row.action,
                "detail": row.detail,
                "created_at": row.created_at,
            }
            for row in rows
        ]


@app.get("/api/notifications")
def notifications() -> list[dict]:
    with Session(engine) as session:
        rows = session.scalars(
            select(Notification).order_by(Notification.read, Notification.id.desc())
        ).all()
        return [notification_dict(row) for row in rows]


@app.patch("/api/notifications/{notification_id}")
def read_notification(notification_id: int, payload: dict | None = None) -> dict:
    with Session(engine) as session:
        item = session.get(Notification, notification_id)
        if item is None:
            raise HTTPException(status_code=404, detail="التنبيه غير موجود")
        item.read = bool((payload or {}).get("read", True))
        session.commit()
        session.refresh(item)
        return notification_dict(item)


@app.post("/api/notifications/read-all")
def read_all_notifications() -> dict[str, int]:
    with Session(engine) as session:
        rows = session.scalars(select(Notification).where(Notification.read.is_(False))).all()
        for item in rows:
            item.read = True
        session.commit()
        return {"updated": len(rows)}


@app.post("/api/contact", status_code=201)
def contact(payload: ContactCreate) -> dict[str, str]:
    with Session(engine) as session:
        session.add(
            ContactMessage(
                name=payload.name,
                email=payload.email,
                message=payload.message,
                created_at=now_iso(),
            )
        )
        log(session, "contact_message", f"رسالة من {payload.name}")
        session.commit()
    return {"status": "received"}


# --- metrics -----------------------------------------------------------------


@app.get("/api/metrics")
def metrics() -> dict:
    with Session(engine) as session:
        rooms_rows = session.scalars(select(Room)).all()
        friends_rows = session.scalars(select(Friend)).all()
        task_rows = session.scalars(select(Task)).all()
        activity_rows = session.scalars(
            select(Activity).order_by(Activity.id.desc()).limit(200)
        ).all()
        notification_rows = session.scalars(select(Notification)).all()

        categories = Counter(row.category for row in rooms_rows)
        days = Counter(row.created_at[:10] for row in activity_rows)

        return {
            "rooms_total": len(rooms_rows),
            "battle_rooms": sum(1 for row in rooms_rows if row.is_battle),
            "listeners_total": sum(row.listeners for row in rooms_rows),
            "friends_online": sum(1 for row in friends_rows if row.online),
            "friends_total": len(friends_rows),
            "tasks_open": sum(1 for row in task_rows if not row.done),
            "tasks_done": sum(1 for row in task_rows if row.done),
            "unread_notifications": sum(1 for row in notification_rows if not row.read),
            "categories": [
                {"name": name, "count": count}
                for name, count in categories.most_common()
            ],
            "activity_by_day": [
                {"day": day, "count": count} for day, count in sorted(days.items())[-7:]
            ],
            "top_rooms": [
                {"title": row.title, "listeners": row.listeners}
                for row in sorted(rooms_rows, key=lambda item: item.listeners, reverse=True)[:5]
            ],
        }
