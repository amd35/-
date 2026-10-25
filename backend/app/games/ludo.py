"""Ludo rules engine — authoritative, pure and testable.

The board is the classic 15x15 grid. ``TRACK`` lists the 52 shared cells in
clockwise order; each seat has a start index on that track plus a private
5-cell home column. A token stores how far it has travelled from its own start:

    -1        in the yard (never played)
     0..50    on the shared track: cell = TRACK[(start + steps) % 52]
     51..55   inside the home column
     56       home (finished)

Only the server rolls dice (``secrets``), so a client cannot pick its numbers,
and every move is checked against the legal-move list before it is applied.
Rules implemented:

* rolling 6 brings a token out of the yard, or moves one already out;
* three 6s in a row forfeit the turn;
* a 6, a capture or a token reaching home grants another roll;
* landing on an opponent's token sends it back to its yard, except on the
  8 safe cells (the 4 start cells and the 4 star cells);
* a token needs the exact number to reach home (56);
* the first player to bring all 4 tokens home wins, the rest are ranked.
"""
import secrets
from typing import Any, Optional

TRACK: list[tuple[int, int]] = [
    (6, 1), (6, 2), (6, 3), (6, 4), (6, 5),
    (5, 6), (4, 6), (3, 6), (2, 6), (1, 6), (0, 6),
    (0, 7),
    (0, 8), (1, 8), (2, 8), (3, 8), (4, 8), (5, 8),
    (6, 9), (6, 10), (6, 11), (6, 12), (6, 13),
    (6, 14),
    (7, 14),
    (8, 14), (8, 13), (8, 12), (8, 11), (8, 10), (8, 9),
    (9, 8), (10, 8), (11, 8), (12, 8), (13, 8), (14, 8),
    (14, 7),
    (14, 6), (13, 6), (12, 6), (11, 6), (10, 6), (9, 6),
    (8, 5), (8, 4), (8, 3), (8, 2), (8, 1), (8, 0),
    (7, 0),
    (6, 0),
]

# Seat 0 left/top, then clockwise: the 4 start cells of the classic board.
STARTS: dict[int, int] = {0: 0, 1: 13, 2: 26, 3: 39}
SAFE_TRACK: set[int] = {0, 8, 13, 21, 26, 34, 39, 47}
HOME_COLUMNS: dict[int, list[tuple[int, int]]] = {
    0: [(7, 1), (7, 2), (7, 3), (7, 4), (7, 5)],
    1: [(1, 7), (2, 7), (3, 7), (4, 7), (5, 7)],
    2: [(7, 13), (7, 12), (7, 11), (7, 10), (7, 9)],
    3: [(13, 7), (12, 7), (11, 7), (10, 7), (9, 7)],
}
YARDS: dict[int, list[tuple[int, int]]] = {
    0: [(1, 1), (1, 3), (3, 1), (3, 3)],
    1: [(1, 11), (1, 13), (3, 11), (3, 13)],
    2: [(11, 11), (11, 13), (13, 11), (13, 13)],
    3: [(11, 1), (11, 3), (13, 1), (13, 3)],
}
HOME = 56
TOKENS_PER_PLAYER = 4
COLORS = ["red", "green", "blue", "yellow"]


def new_state(seats: list[dict[str, Any]]) -> dict[str, Any]:
    """``seats`` is the ordered list of ``{"seat": int, "user_id": int}``."""
    return {
        "game": "ludo",
        "phase": "playing",
        "turn": 0,
        "order": [int(item["seat"]) for item in seats],
        "dice": None,
        "sixes": 0,
        "last_event": {"kind": "start"},
        "ranking": [],
        "players": [
            {
                "seat": int(item["seat"]),
                "user_id": int(item["user_id"]),
                "color": COLORS[int(item["seat"]) % len(COLORS)],
                "tokens": [-1] * TOKENS_PER_PLAYER,
                "home_count": 0,
            }
            for item in seats
        ],
    }


def _player(state: dict[str, Any], seat: int) -> Optional[dict[str, Any]]:
    for player in state["players"]:
        if player["seat"] == seat:
            return player
    return None


def _order(state: dict[str, Any]) -> list[int]:
    return list(state.get("order") or [player["seat"] for player in state["players"]])


def track_cell(seat: int, steps: int) -> Optional[tuple[int, int]]:
    if steps < 0 or steps > HOME:
        return None
    if steps <= 50:
        return TRACK[(STARTS[seat] + steps) % len(TRACK)]
    if steps < HOME:
        return HOME_COLUMNS[seat][steps - 51]
    return (7, 7)


def legal_moves(state: dict[str, Any], seat: int, dice: int) -> list[dict[str, Any]]:
    player = _player(state, seat)
    if player is None or dice is None:
        return []
    moves: list[dict[str, Any]] = []
    for index, steps in enumerate(player["tokens"]):
        if steps == HOME:
            continue
        if steps == -1:
            if dice != 6:
                continue
            # The start cell must be free of one's own token to keep the board readable.
            occupied = any(other == 0 for other in player["tokens"])
            if occupied:
                continue
            moves.append({"token": index, "from": -1, "to": 0, "captures": _captures(state, seat, 0)})
            continue
        target = steps + dice
        if target > HOME:
            continue
        moves.append({"token": index, "from": steps, "to": target, "captures": _captures(state, seat, target)})
    return moves


def _captures(state: dict[str, Any], seat: int, steps: int) -> list[dict[str, int]]:
    """Opponent tokens standing on the landing cell (empty on safe cells)."""
    if steps < 0 or steps > 50:
        return []
    cell = track_cell(seat, steps)
    index = (STARTS[seat] + steps) % len(TRACK)
    if index in SAFE_TRACK:
        return []
    captured: list[dict[str, int]] = []
    for player in state["players"]:
        if player["seat"] == seat:
            continue
        for token_index, token_steps in enumerate(player["tokens"]):
            if token_steps < 0 or token_steps > 50:
                continue
            if track_cell(player["seat"], token_steps) == cell:
                captured.append({"seat": player["seat"], "token": token_index})
    return captured


def roll(state: dict[str, Any], value: Optional[int] = None) -> tuple[dict[str, Any], dict[str, Any]]:
    """Roll for the player whose turn it is. ``value`` is only used by tests."""
    if state.get("phase") != "playing":
        raise ValueError("المباراة منتهية")
    dice = int(value) if value else secrets.randbelow(6) + 1
    seat = int(state["turn"])
    sixes = int(state.get("sixes") or 0)

    if dice == 6:
        sixes += 1
        if sixes >= 3:
            state["sixes"] = 0
            state["dice"] = None
            event = {"kind": "three_sixes", "seat": seat, "dice": dice}
            state["last_event"] = event
            _next_turn(state)
            return state, event

    state["dice"] = dice
    state["sixes"] = sixes
    moves = legal_moves(state, seat, dice)
    if not moves:
        event = {"kind": "no_moves", "seat": seat, "dice": dice}
        state["last_event"] = event
        state["dice"] = None
        state["sixes"] = 0
        _next_turn(state)
        return state, event

    event = {"kind": "roll", "seat": seat, "dice": dice, "moves": moves}
    state["last_event"] = event
    return state, event


def play(state: dict[str, Any], seat: int, token_index: int) -> dict[str, Any]:
    """Apply one move of the current player; ``state`` is mutated in place."""
    if state.get("phase") != "playing":
        raise ValueError("المباراة منتهية")
    if int(state["turn"]) != int(seat):
        raise ValueError("ليس دورك")
    dice = state.get("dice")
    if not dice:
        raise ValueError("يجب رمي النرد أولاً")

    moves = legal_moves(state, seat, int(dice))
    chosen = next((move for move in moves if int(move["token"]) == int(token_index)), None)
    if chosen is None:
        raise ValueError("هذه النقلة غير مسموحة")

    player = _player(state, seat)
    assert player is not None
    player["tokens"][int(token_index)] = int(chosen["to"])
    captured = False
    for hit in chosen["captures"]:
        victim = _player(state, int(hit["seat"]))
        if victim is None:
            continue
        victim["tokens"][int(hit["token"])] = -1
        captured = True

    reached_home = int(chosen["to"]) == HOME
    if reached_home:
        player["home_count"] = sum(1 for steps in player["tokens"] if steps == HOME)

    event = {
        "kind": "move",
        "seat": seat,
        "token": int(token_index),
        "from": int(chosen["from"]),
        "to": int(chosen["to"]),
        "dice": int(dice),
        "captures": chosen["captures"],
        "home": reached_home,
    }
    state["last_event"] = event
    state["dice"] = None

    if player["home_count"] >= TOKENS_PER_PLAYER:
        state["phase"] = "finished"
        ranking = list(state.get("ranking") or [])
        if seat not in ranking:
            ranking.append(seat)
        state["ranking"] = ranking
        event["kind"] = "finish"
        state["sixes"] = 0
        return state

    extra = int(dice) == 6 or captured or reached_home
    if extra:
        state["sixes"] = int(state.get("sixes") or 0)
    else:
        state["sixes"] = 0
        _next_turn(state)
    return state


def _next_turn(state: dict[str, Any]) -> None:
    order = _order(state)
    if not order:
        return
    current = int(state["turn"])
    index = order.index(current) if current in order else -1
    state["turn"] = order[(index + 1) % len(order)]
    state["dice"] = None


def state_for(state: dict[str, Any], seat: int) -> dict[str, Any]:
    """Same public state for everybody: Ludo has no hidden information."""
    return state


def turn_seat(state: dict[str, Any]) -> int:
    return int(state.get("turn") or 0)
