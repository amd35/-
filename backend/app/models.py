from sqlalchemy import Boolean, Integer, String
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


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


class Friend(Base):
    __tablename__ = "friends"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(60))
    handle: Mapped[str] = mapped_column(String(60))
    level: Mapped[int] = mapped_column(Integer, default=1)
    online: Mapped[bool] = mapped_column(Boolean, default=False)
    room: Mapped[str | None] = mapped_column(String(120), nullable=True)


class FriendRequest(Base):
    __tablename__ = "friend_requests"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(60))
    handle: Mapped[str] = mapped_column(String(60))
    mutual: Mapped[int] = mapped_column(Integer, default=0)
