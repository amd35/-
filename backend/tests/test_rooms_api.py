"""Rooms API: creation matrix, validation, join/leave invariants, search, deletion."""

import uuid

import pytest

from conftest import CATEGORIES


def title_for(suffix: str) -> str:
    return f"غرفة {suffix} {uuid.uuid4().hex[:6]}"


# --- creation matrix ---------------------------------------------------------

CREATE_CASES = [
    (category, seats, battle)
    for category in CATEGORIES
    for seats in (2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12)
    for battle in (False, True)
]


@pytest.mark.parametrize("category,seats,battle", CREATE_CASES)
def test_create_room_matrix(client, category, seats, battle):
    payload = {
        "title": title_for(f"{category}-{seats}"),
        "category": category,
        "seats_total": seats,
        "is_battle": battle,
        "game": "ludo" if battle else None,
    }
    response = client.post("/api/rooms", json=payload)
    assert response.status_code == 201, response.text
    room = response.json()
    try:
        assert room["category"] == category
        assert room["seats_total"] == seats
        assert room["is_battle"] is battle
        assert room["listeners"] == 1
        assert room["seats_taken"] == 1
        assert room["title"] == payload["title"]
        assert room["created_at"]
    finally:
        assert client.delete(f"/api/rooms/{room['id']}").status_code == 204


# --- validation --------------------------------------------------------------

INVALID_CREATE = [
    {"title": ""},
    {"title": "x"},
    {"title": "x" * 200},
    {"title": "صالح", "seats_total": 0},
    {"title": "صالح", "seats_total": 1},
    {"title": "صالح", "seats_total": 13},
    {"title": "صالح", "seats_total": -5},
    {"title": "صالح", "seats_total": 999},
    {"seats_total": 8},
    {"title": None},
]


@pytest.mark.parametrize("payload", INVALID_CREATE)
def test_create_room_rejects_invalid_payload(client, payload):
    assert client.post("/api/rooms", json=payload).status_code == 422


# --- join / leave ------------------------------------------------------------

@pytest.mark.parametrize("joins", [1, 2, 3, 4, 5, 10])
def test_join_then_leave_restores_listeners(client, new_room, joins):
    room = new_room(title=title_for(f"join-{joins}"))
    start = room["listeners"]
    for _ in range(joins):
        joined = client.post(f"/api/rooms/{room['id']}/join")
        assert joined.status_code == 200
        start += 1
        assert joined.json()["listeners"] == start

    for _ in range(joins):
        left = client.post(f"/api/rooms/{room['id']}/leave")
        assert left.status_code == 200
        start -= 1
        assert left.json()["listeners"] == start

    assert start == room["listeners"]


@pytest.mark.parametrize("extra_leaves", [1, 3, 8])
def test_leave_never_goes_negative(client, new_room, extra_leaves):
    room = new_room(title=title_for("leave-floor"))
    for _ in range(extra_leaves + 1):
        client.post(f"/api/rooms/{room['id']}/leave")
    current = client.get(f"/api/rooms/{room['id']}").json()["listeners"]
    assert current == 0


@pytest.mark.parametrize("action", ["join", "leave"])
def test_missing_room_returns_404(client, action):
    missing = 999_999
    assert client.post(f"/api/rooms/{missing}/{action}").status_code == 404


# --- listing, search, filters ------------------------------------------------

@pytest.mark.parametrize(
    "query,expected_substring",
    [
        ("لودو", "لودو"),
        ("أونو", "أونو"),
        ("بلياردو", "بلياردو"),
        ("دومينو", "دومينو"),
        ("قهوة", "قهوة"),
        ("شعر", "شعر"),
        ("قرآن", "قرآن"),
        ("ستاند", "ستاند"),
    ],
)
def test_search_returns_matching_rooms(client, query, expected_substring):
    rooms = client.get("/api/rooms", params={"q": query}).json()
    assert rooms, f"لا نتائج للبحث {query}"
    assert all(
        expected_substring in room["title"] or expected_substring in room["host"] for room in rooms
    )


def test_battle_filter_only_returns_battle_rooms(client):
    rooms = client.get("/api/rooms", params={"battle": True}).json()
    assert rooms
    assert all(room["is_battle"] for room in rooms)


def test_non_battle_filter_excludes_battle_rooms(client):
    rooms = client.get("/api/rooms", params={"battle": False}).json()
    assert rooms
    assert all(not room["is_battle"] for room in rooms)


def test_featured_filter_returns_featured_only(client):
    rooms = client.get("/api/rooms", params={"featured": True}).json()
    assert all(room["featured"] for room in rooms)


@pytest.mark.parametrize("query", ["zzz-no-room", "غرفة غير موجودة", "!!!", "  "])
def test_search_without_matches(client, query):
    rooms = client.get("/api/rooms", params={"q": query}).json()
    if query.strip() == "":
        assert rooms
    else:
        assert rooms == [] or all(query in room["title"] for room in rooms)


def test_new_room_is_listed_immediately(client, new_room):
    room = new_room(title=title_for("listed"))
    ids = [item["id"] for item in client.get("/api/rooms").json()]
    assert room["id"] in ids


# --- deletion ----------------------------------------------------------------

def test_delete_room_removes_it(client, new_room):
    room = new_room(title=title_for("delete"))
    assert client.delete(f"/api/rooms/{room['id']}").status_code == 204
    assert client.get(f"/api/rooms/{room['id']}").status_code == 404


def test_delete_missing_room_returns_404(client):
    assert client.delete("/api/rooms/999999").status_code == 404


def test_deleting_room_logs_activity(client, new_room):
    room = new_room(title=title_for("activity"))
    client.delete(f"/api/rooms/{room['id']}")
    entries = client.get("/api/activity").json()
    assert any(entry["action"] == "room_deleted" and room["title"] in entry["detail"] for entry in entries)
