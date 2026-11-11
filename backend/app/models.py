from datetime import datetime, timezone

from sqlalchemy import Boolean, Float, Integer, String
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


class Base(DeclarativeBase):
    pass


class Room(Base):
    __tablename__ = "rooms"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    title: Mapped[str] = mapped_column(String(120))
    category: Mapped[str] = mapped_column(String(40))
    host: Mapped[str] = mapped_column(String(60))
    listeners: Mapped[int] = mapped_column(Integer, default=0)
    seats_taken: Mapped[int] = mapped_column(Integer, default=1)
    seats_total: Mapped[int] = mapped_column(Integer, default=8)
    language: Mapped[str] = mapped_column(String(20), default="العربية")
    is_battle: Mapped[bool] = mapped_column(Boolean, default=False)
    game: Mapped[str | None] = mapped_column(String(40), nullable=True)
    featured: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[str] = mapped_column(String(40), default=now_iso)


class Friend(Base):
    __tablename__ = "friends"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(60))
    handle: Mapped[str] = mapped_column(String(60))
    level: Mapped[int] = mapped_column(Integer, default=1)
    online: Mapped[bool] = mapped_column(Boolean, default=False)
    room: Mapped[str | None] = mapped_column(String(120), nullable=True)
    last_seen: Mapped[str | None] = mapped_column(String(40), nullable=True)


class FriendRequest(Base):
    __tablename__ = "friend_requests"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(60))
    handle: Mapped[str] = mapped_column(String(60))
    mutual: Mapped[int] = mapped_column(Integer, default=0)


class Profile(Base):
    __tablename__ = "profile"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(60), default="المستخدم")
    handle: Mapped[str] = mapped_column(String(60), default="@me")
    level: Mapped[int] = mapped_column(Integer, default=15)
    coins: Mapped[int] = mapped_column(Integer, default=2450)
    diamonds: Mapped[int] = mapped_column(Integer, default=86)
    bio: Mapped[str] = mapped_column(String(200), default="أحب الغرف الصوتية والألعاب")
    language: Mapped[str] = mapped_column(String(20), default="ar")
    push_enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    sound_enabled: Mapped[bool] = mapped_column(Boolean, default=True)


class Task(Base):
    __tablename__ = "tasks"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    title: Mapped[str] = mapped_column(String(140))
    project: Mapped[str] = mapped_column(String(60), default="عام")
    done: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[str] = mapped_column(String(40), default=now_iso)


class Activity(Base):
    __tablename__ = "activity"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    action: Mapped[str] = mapped_column(String(60))
    detail: Mapped[str] = mapped_column(String(200))
    created_at: Mapped[str] = mapped_column(String(40), default=now_iso)


class Notification(Base):
    __tablename__ = "notifications"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    title: Mapped[str] = mapped_column(String(120))
    body: Mapped[str] = mapped_column(String(240))
    kind: Mapped[str] = mapped_column(String(30), default="info")
    read: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[str] = mapped_column(String(40), default=now_iso)


class SystemEntry(Base):
    __tablename__ = "systems"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    code: Mapped[str] = mapped_column(String(12), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(120), index=True)
    specialty: Mapped[str] = mapped_column(String(60), index=True)
    vendor: Mapped[str] = mapped_column(String(80))
    governorate: Mapped[str] = mapped_column(String(40))
    status: Mapped[str] = mapped_column(String(20), index=True, default="يعمل")
    version: Mapped[str] = mapped_column(String(20))
    users: Mapped[int] = mapped_column(Integer, default=0)
    uptime: Mapped[float] = mapped_column(Float, default=0.0)
    description: Mapped[str] = mapped_column(String(400))
    created_at: Mapped[str] = mapped_column(String(40), default=now_iso)


class ContactMessage(Base):
    __tablename__ = "contact_messages"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(80))
    email: Mapped[str] = mapped_column(String(120))
    message: Mapped[str] = mapped_column(String(1000))
    created_at: Mapped[str] = mapped_column(String(40), default=now_iso)
