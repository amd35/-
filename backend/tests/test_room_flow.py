"""End-to-end API tests for the room flow: create → join → leave → delete."""

import os
import uuid

import httpx

BASE_URL = os.environ.get("API_BASE_URL", "http://localhost:8000")


def test_create_join_and_leave_room() -> None:
    title = f"غرفة اختبار {uuid.uuid4().hex[:6]}"
    with httpx.Client(base_url=BASE_URL, timeout=10) as client:
        created = client.post(
            "/api/rooms",
            json={
                "title": title,
                "category": "ونسة",
                "seats_total": 6,
                "is_battle": False,
            },
        )
        assert created.status_code == 201, created.text
        room = created.json()
        room_id = room["id"]

        try:
            assert room["title"] == title
            assert room["listeners"] == 1
            assert room["seats_total"] == 6

            joined = client.post(f"/api/rooms/{room_id}/join")
            assert joined.status_code == 200
            assert joined.json()["listeners"] == room["listeners"] + 1

            left = client.post(f"/api/rooms/{room_id}/leave")
            assert left.status_code == 200
            assert left.json()["listeners"] == room["listeners"]

            listed = client.get("/api/rooms")
            assert any(item["id"] == room_id for item in listed.json())
        finally:
            deleted = client.delete(f"/api/rooms/{room_id}")
            assert deleted.status_code == 204

        assert client.get(f"/api/rooms/{room_id}").status_code == 404


def test_room_requires_a_title() -> None:
    with httpx.Client(base_url=BASE_URL, timeout=10) as client:
        response = client.post("/api/rooms", json={"title": "x"})
        assert response.status_code == 422
