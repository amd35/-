"""Shared fixtures: every test runs against the live API service."""

import os

import httpx
import pytest

BASE_URL = os.environ.get("API_BASE_URL", "http://localhost:8000")

CATEGORIES = ["ونسة", "ألعاب", "ترفيه", "شعر", "تعليم", "ديني"]


@pytest.fixture
def client():
    with httpx.Client(base_url=BASE_URL, timeout=15) as http:
        yield http


@pytest.fixture
def new_room(client):
    """Creates rooms during a test and always deletes them afterwards."""

    created: list[int] = []

    def make(**overrides):
        payload = {
            "title": "غرفة اختبار",
            "category": "ونسة",
            "seats_total": 8,
            "is_battle": False,
        }
        payload.update(overrides)
        response = client.post("/api/rooms", json=payload)
        assert response.status_code == 201, response.text
        body = response.json()
        created.append(body["id"])
        return body

    yield make

    for room_id in created:
        client.delete(f"/api/rooms/{room_id}")
