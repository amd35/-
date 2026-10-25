"""Games: lobby (Ludo, Domino), tables, moves and reconnect.

Every rule check happens here on the server: clients send intents ("roll",
"move", "play") and the engine decides whether they are legal. Actions are also
accepted over this REST API, so the Android client and the tests can play
without a websocket.
"""
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from ..db import get_db
from ..games import GAME_NAMES, service
from ..models import User
from ..security import get_current_user, rate_limit
from ..settings_store import get_setting

router = APIRouter(prefix="/api/games", tags=["games"])


class CreateGameIn(BaseModel):
    game: str = Field(pattern="^(ludo|domino)$")
    name: str = ""
    max_players: int = 4
    is_private: bool = False


class ActionIn(BaseModel):
    action: str
    payload: dict = Field(default_factory=dict)


@router.get("/catalog")
def catalog(db: Session = Depends(get_db)) -> dict:
    flags = get_setting(db, "games_enabled", {}) or {}
    games = []
    for key, name in GAME_NAMES.items():
        games.append(
            {
                "key": key,
                "name": name,
                "enabled": bool(flags.get(key, False)),
                "min_players": service.MIN_PLAYERS,
                "max_players": service.MAX_PLAYERS,
                "target_score": int(get_setting(db, "domino_target_score", 100)) if key == "domino" else None,
            }
        )
    return {"games": games, "win_reward_coins": int(get_setting(db, "game_win_reward_coins", 200))}


@router.get("/board/ludo")
def ludo_board() -> dict:
    return service.board_geometry()


@router.get("/rooms")
def list_rooms(
    game: Optional[str] = Query(default=None),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> dict:
    return {"rooms": service.open_rooms(db, game)}


@router.post("/rooms", status_code=status.HTTP_201_CREATED)
def create_room(
    payload: CreateGameIn,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    rate_limit(f"game-create:{user.id}", limit=20, window_seconds=300)
    room = service.create_game(db, user, payload.game, payload.name, payload.max_players, payload.is_private)
    return {"room": service.state_payload(db, room, user)}


@router.get("/rooms/{room_id}")
def get_room(
    room_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    room = service.require_room(db, room_id)
    return {"room": service.state_payload(db, room, user)}


@router.post("/rooms/{room_id}/join")
def join_room(
    room_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    room = service.require_room(db, room_id)
    service.join_game(db, room, user)
    return {"room": service.state_payload(db, room, user)}


@router.post("/rooms/{room_id}/leave")
def leave_room(
    room_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    room = service.require_room(db, room_id)
    service.leave_game(db, room, user)
    return {"room": service.state_payload(db, room, user)}


@router.post("/rooms/{room_id}/ready")
def ready(
    room_id: int,
    value: bool = Query(default=True),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    room = service.require_room(db, room_id)
    service.set_ready(db, room, user, value)
    return {"room": service.state_payload(db, room, user)}


@router.post("/rooms/{room_id}/start")
def start(
    room_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    room = service.require_room(db, room_id)
    service.start_game(db, room, user)
    return {"room": service.state_payload(db, room, user)}


@router.post("/rooms/{room_id}/action")
def action(
    room_id: int,
    payload: ActionIn,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    rate_limit(f"game-action:{user.id}", limit=240, window_seconds=60)
    room = service.require_room(db, room_id)
    state = service.apply_action(db, room, user, payload.action, payload.payload)
    return {"room": state}


@router.get("/rooms/{room_id}/moves")
def room_moves(
    room_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    service.require_room(db, room_id)
    if service.membership(db, room_id, user.id) is None:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "أنت لست على هذه الطاولة")
    return {"moves": service.moves(db, room_id)}


@router.delete("/rooms/{room_id}")
def close_room(
    room_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    room = service.require_room(db, room_id)
    if room.host_id != user.id and not user.is_admin:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "صاحب الطاولة وحده يغلقها")
    service.close_game(db, room, force=bool(user.is_admin))
    return {"ok": True}
