"""API coverage for ads, events, games, server-side grading and idempotent payouts."""

from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy import delete, or_
from sqlalchemy.orm import Session

from app.db import engine
from app.events_models import EventLedger
from app.models import Notification, Profile, now_iso


def iso(delta: timedelta) -> str:
    return (datetime.now(timezone.utc) + delta).isoformat(timespec="seconds")


def event_payload(title: str, game_key: str = "lucky_challenge", fee: int = 0, gold: int = 25) -> dict:
    return {
        "title": title,
        "kind": "challenge",
        "game_key": game_key,
        "description": "فعالية اختبار",
        "media_url": "",
        "media_type": "image",
        "rules": "قواعد الاختبار",
        "conditions": "شروط الاختبار",
        "starts_at": iso(timedelta(hours=-1)),
        "ends_at": iso(timedelta(days=1)),
        "entry_fee_gold": fee,
        "winners_count": 1,
        "status": "active",
        "published": True,
        "prizes": [{"rank": 1, "kind": "gold", "amount": gold, "label": f"{gold} ذهب"}],
    }


def create_event(client, title: str, **kwargs) -> dict:
    response = client.post("/api/admin/events", json=event_payload(title, **kwargs))
    assert response.status_code == 201, response.text
    return response.json()


def cleanup(
    client,
    event_id: int,
    title: str,
    original_gold: int | None = None,
    started_at: str | None = None,
) -> None:
    with Session(engine) as session:
        if original_gold is not None:
            profile = session.get(Profile, 1)
            if profile is not None:
                profile.gold = original_gold
        session.execute(delete(EventLedger).where(EventLedger.event_id == event_id))
        conditions = [Notification.body.like(f"%{title}%")]
        if started_at:
            conditions.append(Notification.created_at >= started_at)
        session.execute(delete(Notification).where(or_(*conditions)))
        session.commit()
    client.delete(f"/api/admin/events/{event_id}")


def test_games_catalog_is_served(client):
    response = client.get("/api/events/games")
    assert response.status_code == 200
    keys = {item["key"] for item in response.json()}
    assert {
        "lucky_challenge",
        "prize_wheel",
        "mystery_box",
        "points_challenge",
        "quiz",
        "group_game",
    } <= keys


def test_event_lifecycle_and_idempotent_payout(client):
    title = f"اختبار دورة كاملة {uuid.uuid4().hex[:6]}"
    started_at = now_iso()
    original_gold = client.get("/api/me").json()["gold"]
    event = create_event(client, title, gold=25)
    try:
        joined = client.post(f"/api/events/{event['id']}/join", json={})
        assert joined.status_code == 201, joined.text
        assert joined.json()["participation"]["score"] > 0

        duplicate = client.post(f"/api/events/{event['id']}/join", json={})
        assert duplicate.status_code == 409

        finalized = client.post(f"/api/admin/events/{event['id']}/finalize")
        assert finalized.status_code == 200, finalized.text
        winners = finalized.json()["winners"]
        assert len(winners) == 1
        assert winners[0]["status"] == "pending"

        paid = client.post(
            f"/api/admin/events/{event['id']}/winners/{winners[0]['id']}/send"
        )
        assert paid.status_code == 200, paid.text
        assert paid.json()["status"] == "sent"
        assert client.get("/api/me").json()["gold"] == original_gold + 25

        paid_again = client.post(
            f"/api/admin/events/{event['id']}/winners/{winners[0]['id']}/send"
        )
        assert paid_again.status_code == 200
        assert client.get("/api/me").json()["gold"] == original_gold + 25

        mine = client.get("/api/events/mine").json()
        assert any(item["event_id"] == event["id"] for item in mine["winners"])
        assert any(item["event_id"] == event["id"] for item in mine["ledger"])
    finally:
        cleanup(client, event["id"], title, original_gold, started_at)


def test_quiz_questions_hide_answers_and_grade_once(client):
    title = f"اختبار أسئلة {uuid.uuid4().hex[:6]}"
    started_at = now_iso()
    event = create_event(client, title, game_key="quiz")
    try:
        started = client.post(f"/api/events/{event['id']}/join", json={})
        assert started.status_code == 201, started.text
        questions = started.json()["questions"]
        assert len(questions) == 5
        assert all("correct" not in question for question in questions)

        graded = client.post(
            f"/api/events/{event['id']}/submit", json={"answers": [0, 0, 0, 0, 0]}
        )
        assert graded.status_code == 200, graded.text
        assert graded.json()["participation"]["status"] == "finished"

        again = client.post(
            f"/api/events/{event['id']}/submit", json={"answers": [0, 0, 0, 0, 0]}
        )
        assert again.status_code == 409
    finally:
        cleanup(client, event["id"], title, started_at=started_at)


def test_entry_fee_requires_enough_gold(client):
    title = f"اختبار رسوم {uuid.uuid4().hex[:6]}"
    event = create_event(client, title, game_key="mystery_box", fee=999999)
    try:
        response = client.post(f"/api/events/{event['id']}/join", json={})
        assert response.status_code == 402
    finally:
        cleanup(client, event["id"], title)


def test_banner_views_clicks_and_delete(client):
    title = f"بانر اختبار {uuid.uuid4().hex[:6]}"
    response = client.post(
        "/api/admin/banners",
        json={
            "title": title,
            "subtitle": "اختبار",
            "media_url": "",
            "media_type": "image",
            "link_type": "store",
            "link_ref": None,
            "starts_at": iso(timedelta(hours=-1)),
            "ends_at": iso(timedelta(days=1)),
            "active": True,
            "sort_order": 99,
        },
    )
    assert response.status_code == 201, response.text
    banner = response.json()
    try:
        listed = client.get("/api/banners").json()
        found = next(item for item in listed if item["id"] == banner["id"])
        assert found["views"] >= 1
        click = client.post(f"/api/banners/{banner['id']}/click")
        assert click.status_code == 200
        assert click.json()["path"] == "/store"
        assert click.json()["clicks"] == 1
    finally:
        assert client.delete(f"/api/admin/banners/{banner['id']}").status_code == 204


@pytest.mark.parametrize("bad_payload", [{"title": "x"}, {"title": "x" * 200}])
def test_create_event_validation(client, bad_payload):
    response = client.post("/api/admin/events", json=bad_payload)
    assert response.status_code == 422
