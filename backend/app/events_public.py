"""المسارات العامة للفعاليات والبانرات — كل النتائج تُحسب هنا على الخادم."""

from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from .db import engine
from .events_common import (
    USER_ID,
    banner_dict,
    charge_entry,
    event_dict,
    event_leaderboard,
    global_leaderboard,
    notify_user,
    parse_json,
    participation_dict,
    user_history,
)
from .events_engine import (
    can_join,
    event_phase,
    grade_quiz,
    parse_dt,
    pick_questions,
    public_questions,
    resolve_game,
)
from .events_models import (
    EventBanner,
    EventGame,
    EventParticipation,
    GameEvent,
)
from .events_ws import hub
from .models import Profile, now_iso

router = APIRouter(prefix="/api", tags=["events"])


class JoinPayload(BaseModel):
    team: str | None = Field(default=None, max_length=20)


class QuizSubmitPayload(BaseModel):
    answers: list[int] = Field(default_factory=list, max_length=50)


def _visible_event(session: Session, event_id: int) -> GameEvent:
    event = session.get(GameEvent, event_id)
    if event is None or event.status == "draft":
        raise HTTPException(status_code=404, detail="الفعالية غير موجودة")
    return event


@router.get("/events/games")
def games_catalog() -> list[dict]:
    with Session(engine) as session:
        rows = session.scalars(
            select(EventGame).order_by(EventGame.sort_order, EventGame.id)
        ).all()
        return [
            {
                "key": row.key,
                "name": row.name,
                "description": row.description,
                "rules": row.rules,
                "duration_seconds": row.duration_seconds,
                "enabled": row.enabled,
                "sort_order": row.sort_order,
            }
            for row in rows
        ]


@router.get("/events/mine")
def my_events() -> dict:
    with Session(engine) as session:
        return user_history(session, USER_ID)


@router.get("/leaderboard")
def leaderboard(period: str = "all") -> dict:
    with Session(engine) as session:
        rows = global_leaderboard(session, period)
    return {"period": period, "rows": rows}


@router.get("/events")
def list_events(kind: str | None = None) -> list[dict]:
    with Session(engine) as session:
        query = (
            select(GameEvent)
            .where(GameEvent.published.is_(True), GameEvent.status != "draft")
            .order_by(GameEvent.starts_at.desc())
        )
        rows = list(session.scalars(query).all())
        if kind:
            rows = [row for row in rows if row.kind == kind]
        priority = {"active": 0, "ending": 1, "upcoming": 2, "paused": 3, "ended": 4}
        rows.sort(
            key=lambda row: (
                priority.get(
                    event_phase(row.status, row.starts_at, row.ends_at), 9
                ),
                row.starts_at,
            )
        )
        return [event_dict(session, row) for row in rows]


@router.get("/events/{event_id}")
def event_detail(event_id: int) -> dict:
    with Session(engine) as session:
        event = _visible_event(session, event_id)
        return event_dict(session, event)


@router.post("/events/{event_id}/join", status_code=201)
async def join_event(event_id: int, payload: JoinPayload | None = None) -> dict:
    with Session(engine) as session:
        event = _visible_event(session, event_id)
        if not can_join(event.status, event.starts_at, event.ends_at):
            raise HTTPException(status_code=409, detail="المشاركة غير مفعّلة حاليًا")

        game = session.scalar(
            select(EventGame).where(EventGame.key == event.game_key)
        )
        if game is None or not game.enabled:
            raise HTTPException(status_code=409, detail="هذه اللعبة غير متاحة الآن")

        existing = session.scalar(
            select(EventParticipation).where(
                EventParticipation.event_id == event_id,
                EventParticipation.user_id == USER_ID,
            )
        )
        if existing is not None:
            if existing.status == "playing" and event.game_key == "quiz":
                state = parse_json(existing.state_json)
                return {
                    "participation": participation_dict(existing),
                    "questions": public_questions(state.get("questions") or []),
                    "event": event_dict(session, event),
                }
            raise HTTPException(
                status_code=409, detail="شاركت في هذه الفعالية مسبقًا"
            )

        profile = session.get(Profile, USER_ID)
        if profile is None:
            raise HTTPException(status_code=404, detail="الحساب غير موجود")

        charge_entry(session, event, USER_ID)

        team = (payload.team if payload else None) or None
        if event.game_key == "quiz":
            questions = pick_questions(5)
            part = EventParticipation(
                event_id=event_id,
                user_id=USER_ID,
                score=0,
                status="playing",
                state_json=json.dumps(
                    {"questions": questions}, ensure_ascii=False
                ),
                created_at=now_iso(),
            )
            session.add(part)
            session.flush()
            notify_user(
                session,
                USER_ID,
                "بدأت مشاركتك",
                f"{event.title} — أجب قبل انتهاء الوقت",
                "event",
            )
            session.commit()
            session.refresh(part)
            response = {
                "participation": participation_dict(part),
                "questions": public_questions(questions),
                "event": event_dict(session, event),
            }
        else:
            resolved = resolve_game(event.game_key, team)
            chosen_team = resolved["detail"].get("team", team)
            part = EventParticipation(
                event_id=event_id,
                user_id=USER_ID,
                score=int(resolved["score"]),
                status="finished",
                team=chosen_team,
                detail_json=json.dumps(
                    resolved["detail"], ensure_ascii=False
                ),
                created_at=now_iso(),
                finished_at=now_iso(),
            )
            session.add(part)
            session.flush()
            notify_user(
                session,
                USER_ID,
                "تم تسجيل مشاركتك",
                f"{event.title} — {resolved['detail'].get('headline', '')}",
                "event",
            )
            session.commit()
            session.refresh(part)
            response = {
                "participation": participation_dict(part),
                "result": resolved["detail"],
                "event": event_dict(session, event),
            }

    await hub.broadcast(
        {"type": "event_update", "event_id": event_id, "reason": "join"}
    )
    return response


@router.post("/events/{event_id}/submit")
async def submit_quiz(event_id: int, payload: QuizSubmitPayload) -> dict:
    with Session(engine) as session:
        event = _visible_event(session, event_id)
        if event.game_key != "quiz":
            raise HTTPException(status_code=409, detail="هذه الفعالية ليست مسابقة أسئلة")
        part = session.scalar(
            select(EventParticipation).where(
                EventParticipation.event_id == event_id,
                EventParticipation.user_id == USER_ID,
            )
        )
        if part is None:
            raise HTTPException(status_code=404, detail="لم تبدأ المشاركة بعد")
        if part.status != "playing":
            raise HTTPException(status_code=409, detail="تم تسليم إجاباتك مسبقًا")

        state = parse_json(part.state_json)
        questions = state.get("questions") or []
        if not questions:
            raise HTTPException(status_code=409, detail="لا توجد أسئلة محفوظة")

        started = parse_dt(part.created_at)
        elapsed = 0
        if started is not None:
            elapsed = int(
                (datetime.now(timezone.utc) - started).total_seconds()
            )
        graded = grade_quiz(questions, payload.answers, elapsed)
        part.score = int(graded["score"])
        part.status = "finished"
        part.finished_at = now_iso()
        part.detail_json = json.dumps(graded["detail"], ensure_ascii=False)
        part.state_json = None
        notify_user(
            session,
            USER_ID,
            "تم تقييم إجاباتك",
            f"{event.title} — {graded['detail']['headline']}",
            "event",
        )
        session.commit()
        session.refresh(part)
        response = {
            "participation": participation_dict(part),
            "result": graded["detail"],
            "event": event_dict(session, event),
        }

    await hub.broadcast(
        {"type": "event_update", "event_id": event_id, "reason": "submit"}
    )
    return response


@router.get("/events/{event_id}/leaderboard")
def event_board(event_id: int, period: str = "all") -> dict:
    with Session(engine) as session:
        event = _visible_event(session, event_id)
        rows = event_leaderboard(session, event.id, limit=50)
        if period in {"daily", "weekly"}:
            now = datetime.now(timezone.utc)
            if period == "daily":
                start = now.replace(hour=0, minute=0, second=0, microsecond=0)
            else:
                start = (now - timedelta(days=now.weekday())).replace(
                    hour=0, minute=0, second=0, microsecond=0
                )
            rows = [
                row
                for row in rows
                if (parse_dt(row["finished_at"]) or start) >= start
            ]
            for index, row in enumerate(rows, start=1):
                row["rank"] = index
    return {"period": period, "rows": rows}


@router.get("/banners")
def banners() -> list[dict]:
    now = datetime.now(timezone.utc)
    with Session(engine) as session:
        rows = session.scalars(
            select(EventBanner)
            .where(EventBanner.active.is_(True))
            .order_by(EventBanner.sort_order, EventBanner.id)
        ).all()
        active = []
        for row in rows:
            start = parse_dt(row.starts_at)
            end = parse_dt(row.ends_at)
            if start is not None and now < start:
                continue
            if end is not None and now > end:
                continue
            active.append(row)
        for row in active:
            row.views += 1
        session.commit()
        return [banner_dict(row) for row in active]


@router.post("/banners/{banner_id}/click")
def banner_click(banner_id: int) -> dict:
    with Session(engine) as session:
        banner = session.get(EventBanner, banner_id)
        if banner is None:
            raise HTTPException(status_code=404, detail="البانر غير موجود")
        banner.clicks += 1
        session.commit()
        session.refresh(banner)
        data = banner_dict(banner)
    return {"path": data["path"], "external": data["external"], "clicks": data["clicks"]}
