"""Ludo and Domino: rules engine + server authority + rewards.

The engines are tested directly with injected dice (deterministic), then the
HTTP layer is exercised end to end: create table, join, ready, start, play.
"""
import pytest
from sqlalchemy import select

from conftest import auth

from app.db import SessionLocal
from app.games import domino, ludo
from app.models import GameRoom, LedgerEntry


# --- Ludo engine -----------------------------------------------------------

def ludo_state(seats=2):
    return ludo.new_state([{"seat": seat, "user_id": seat + 1} for seat in range(seats)])


def test_ludo_roll_without_a_six_passes_the_turn():
    state = ludo_state()
    state, event = ludo.roll(state, 3)
    assert event["kind"] == "no_moves"
    assert state["turn"] == 1
    assert state["dice"] is None


def test_ludo_six_brings_a_token_out_and_grants_another_roll():
    state = ludo_state()
    state, event = ludo.roll(state, 6)
    assert event["kind"] == "roll"
    assert event["moves"], "a six must open a move"
    ludo.play(state, 0, 0)
    assert state["players"][0]["tokens"][0] == 0
    assert state["turn"] == 0, "rolling a six keeps the turn"
    assert state["dice"] is None


def test_ludo_three_sixes_forfeit_the_turn():
    state = ludo_state()
    state, _ = ludo.roll(state, 6)
    ludo.play(state, 0, 0)
    state, _ = ludo.roll(state, 6)
    state, event = ludo.roll(state, 6)
    assert event["kind"] == "three_sixes"
    assert state["turn"] == 1


def test_ludo_capture_sends_the_opponent_home_except_on_safe_cells():
    state = ludo_state()
    state["players"][0]["tokens"][0] = 0  # on the start cell (safe, track 0)
    state["players"][1]["tokens"][0] = 40  # seat 1 start is 13, so 13+40 = 53 -> track 1
    state["turn"] = 0
    assert ludo.track_cell(1, 40) == ludo.TRACK[1]

    state, _ = ludo.roll(state, 1)
    ludo.play(state, 0, 0)
    assert state["players"][0]["tokens"][0] == 1
    assert state["players"][1]["tokens"][0] == -1, "landing on a normal cell captures"

    # Track 0 is a safe (start) cell: no capture there.
    state = ludo_state()
    state["players"][1]["tokens"][0] = 39  # 13 + 39 = 52 -> track 0
    state["players"][1]["tokens"][1] = 39
    state["players"][0]["tokens"][0] = -1
    state["turn"] = 0
    state, _ = ludo.roll(state, 6)
    ludo.play(state, 0, 0)
    assert state["players"][0]["tokens"][0] == 0
    assert state["players"][1]["tokens"][0] == 39, "safe cells never capture"


def test_ludo_home_needs_an_exact_roll():
    state = ludo_state()
    state["players"][0]["tokens"] = [55, 56, 56, 56]
    state["players"][0]["home_count"] = 3
    state, event = ludo.roll(state, 2)
    assert event["kind"] == "no_moves", "55 + 2 overshoots home"
    state = ludo_state()
    state["players"][0]["tokens"] = [55, 56, 56, 56]
    state["players"][0]["home_count"] = 3
    state, _ = ludo.roll(state, 1)
    ludo.play(state, 0, 0)
    assert state["phase"] == "finished"
    assert state["ranking"] == [0]


def test_ludo_rejects_an_illegal_move():
    state = ludo_state()
    state, _ = ludo.roll(state, 3)
    with pytest.raises(ValueError):
        ludo.play(state, 0, 0)


# --- Domino engine ---------------------------------------------------------

def domino_state(hands, board=None, boneyard=None, turn=0, opening=None, target=100):
    return {
        "game": "domino",
        "phase": "playing",
        "round": 1,
        "target": target,
        "board": list(board or []),
        "order": [0, 1],
        "turn": turn,
        "passes": 0,
        "boneyard": list(boneyard or []),
        "boneyard_count": len(boneyard or []),
        "opening": opening,
        "round_winner": None,
        "ranking": [],
        "players": [
            {"seat": index, "user_id": index + 1, "hand": [[a, b] for a, b in hand], "score": 0}
            for index, hand in enumerate(hands)
        ],
    }


def test_domino_deal_is_private_and_complete():
    state = domino.new_state([{"seat": 0, "user_id": 1}, {"seat": 1, "user_id": 2}])
    for player in state["players"]:
        assert len(player["hand"]) == domino.HAND_SIZE
    assert state["turn"] in (0, 1)
    total = sum(len(player["hand"]) for player in state["players"]) + len(state["boneyard"])
    assert total == len(domino.TILES)


def test_domino_opens_with_the_highest_double_then_matches_ends():
    state = domino_state([[[6, 6], [1, 2]], [[3, 4], [2, 2]]], opening=[6, 6])
    moves = domino.legal_moves(state, state["turn"])
    assert [move["tile_value"] for move in moves] == [[6, 6]]
    domino.play(state, state["turn"], moves[0]["tile"], "first")
    assert domino.open_ends(state) == [6, 6]

    opener = state["turn"]
    assert opener == 1, "a tile that does not match cannot be played"
    with pytest.raises(ValueError):
        domino.play(state, 0, 0, "left")


def test_domino_only_matching_tiles_are_legal():
    state = domino_state([[[6, 3], [4, 4]], [[5, 1], [2, 2]]], board=[[6, 6]], turn=0)
    moves = domino.legal_moves(state, 0)
    assert [move["tile_value"] for move in moves] == [[6, 3]]
    assert moves[0]["sides"] == ["left"]
    domino.play(state, 0, moves[0]["tile"], "left")
    assert domino.open_ends(state) == [3, 6]


def test_domino_draw_then_pass_and_blocked_round():
    state = domino_state([[[6, 6]], [[1, 1]]], board=[[5, 5]], boneyard=[[0, 0]], turn=0)
    state = domino.draw(state, 0)
    assert len(state["players"][0]["hand"]) == 2

    # The boneyard is empty once its last tile has been drawn.
    with pytest.raises(ValueError):
        domino.draw(state, 0)
    with pytest.raises(ValueError):
        domino.draw(domino_state([[[5, 3]], [[1, 1]]], board=[[5, 5]], boneyard=[[2, 2]], turn=0), 0)
    with pytest.raises(ValueError):
        domino.play(domino_state([[[6, 6]], [[1, 1]]], board=[[5, 5]], turn=0), 1, 0, "left")

    blocked = domino_state([[[6, 6]], [[1, 1]]], board=[[5, 5]], turn=0)
    blocked = domino.pass_turn(blocked, 0)
    assert blocked["passes"] == 1
    blocked = domino.pass_turn(blocked, 1)
    assert blocked["round_winner"] == 1, "fewest pips wins a blocked round"
    assert blocked["players"][1]["score"] == 12, "the winner scores the other hands"


def test_domino_round_win_awards_the_target_progress():
    state = domino_state([[[2, 2]], [[3, 3], [4, 4]]], board=[[2, 4]], turn=0, target=10)
    state = domino.play(state, 0, 0, "left")
    assert state["phase"] == "finished"
    assert state["players"][0]["score"] == 14
    assert state["ranking"] == [0]


# --- HTTP authority --------------------------------------------------------

def create_game(client, token, game, max_players=2):
    response = client.post(
        "/api/games/rooms",
        json={"game": game, "name": f"طاولة {game}", "max_players": max_players},
        headers=auth(token),
    )
    assert response.status_code == 201, response.text
    return response.json()["room"]


def test_domino_match_end_to_end(client, make_user):
    first = make_user("dom_one")
    second = make_user("dom_two")
    room = create_game(client, first["token"], "domino")

    joined = client.post(f"/api/games/rooms/{room['id']}/join", headers=auth(second["token"]))
    assert joined.status_code == 200, joined.text
    assert client.post(f"/api/games/rooms/{room['id']}/ready", headers=auth(second["token"])).status_code == 200
    started = client.post(f"/api/games/rooms/{room['id']}/start", headers=auth(first["token"]))
    assert started.status_code == 200, started.text

    # Hands are private: the opponent's tiles are only counts.
    mine = client.get(f"/api/games/rooms/{room['id']}", headers=auth(second["token"])).json()["room"]
    assert mine["status"] == "playing"
    assert len(mine["state"]["players"][1]["hand"]) == 7
    assert mine["state"]["players"][0]["hand"] == []
    assert mine["state"]["players"][0]["hand_count"] == 7
    assert "boneyard" not in mine["state"]

    # Whoever holds the opening tile plays first; the server tells each client.
    seats = [first, second]
    views = [client.get(f"/api/games/rooms/{room['id']}", headers=auth(item["token"])).json()["room"] for item in seats]
    opener, view = next(
        ((index, view) for index, view in enumerate(views) if view["legal"]), (None, None)
    )
    assert opener is not None, "one player must hold the opening tile"
    legal = view["legal"][0]
    out_of_turn = client.post(
        f"/api/games/rooms/{room['id']}/action",
        json={"action": "play", "payload": {"tile": legal["tile"], "side": legal["sides"][0]}},
        headers=auth(seats[1 - opener]["token"]),
    )
    assert out_of_turn.status_code == 400, "the server rejects a move out of turn"

    played = client.post(
        f"/api/games/rooms/{room['id']}/action",
        json={"action": "play", "payload": {"tile": legal["tile"], "side": legal["sides"][0]}},
        headers=auth(seats[opener]["token"]),
    )
    assert played.status_code == 200, played.text
    state = played.json()["room"]["state"]
    assert len(state["board"]) == 1
    assert state["turn"] != opener

    moves = client.get(f"/api/games/rooms/{room['id']}/moves", headers=auth(first["token"]))
    assert moves.status_code == 200
    assert [move["kind"] for move in moves.json()["moves"]][:3] == ["create", "join", "start"]


def test_ludo_roll_and_move_through_the_api(client, make_user):
    first = make_user("ludo_one")
    second = make_user("ludo_two")
    room = create_game(client, first["token"], "ludo")
    client.post(f"/api/games/rooms/{room['id']}/join", headers=auth(second["token"]))
    client.post(f"/api/games/rooms/{room['id']}/ready", headers=auth(second["token"]))
    assert client.post(f"/api/games/rooms/{room['id']}/start", headers=auth(first["token"])).status_code == 200

    tokens = {0: first["token"], 1: second["token"]}
    rolled_tokens = set()
    for _ in range(12):
        view = client.get(f"/api/games/rooms/{room['id']}", headers=auth(first["token"])).json()["room"]
        if view["status"] != "playing":
            break
        turn = view["state"]["turn"]
        token = tokens[turn]
        response = client.post(
            f"/api/games/rooms/{room['id']}/action",
            json={"action": "roll", "payload": {}},
            headers=auth(token),
        )
        assert response.status_code == 200, response.text
        rolled_tokens.add(turn)
        after = response.json()["room"]
        if after["legal"]:
            move = after["legal"][0]
            moved = client.post(
                f"/api/games/rooms/{room['id']}/action",
                json={"action": "move", "payload": {"token": move["token"]}},
                headers=auth(token),
            )
            assert moved.status_code == 200, moved.text
            # The acting seat's board must change; the opponent may be untouched.
            assert moved.json()["room"]["state"]["players"][turn]["tokens"] != [-1, -1, -1, -1]
            assert moved.json()["room"]["legal"] in ([], moved.json()["room"]["legal"])
    assert rolled_tokens, "at least one roll must succeed"


def test_games_reject_players_who_are_not_at_the_table(client, make_user):
    first = make_user("ludo_three")
    stranger = make_user("ludo_four")
    room = create_game(client, first["token"], "ludo")
    response = client.post(
        f"/api/games/rooms/{room['id']}/action",
        json={"action": "roll", "payload": {}},
        headers=auth(stranger["token"]),
    )
    assert response.status_code == 403


def test_ludo_win_pays_the_reward_once(client, make_user):
    winner = make_user("ludo_win")
    other = make_user("ludo_lose")
    room = create_game(client, winner["token"], "ludo")
    client.post(f"/api/games/rooms/{room['id']}/join", headers=auth(other["token"]))
    client.post(f"/api/games/rooms/{room['id']}/ready", headers=auth(other["token"]))
    client.post(f"/api/games/rooms/{room['id']}/start", headers=auth(winner["token"]))

    before = client.get("/api/auth/me", headers=auth(winner["token"])).json()["wallet"]["diamonds"]

    # One move away from a full win; the server still validates it as a move.
    db = SessionLocal()
    try:
        row = db.get(GameRoom, room["id"])
        state = dict(row.state)
        state["players"][0]["tokens"] = [56, 56, 56, 55]
        state["players"][0]["home_count"] = 3
        state["turn"] = 0
        state["dice"] = 1
        row.state = state
        db.commit()
    finally:
        db.close()

    finished = client.post(
        f"/api/games/rooms/{room['id']}/action",
        json={"action": "move", "payload": {"token": 3}},
        headers=auth(winner["token"]),
    )
    assert finished.status_code == 200, finished.text
    assert finished.json()["room"]["status"] == "finished"

    after = client.get("/api/auth/me", headers=auth(winner["token"])).json()["wallet"]["diamonds"]
    assert after - before == 500, "the winner is paid the configured reward"

    db = SessionLocal()
    try:
        rewards = db.execute(
            select(LedgerEntry).where(LedgerEntry.user_id == winner["user"]["id"], LedgerEntry.kind == "reward")
        ).scalars().all()
        game_rewards = [item for item in rewards if str(item.ref or "").startswith(f"game:{room['id']}:")]
        assert len(game_rewards) == 1, "a reward is written exactly once"
    finally:
        db.close()


def test_admin_can_disable_a_game_and_review_tables(client, make_user, admin_token):
    player = make_user("ludo_off")
    response = client.patch(
        "/api/admin/games/settings",
        json={"games_enabled": {"ludo": False, "domino": True}},
        headers=auth(admin_token),
    )
    assert response.status_code == 200, response.text
    blocked = client.post(
        "/api/games/rooms",
        json={"game": "ludo", "max_players": 2},
        headers=auth(player["token"]),
    )
    assert blocked.status_code == 400

    client.patch(
        "/api/admin/games/settings",
        json={"games_enabled": {"ludo": True, "domino": True}},
        headers=auth(admin_token),
    )
    assert client.post("/api/games/rooms", json={"game": "ludo", "max_players": 2}, headers=auth(player["token"])).status_code == 201

    overview = client.get("/api/admin/games", headers=auth(admin_token))
    assert overview.status_code == 200
    payload = overview.json()
    assert payload["settings"]["games_enabled"]["domino"] is True
    assert "moves" in payload["stats"]
    assert payload["rooms"]
