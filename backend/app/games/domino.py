"""Domino (double-six) rules engine — authoritative, pure and testable.

One round is one deal: every player takes 7 tiles (2-4 players, double-six set).
The holder of the highest double opens with it; when nobody holds a double the
highest tile opens. A tile may be added to an open end whose pips match, then
the tile becomes the new end. When a player cannot play they draw from the
boneyard, and once it is empty they pass; when everybody passes the round is
blocked and the player with the fewest pips wins it. The round winner scores the
pips left in the other hands and the deal is repeated until somebody reaches the
target score (default 100).
"""
import secrets
from typing import Any, Optional

TILES: list[tuple[int, int]] = [(a, b) for a in range(7) for b in range(a, 7)]
HAND_SIZE = 7
DEFAULT_TARGET = 100


def _deal(count: int) -> tuple[list[list[list[int]]], list[list[int]]]:
    deck = [list(tile) for tile in TILES]
    secrets.SystemRandom().shuffle(deck)
    hands: list[list[list[int]]] = []
    for _ in range(count):
        hands.append([deck.pop() for _ in range(HAND_SIZE)])
    return hands, deck


def _tile_key(tile: list[int]) -> tuple[int, int, int]:
    high = max(tile)
    low = min(tile)
    return (1 if high == low else 0, high, low)


def _opening_tile(hands: list[list[list[int]]]) -> tuple[int, Optional[list[int]]]:
    """(seat, tile) that must open the round."""
    best: tuple[int, Optional[list[int]]] = (0, None)
    best_key: tuple[int, int, int] = (-1, -1, -1)
    for seat, hand in enumerate(hands):
        for tile in hand:
            key = _tile_key(tile)
            if key > best_key:
                best_key = key
                best = (seat, tile)
    return best


def new_round(seats: list[dict[str, Any]], target: int, round_number: int, scores: list[dict[int, int]]) -> dict[str, Any]:
    hands, boneyard = _deal(len(seats))
    state: dict[str, Any] = {
        "game": "domino",
        "phase": "playing",
        "round": round_number,
        "target": target,
        "board": [],
        "order": [int(item["seat"]) for item in seats],
        "turn": 0,
        "passes": 0,
        "boneyard_count": len(boneyard),
        "boneyard": boneyard,
        "last_event": {"kind": "start", "round": round_number},
        "round_winner": None,
        "ranking": [],
        "players": [
            {
                "seat": int(item["seat"]),
                "user_id": int(item["user_id"]),
                "hand": hands[index],
                "score": int(scores[index].get(int(item["seat"]), 0)) if index < len(scores) else 0,
            }
            for index, item in enumerate(seats)
        ],
    }
    seat, tile = _opening_tile(hands)
    state["turn"] = seat
    state["opening"] = tile
    state["last_event"] = {"kind": "start", "round": round_number, "seat": seat, "tile": tile}
    return state


def new_state(seats: list[dict[str, Any]], target: int = DEFAULT_TARGET) -> dict[str, Any]:
    return new_round(seats, target, 1, [{} for _ in seats])


def _player(state: dict[str, Any], seat: int) -> Optional[dict[str, Any]]:
    for player in state["players"]:
        if player["seat"] == seat:
            return player
    return None


def open_ends(state: dict[str, Any]) -> Optional[list[int]]:
    board = state.get("board") or []
    if not board:
        return None
    return [int(board[0][0]), int(board[-1][1])]


def _matches(tile: list[int], pip: int) -> bool:
    return int(tile[0]) == pip or int(tile[1]) == pip


def legal_moves(state: dict[str, Any], seat: int) -> list[dict[str, Any]]:
    """Every playable tile with the side(s) it may be played on."""
    if state.get("phase") != "playing" or int(state.get("turn", -1)) != int(seat):
        return []
    player = _player(state, seat)
    if player is None:
        return []
    board = state.get("board") or []
    if not board:
        opening = state.get("opening")
        if not opening:
            return []
        index = next(
            (i for i, tile in enumerate(player["hand"]) if sorted(tile) == sorted(opening)), None
        )
        if index is None:
            return []
        return [{"tile": index, "tile_value": player["hand"][index], "sides": ["first"]}]

    ends = open_ends(state)
    assert ends is not None
    left_pip, right_pip = ends
    moves: list[dict[str, Any]] = []
    for index, tile in enumerate(player["hand"]):
        sides: list[str] = []
        if _matches(tile, left_pip):
            sides.append("left")
        if _matches(tile, right_pip) and right_pip != left_pip:
            sides.append("right")
        elif _matches(tile, right_pip) and not sides:
            sides.append("right")
        if sides:
            moves.append({"tile": index, "tile_value": tile, "sides": sides})
    return moves


def play(state: dict[str, Any], seat: int, tile_index: int, side: str) -> dict[str, Any]:
    if state.get("phase") != "playing":
        raise ValueError("الجولة منتهية")
    if int(state["turn"]) != int(seat):
        raise ValueError("ليس دورك")
    moves = legal_moves(state, seat)
    chosen = next((move for move in moves if int(move["tile"]) == int(tile_index)), None)
    if chosen is None:
        raise ValueError("هذه القطعة لا تُلعب الآن")

    player = _player(state, seat)
    assert player is not None
    tile = player["hand"].pop(int(tile_index))
    board: list[list[int]] = state.setdefault("board", [])

    if not board:
        board.append(list(tile))
        state.pop("opening", None)
        placed_side = "first"
    else:
        allowed = chosen.get("sides", [])
        target_side = side if side in ("left", "right") and side in allowed else allowed[0]
        if target_side == "left":
            # The face matching the open end must touch the chain, so the tile is
            # flipped when its first pip is the matching one.
            left_pip = int(board[0][0])
            board.insert(0, [int(tile[1]), int(tile[0])] if int(tile[0]) == left_pip else [int(tile[0]), int(tile[1])])
        else:
            right_pip = int(board[-1][1])
            board.append([int(tile[0]), int(tile[1])] if int(tile[0]) == right_pip else [int(tile[1]), int(tile[0])])
        placed_side = target_side

    state["passes"] = 0
    state["last_event"] = {
        "kind": "play",
        "seat": seat,
        "tile": tile,
        "side": placed_side,
        "ends": open_ends(state),
    }

    if not player["hand"]:
        return _end_round(state, seat, blocked=False)
    _next_turn(state)
    return state


def draw(state: dict[str, Any], seat: int, value: Optional[list[int]] = None) -> dict[str, Any]:
    """Take one tile from the boneyard (only when nothing in hand fits)."""
    if int(state.get("turn", -1)) != int(seat):
        raise ValueError("ليس دورك")
    if legal_moves(state, seat):
        raise ValueError("لديك قطعة صالحة للعب")
    boneyard = state.get("boneyard") or []
    if not boneyard:
        raise ValueError("لا يوجد قطع للسحب، مرّر الدور")
    tile = boneyard.pop() if value is None else value
    player = _player(state, seat)
    assert player is not None
    player["hand"].append(tile)
    state["boneyard_count"] = len(boneyard)
    state["last_event"] = {"kind": "draw", "seat": seat, "remaining": len(boneyard)}
    return state


def pass_turn(state: dict[str, Any], seat: int) -> dict[str, Any]:
    if int(state.get("turn", -1)) != int(seat):
        raise ValueError("ليس دورك")
    if legal_moves(state, seat):
        raise ValueError("لديك قطعة صالحة للعب")
    if state.get("boneyard"):
        raise ValueError("اسحب قطعة قبل تمرير الدور")
    passes = int(state.get("passes") or 0) + 1
    state["passes"] = passes
    state["last_event"] = {"kind": "pass", "seat": seat, "passes": passes}
    if passes >= len(state["players"]):
        return _end_round(state, _lowest_pips(state), blocked=True)
    _next_turn(state)
    return state


def _lowest_pips(state: dict[str, Any]) -> int:
    best_seat = state["players"][0]["seat"]
    best_total = None
    for player in state["players"]:
        total = sum(int(tile[0]) + int(tile[1]) for tile in player["hand"])
        if best_total is None or total < best_total:
            best_total = total
            best_seat = player["seat"]
    return int(best_seat)


def _end_round(state: dict[str, Any], winner_seat: int, blocked: bool) -> dict[str, Any]:
    winner = _player(state, winner_seat)
    assert winner is not None
    points = sum(
        sum(int(tile[0]) + int(tile[1]) for tile in player["hand"])
        for player in state["players"]
        if player["seat"] != winner_seat
    )
    winner["score"] = int(winner["score"]) + points
    state["round_winner"] = winner_seat
    state["last_event"] = {
        "kind": "round_end",
        "seat": winner_seat,
        "points": points,
        "blocked": blocked,
        "round": int(state.get("round") or 1),
    }
    if int(winner["score"]) >= int(state.get("target") or DEFAULT_TARGET):
        state["phase"] = "finished"
        state["ranking"] = [winner_seat]
        state["last_event"] = {**state["last_event"], "kind": "finish"}
    return state


def next_round(state: dict[str, Any]) -> dict[str, Any]:
    """Deal the next round after somebody reached the target score."""
    if state.get("phase") != "finished":
        raise ValueError("الانتقال للجولة التالية متاح بعد انتهاء المباراة")
    seats = [{"seat": player["seat"], "user_id": player["user_id"]} for player in state["players"]]
    scores = [{player["seat"]: player["score"]} for player in state["players"]]
    round_number = int(state.get("round") or 1) + 1
    if int(scores[0][seats[0]["seat"]]) >= int(state.get("target") or DEFAULT_TARGET):
        return new_round(seats, int(state.get("target") or DEFAULT_TARGET), round_number, [{} for _ in seats])
    return new_round(seats, int(state.get("target") or DEFAULT_TARGET), round_number, scores)


def _next_turn(state: dict[str, Any]) -> None:
    order = list(state.get("order") or [player["seat"] for player in state["players"]])
    current = int(state["turn"])
    index = order.index(current) if current in order else -1
    state["turn"] = order[(index + 1) % len(order)]
    state["passes"] = int(state.get("passes") or 0)


def turn_seat(state: dict[str, Any]) -> int:
    return int(state.get("turn") or 0)


def hand_for(state: dict[str, Any], seat: int) -> list[list[int]]:
    player = _player(state, seat)
    return list(player["hand"]) if player else []
