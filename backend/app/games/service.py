"""Game service: database + realtime + rewards around the pure rules engines."""
import json
from typing import Any, Optional

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..economy import grant_reward
from ..models import GameMove, GamePlayer, GameRoom, User, utcnow
from ..notifications import create_notification
from ..realtime import hub
from ..serializers import iso, user_public
from ..settings_store import get_setting
from . import ENGINES, GAME_NAMES

MIN_PLAYERS = 2
MAX_PLAYERS = 4


def channel(room_id: int) -> str:
    return f"game:{room_id}"


def require_game(game: str) -> Any:
    engine = ENGINES.get(game)
    if engine is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "هذه اللعبة غير متاحة")
    return engine


def game_enabled(db: Session, game: str) -> bool:
    flags = get_setting(db, "games_enabled", {}) or {}
    return bool(flags.get(game, False))


def require_enabled(db: Session, game: str) -> None:
    if not game_enabled(db, game):
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            f"لعبة {GAME_NAMES.get(game, game)} معطّلة حالياً من لوحة الإدارة",
        )


def require_room(db: Session, room_id: int) -> GameRoom:
    room = db.get(GameRoom, room_id)
    if room is None or room.status == "closed":
        raise HTTPException(status.HTTP_404_NOT_FOUND, "طاولة اللعب غير موجودة")
    return room


def players(db: Session, room_id: int) -> list[tuple[GamePlayer, User]]:
    return list(
        db.execute(
            select(GamePlayer, User)
            .join(User, User.id == GamePlayer.user_id)
            .where(GamePlayer.game_room_id == room_id)
            .order_by(GamePlayer.seat)
        ).all()
    )


def membership(db: Session, room_id: int, user_id: int) -> Optional[GamePlayer]:
    return db.execute(
        select(GamePlayer).where(GamePlayer.game_room_id == room_id, GamePlayer.user_id == user_id)
    ).scalar_one_or_none()


def _free_seat(db: Session, room_id: int, max_players: int) -> Optional[int]:
    taken = {
        int(seat)
        for seat in db.execute(
            select(GamePlayer.seat).where(GamePlayer.game_room_id == room_id)
        ).scalars()
    }
    for seat in range(max_players):
        if seat not in taken:
            return seat
    return None


def log_move(db: Session, room: GameRoom, user_id: Optional[int], kind: str, payload: dict) -> GameMove:
    seq = int(
        db.execute(
            select(func.coalesce(func.max(GameMove.seq), 0)).where(GameMove.game_room_id == room.id)
        ).scalar()
        or 0
    ) + 1
    move = GameMove(game_room_id=room.id, user_id=user_id, seq=seq, kind=kind, payload=payload)
    db.add(move)
    return move


def create_game(
    db: Session,
    user: User,
    game: str,
    name: str = "",
    max_players: int = 4,
    is_private: bool = False,
) -> GameRoom:
    require_game(game)
    require_enabled(db, game)
    seats = max(MIN_PLAYERS, min(MAX_PLAYERS, int(max_players or 4)))
    room = GameRoom(
        game=game,
        name=(name or f"طاولة {GAME_NAMES.get(game, game)}").strip()[:64],
        host_id=user.id,
        max_players=seats,
        is_private=bool(is_private),
        status="waiting",
        state={},
        config={"target": int(get_setting(db, "domino_target_score", 100))} if game == "domino" else {},
    )
    db.add(room)
    db.flush()
    db.add(GamePlayer(game_room_id=room.id, user_id=user.id, seat=0, ready=True))
    log_move(db, room, user.id, "create", {"game": game})
    db.commit()
    db.refresh(room)
    return room


def join_game(db: Session, room: GameRoom, user: User) -> GamePlayer:
    existing = membership(db, room.id, user.id)
    if existing is not None:
        existing.connected = True
        db.commit()
        return existing
    require_enabled(db, room.game)
    if room.status != "waiting":
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "بدأت المباراة، لا يمكن الانضمام الآن")
    seat = _free_seat(db, room.id, room.max_players)
    if seat is None:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "الطاولة ممتلئة")
    player = GamePlayer(game_room_id=room.id, user_id=user.id, seat=seat)
    db.add(player)
    log_move(db, room, user.id, "join", {"seat": seat})
    db.commit()
    db.refresh(player)
    _broadcast(db, room)
    return player


def leave_game(db: Session, room: GameRoom, user: User) -> None:
    player = membership(db, room.id, user.id)
    if player is None:
        return
    if room.status == "waiting":
        db.delete(player)
        log_move(db, room, user.id, "leave", {"seat": player.seat})
        db.commit()
        remaining = players(db, room.id)
        if not remaining:
            room.status = "closed"
            db.commit()
            return
        if room.host_id == user.id:
            room.host_id = remaining[0][0].user_id
            db.commit()
    else:
        # Keep the seat so the player can reconnect to a running match.
        player.connected = False
        log_move(db, room, user.id, "offline", {"seat": player.seat})
        db.commit()
        # A table nobody is connected to must not stay "playing" forever.
        if not any(other.connected for other, _ in players(db, room.id)):
            room.status = "closed"
            db.commit()
            log_move(db, room, None, "abandoned", {})
            hub.notify_channel(channel(room.id), {"type": "game_closed", "game_room_id": room.id})
            return
    _broadcast(db, room)


def set_ready(db: Session, room: GameRoom, user: User, ready: bool) -> GamePlayer:
    player = membership(db, room.id, user.id)
    if player is None:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "أنت لست على هذه الطاولة")
    if room.status != "waiting":
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "بدأت المباراة")
    player.ready = bool(ready)
    db.commit()
    _broadcast(db, room)
    return player


def start_game(db: Session, room: GameRoom, actor: User, force: bool = False) -> GameRoom:
    engine = require_game(room.game)
    require_enabled(db, room.game)
    if room.status == "playing":
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "المباراة جارية")
    if room.status == "finished":
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "المباراة منتهية، أنشئ طاولة جديدة")

    rows = players(db, room.id)
    if room.host_id != actor.id and not force:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "صاحب الطاولة وحده يبدأ المباراة")
    if len(rows) < MIN_PLAYERS:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "تحتاج لاعبين اثنين على الأقل")
    waiting = [player for player, _ in rows if player.seat != 0 and not player.ready]
    if waiting and not force:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "بانتظار جاهزية جميع اللاعبين")

    seats = [{"seat": player.seat, "user_id": player.user_id} for player, _ in rows]
    config = room.config or {}
    if room.game == "domino":
        room.state = engine.new_state(seats, int(config.get("target") or 100))
    else:
        room.state = engine.new_state(seats)
    room.status = "playing"
    room.winner_id = None
    for player, _ in rows:
        player.score = 0
    log_move(db, room, actor.id, "start", {"seats": [item["seat"] for item in seats]})
    db.commit()
    db.refresh(room)
    _broadcast(db, room)
    return room


def _redact(state: dict[str, Any], game: str, viewer_seat: Optional[int]) -> dict[str, Any]:
    """Domino hands are private: send counts, keep only the viewer's tiles."""
    if game != "domino":
        return state
    safe = dict(state)
    safe.pop("boneyard", None)
    safe["players"] = [
        {
            **player,
            "hand": player["hand"] if player["seat"] == viewer_seat else [],
            "hand_count": len(player["hand"]),
        }
        for player in state.get("players", [])
    ]
    opening = state.get("opening")
    safe["opening"] = opening if viewer_seat is not None and any(
        player["seat"] == viewer_seat and player["hand"] for player in state.get("players", [])
    ) and _holder_seat(state) == viewer_seat else None
    return safe


def _holder_seat(state: dict[str, Any]) -> Optional[int]:
    for player in state.get("players", []):
        hand = player.get("hand") or []
        if hand and not state.get("board"):
            return int(player["seat"])
    return None


def legal_for(state: dict[str, Any], game: str, seat: Optional[int]) -> list[dict[str, Any]]:
    if seat is None or state.get("phase") != "playing":
        return []
    engine = ENGINES.get(game)
    if engine is None:
        return []
    if game == "ludo":
        if int(state.get("turn", -1)) != int(seat) or not state.get("dice"):
            return []
        return engine.legal_moves(state, int(seat), int(state["dice"]))
    return engine.legal_moves(state, int(seat))


def state_payload(db: Session, room: GameRoom, viewer: Optional[User] = None) -> dict[str, Any]:
    rows = players(db, room.id)
    my_seat: Optional[int] = None
    payload_players = []
    for player, player_user in rows:
        if viewer is not None and player.user_id == viewer.id:
            my_seat = int(player.seat)
        payload_players.append(
            {
                "seat": int(player.seat),
                "ready": bool(player.ready),
                "connected": bool(player.connected),
                "score": int(player.score),
                "user": user_public(player_user),
            }
        )
    taken = {item["seat"] for item in payload_players}
    state = room.state or {}
    payload = {
        "id": room.id,
        "game": room.game,
        "name": room.name,
        "host_id": room.host_id,
        "max_players": room.max_players,
        "is_private": bool(room.is_private),
        "status": room.status,
        "config": room.config or {},
        "winner_id": room.winner_id,
        "players": payload_players,
        "free_seats": [seat for seat in range(room.max_players) if seat not in taken],
        "my_seat": my_seat,
        "state": _redact(state, room.game, my_seat) if state else {},
        "legal": legal_for(state, room.game, my_seat),
        "turn": state.get("turn") if state else None,
        "created_at": iso(room.created_at),
        "updated_at": iso(room.updated_at),
    }
    return payload


def _broadcast(db: Session, room: GameRoom) -> None:
    hub.notify_channel(channel(room.id), {"type": "game_state", "state": state_payload(db, room)})


def broadcast_for(db: Session, room: GameRoom, user: User) -> None:
    hub.notify_user(user.id, {"type": "game_state", "state": state_payload(db, room, user)})


def _finish(db: Session, room: GameRoom, winner_seat: int) -> None:
    rows = players(db, room.id)
    room.status = "finished"
    room.finished_at = utcnow()
    winner_row = next((player for player, _ in rows if int(player.seat) == int(winner_seat)), None)
    if winner_row is not None:
        room.winner_id = winner_row.user_id
    diamonds = int(get_setting(db, "game_win_reward_diamonds", 500))
    xp_reward = int(get_setting(db, "game_win_xp", 50))
    for player, player_user in rows:
        if player.seat == winner_seat:
            if diamonds > 0:
                grant_reward(
                    db,
                    player_user,
                    "diamonds",
                    diamonds,
                    f"فوز في {GAME_NAMES.get(room.game)}",
                    f"game:{room.id}:{player_user.id}:diamonds",
                )
            if xp_reward > 0:
                player_user.xp = int(player_user.xp or 0) + xp_reward
                db.add(player_user)
            create_notification(
                db,
                player_user.id,
                "game",
                "فوز في المباراة 🎉",
                f"فزت في {GAME_NAMES.get(room.game)} وحصلت على {diamonds} ماس و {xp_reward} نقطة خبرة.",
                {"game_room_id": room.id, "game": room.game},
            )
        else:
            create_notification(
                db,
                player_user.id,
                "game",
                "انتهت المباراة",
                f"انتهت مباراة {GAME_NAMES.get(room.game)}. حظاً أوفر في المرة القادمة.",
                {"game_room_id": room.id, "game": room.game},
            )
    log_move(db, room, room.winner_id, "finish", {"seat": winner_seat})
    db.commit()


def _sync_scores(db: Session, room: GameRoom) -> None:
    """Mirror engine scores onto the player rows (rankings in lists/admin)."""
    state = room.state or {}
    for player, _ in players(db, room.id):
        for engine_player in state.get("players", []):
            if int(engine_player.get("seat", -1)) == int(player.seat):
                player.score = int(engine_player.get("score") or 0)
                db.add(player)


def apply_action(
    db: Session,
    room: GameRoom,
    user: User,
    action: str,
    payload: dict[str, Any],
) -> dict[str, Any]:
    """Validate and apply one client action; returns the resulting state."""
    engine = require_game(room.game)
    player = membership(db, room.id, user.id)
    if player is None:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "أنت لست على هذه الطاولة")
    state = dict(room.state or {})

    action = (action or "").strip().lower()
    try:
        if room.status == "waiting" and action != "ready":
            raise ValueError("لم تبدأ المباراة بعد")
        if action == "ready":
            set_ready(db, room, user, bool(payload.get("value", True)))
            return state_payload(db, room, user)
        if room.status != "playing" and action not in {"next_round"}:
            raise ValueError("المباراة غير جارية")

        if room.game == "ludo":
            if action == "roll":
                state, event = engine.roll(state)
                kind = "roll"
            elif action == "move":
                state = engine.play(state, int(player.seat), int(payload.get("token", -1)))
                event = state.get("last_event", {})
                kind = "move"
            else:
                raise ValueError("إجراء غير معروف")
        else:
            if action == "play":
                state = engine.play(
                    state, int(player.seat), int(payload.get("tile", -1)), str(payload.get("side", "") or "")
                )
                event = state.get("last_event", {})
                kind = "play"
            elif action == "draw":
                state = engine.draw(state, int(player.seat))
                event = state.get("last_event", {})
                kind = "draw"
            elif action == "pass":
                state = engine.pass_turn(state, int(player.seat))
                event = state.get("last_event", {})
                kind = "pass"
            elif action == "next_round":
                state = engine.next_round(state)
                event = state.get("last_event", {})
                kind = "round"
                room.status = "playing"
                room.finished_at = None
            else:
                raise ValueError("إجراء غير معروف")
    except ValueError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(exc)) from exc

    room.state = state
    room.updated_at = utcnow()
    if room.game == "domino":
        _sync_scores(db, room)
    log_move(db, room, user.id, kind, {"action": action, **{k: v for k, v in event.items() if k != "moves"}})

    finished = state.get("phase") == "finished"
    db.commit()
    if finished and room.status != "finished":
        winner_seat = int((state.get("ranking") or [state.get("turn") or 0])[0])
        _finish(db, room, winner_seat)
    _broadcast(db, room)
    return state_payload(db, room, user)


def close_game(db: Session, room: GameRoom, force: bool = False) -> None:
    if room.status == "playing" and not force:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "لا يمكن إغلاق مباراة جارية")
    room.status = "closed"
    db.commit()
    hub.notify_channel(channel(room.id), {"type": "game_closed", "game_room_id": room.id})


def open_rooms(db: Session, game: Optional[str] = None, limit: int = 30) -> list[dict[str, Any]]:
    statement = (
        select(GameRoom, User)
        .join(User, User.id == GameRoom.host_id)
        .where(GameRoom.status.in_(["waiting", "playing"]))
        .order_by(GameRoom.status.desc(), GameRoom.updated_at.desc())
        .limit(limit)
    )
    if game:
        statement = statement.where(GameRoom.game == game)
    rows = db.execute(statement).all()
    result = []
    for room, host in rows:
        taken = int(
            db.execute(
                select(func.count(GamePlayer.id)).where(GamePlayer.game_room_id == room.id)
            ).scalar()
            or 0
        )
        result.append(
            {
                "id": room.id,
                "game": room.game,
                "name": room.name,
                "status": room.status,
                "max_players": room.max_players,
                "is_private": bool(room.is_private),
                "player_count": taken,
                "host": user_public(host),
                "created_at": iso(room.created_at),
            }
        )
    return result


def moves(db: Session, room_id: int, limit: int = 200) -> list[dict[str, Any]]:
    rows = list(
        db.execute(
            select(GameMove).where(GameMove.game_room_id == room_id).order_by(GameMove.seq).limit(limit)
        ).scalars()
    )
    return [
        {
            "seq": move.seq,
            "kind": move.kind,
            "user_id": move.user_id,
            "payload": move.payload or {},
            "created_at": iso(move.created_at),
        }
        for move in rows
    ]


def board_geometry() -> dict[str, Any]:
    """Board constants so every client renders the same Ludo grid."""
    from . import ludo

    return {
        "size": 15,
        "track": [list(cell) for cell in ludo.TRACK],
        "starts": {str(seat): index for seat, index in ludo.STARTS.items()},
        "safe": sorted(ludo.SAFE_TRACK),
        "home_columns": {str(seat): [list(cell) for cell in cells] for seat, cells in ludo.HOME_COLUMNS.items()},
        "yards": {str(seat): [list(cell) for cell in cells] for seat, cells in ludo.YARDS.items()},
        "home": ludo.HOME,
        "colors": ludo.COLORS,
        "tokens": ludo.TOKENS_PER_PLAYER,
    }


def summary(state: dict[str, Any]) -> str:
    return json.dumps(state.get("last_event") or {}, ensure_ascii=False)
