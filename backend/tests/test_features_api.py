"""Tasks, profile, notifications, contact and metrics API coverage."""

import uuid

import pytest

PROJECTS = ["عام", "التطوير", "التصميم", "الجودة", "المحتوى"]
TITLES = ["مهمة أولى", "مراجعة الغرف", "نشر تحديث", "اختبار المايك"]


def make_task(client, title: str, project: str = "عام") -> dict:
    response = client.post("/api/tasks", json={"title": title, "project": project})
    assert response.status_code == 201, response.text
    return response.json()


@pytest.mark.parametrize("project", PROJECTS)
@pytest.mark.parametrize("title", TITLES)
def test_create_task_matrix(client, title, project):
    task = make_task(client, f"{title} {uuid.uuid4().hex[:4]}", project)
    try:
        assert task["project"] == project
        assert task["done"] is False
        assert task["created_at"]
    finally:
        assert client.delete(f"/api/tasks/{task['id']}").status_code == 204


@pytest.mark.parametrize("payload", [{"title": ""}, {"title": "x"}, {"title": None}, {}, {"title": "x" * 200}])
def test_create_task_validation(client, payload):
    assert client.post("/api/tasks", json=payload).status_code == 422


@pytest.mark.parametrize("rounds", [1, 2, 3])
def test_toggle_task_completion(client, rounds):
    task = make_task(client, f"مهمة تبديل {uuid.uuid4().hex[:4]}")
    try:
        state = False
        for _ in range(rounds):
            state = not state
            response = client.patch(f"/api/tasks/{task['id']}", json={"done": state})
            assert response.status_code == 200
            assert response.json()["done"] is state
    finally:
        client.delete(f"/api/tasks/{task['id']}")


def test_toggle_missing_task_returns_404(client):
    assert client.patch("/api/tasks/999999", json={"done": True}).status_code == 404


def test_delete_missing_task_returns_404(client):
    assert client.delete("/api/tasks/999999").status_code == 404


# --- profile -----------------------------------------------------------------

PROFILE_FIELDS = [
    {"name": "اسم جديد"},
    {"handle": "@new_handle"},
    {"bio": "نبذة محدثة"},
    {"language": "en"},
    {"push_enabled": False},
    {"sound_enabled": False},
]


@pytest.mark.parametrize("payload", PROFILE_FIELDS)
def test_profile_update_persists_each_field(client, payload):
    original = client.get("/api/me").json()
    try:
        updated = client.patch("/api/me", json=payload)
        assert updated.status_code == 200
        body = updated.json()
        for key, value in payload.items():
            assert body[key] == value
        assert client.get("/api/me").json()[key] == value
    finally:
        client.patch("/api/me", json=original)


def test_profile_returns_all_expected_fields(client):
    profile = client.get("/api/me").json()
    for key in [
        "name",
        "handle",
        "level",
        "coins",
        "diamonds",
        "bio",
        "language",
        "push_enabled",
        "sound_enabled",
    ]:
        assert key in profile


# --- notifications -----------------------------------------------------------

def test_notifications_list_shape(client):
    items = client.get("/api/notifications").json()
    assert items
    for item in items:
        assert {"id", "title", "body", "kind", "read", "created_at"} <= set(item)


def test_mark_single_notification_read(client):
    items = client.get("/api/notifications").json()
    target = next((item for item in items if not item["read"]), None)
    if target is None:
        pytest.skip("كل التنبيهات مقروءة")
    response = client.patch(f"/api/notifications/{target['id']}")
    assert response.status_code == 200
    assert response.json()["read"] is True


def test_mark_missing_notification_returns_404(client):
    assert client.patch("/api/notifications/999999").status_code == 404


def test_read_all_notifications(client):
    original = client.get("/api/notifications").json()
    unread_ids = [item["id"] for item in original if not item["read"]]
    try:
        response = client.post("/api/notifications/read-all")
        assert response.status_code == 200
        assert "updated" in response.json()
        assert all(item["read"] for item in client.get("/api/notifications").json())
    finally:
        for notification_id in unread_ids:
            client.patch(f"/api/notifications/{notification_id}", json={"read": False})


# --- contact -----------------------------------------------------------------

VALID_CONTACTS = [
    {"name": "أحمد", "email": "ahmed@example.com", "message": "استفسار عن الغرف"},
    {"name": "سارة", "email": "sara@example.com", "message": "مشكلة في المايك"},
    {"name": "ليلى", "email": "layla@example.com", "message": "اقتراح لعبة جديدة"},
]


@pytest.mark.parametrize("payload", VALID_CONTACTS)
def test_contact_accepts_valid_messages(client, payload):
    assert client.post("/api/contact", json=payload).status_code == 201


INVALID_CONTACTS = [
    {},
    {"name": "أ", "email": "a@b.c", "message": "نص"},
    {"name": "أحمد", "email": "", "message": "نص"},
    {"name": "أحمد", "email": "a@b.c", "message": ""},
    {"name": "أحمد", "email": "a@b.c", "message": "x"},
    {"name": "أحمد", "email": "a@b.c"},
    {"email": "a@b.c", "message": "نص صالح"},
]


@pytest.mark.parametrize("payload", INVALID_CONTACTS)
def test_contact_rejects_invalid_messages(client, payload):
    assert client.post("/api/contact", json=payload).status_code == 422


# --- metrics & activity ------------------------------------------------------

METRIC_KEYS = [
    "rooms_total",
    "battle_rooms",
    "listeners_total",
    "friends_online",
    "friends_total",
    "tasks_open",
    "tasks_done",
    "unread_notifications",
    "categories",
    "activity_by_day",
    "top_rooms",
]


@pytest.mark.parametrize("key", METRIC_KEYS)
def test_metrics_exposes_key(client, key):
    metrics = client.get("/api/metrics").json()
    assert key in metrics


def test_metrics_counts_match_room_list(client):
    metrics = client.get("/api/metrics").json()
    rooms = client.get("/api/rooms").json()
    assert metrics["rooms_total"] == len(rooms)
    assert metrics["battle_rooms"] == sum(1 for room in rooms if room["is_battle"])


def test_metrics_categories_are_sorted_by_count(client):
    categories = client.get("/api/metrics").json()["categories"]
    counts = [item["count"] for item in categories]
    assert counts == sorted(counts, reverse=True)


def test_activity_list_shape(client):
    entries = client.get("/api/activity").json()
    assert entries
    for entry in entries:
        assert {"id", "action", "detail", "created_at"} <= set(entry)


def test_activity_respects_limit(client):
    entries = client.get("/api/activity", params={"limit": 3}).json()
    assert len(entries) <= 3


def test_creating_room_adds_activity(client, new_room):
    room = new_room(title=f"غرفة سجل {uuid.uuid4().hex[:5]}")
    entries = client.get("/api/activity").json()
    assert any(entry["action"] == "room_created" and room["title"] in entry["detail"] for entry in entries)


# --- friends -----------------------------------------------------------------

def test_friends_status_ordering(client):
    friends = client.get("/api/friends").json()
    assert friends
    online_flags = [friend["online"] for friend in friends]
    assert online_flags == sorted(online_flags, reverse=True)


def test_offline_friends_have_last_seen(client):
    friends = client.get("/api/friends").json()
    for friend in friends:
        if not friend["online"]:
            assert friend["last_seen"], f"{friend['name']} بلا آخر ظهور"


def test_friend_requests_shape(client):
    requests = client.get("/api/friend-requests").json()
    for item in requests:
        assert {"id", "name", "handle", "mutual"} <= set(item)


def test_games_catalog(client):
    games = client.get("/api/games").json()
    keys = {game["key"] for game in games}
    assert {"ludo", "domino", "uno", "billiards"} <= keys
