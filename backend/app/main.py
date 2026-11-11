import os
import time
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import select
from sqlalchemy.exc import OperationalError
from sqlalchemy.orm import Session

from .db import engine
from .models import Friend, FriendRequest, Room
from .seed import seed

GAMES = [
    {"key": "ludo", "name": "لودو", "players": "2 - 4", "accent": "#f59e0b"},
    {"key": "domino", "name": "دومينو", "players": "2", "accent": "#22d3ee"},
    {"key": "uno", "name": "أونو", "players": "2 - 6", "accent": "#ef4444"},
    {"key": "billiards", "name": "بلياردو", "players": "2", "accent": "#a855f7"},
]

ME = {
    "name": "المستخدم",
    "handle": "@me",
    "level": 15,
    "coins": 2450,
    "diamonds": 86,
}


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


app = FastAPI(title="صوتيات API", lifespan=lifespan)

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
    }


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/api/me")
def me() -> dict[str, str | int]:
    return ME


@app.get("/api/games")
def games() -> list[dict[str, str]]:
    return GAMES


@app.get("/api/rooms")
def rooms(battle: bool | None = None, featured: bool | None = None) -> list[dict]:
    with Session(engine) as session:
        query = select(Room).order_by(Room.listeners.desc())
        if battle is not None:
            query = query.where(Room.is_battle.is_(battle))
        if featured is not None:
            query = query.where(Room.featured.is_(featured))
        return [room_dict(room) for room in session.scalars(query).all()]


@app.get("/api/rooms/{room_id}")
def room(room_id: int) -> dict:
    with Session(engine) as session:
        found = session.get(Room, room_id)
        if found is None:
            raise HTTPException(status_code=404, detail="الغرفة غير موجودة")
        data = room_dict(found)
        data["listeners"] = found.listeners + 1
        return data


@app.get("/api/friends")
def friends() -> list[dict]:
    with Session(engine) as session:
        rows = session.scalars(select(Friend).order_by(Friend.online.desc(), Friend.name)).all()
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
