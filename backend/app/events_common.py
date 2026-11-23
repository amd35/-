"""منطق مشترك لنظام الفعاليات: التسلسل، الحسابات، الاعتماد والصرف."""

from __future__ import annotations

import json
import os
from datetime import datetime, timedelta, timezone

from fastapi import Header, HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .events_engine import (
    EVENT_KINDS,
    PRIZE_KINDS,
    event_phase,
    parse_dt,
    public_questions,
)
from .events_models import (
    EventBanner,
    EventGame,
    EventLedger,
    EventParticipation,
    EventPrize,
    EventWinner,
    GameEvent,
)
from .models import Notification, Profile, now_iso

USER_ID = 1


def require_admin(
    x_admin_key: str | None = Header(default=None, alias="X-Admin-Key"),
) -> None:
    """حماية اختيارية: عند ضبط EVENTS_ADMIN_KEY تصبح مسارات الإدارة مقفلة.

    التطبيق الحالي بلا حسابات؛ لذلك يبقى مفتوحًا في التطوير ما لم يُضبط المفتاح.
    """

    expected = os.environ.get("EVENTS_ADMIN_KEY", "").strip()
    if expected and x_admin_key != expected:
        raise HTTPException(status_code=401, detail="مفتاح الإدارة غير صحيح")


def parse_json(value: str | None) -> dict:
    if not value:
        return {}
    try:
        data = json.loads(value)
    except (TypeError, ValueError):
        return {}
    return data if isinstance(data, dict) else {}


def profile_name(session: Session, user_id: int) -> str:
    profile = session.get(Profile, user_id)
    return profile.name if profile is not None else "لاعب"


def prize_dict(prize: EventPrize) -> dict:
    return {
        "id": prize.id,
        "rank": prize.rank,
        "kind": prize.kind,
        "kind_label": PRIZE_KINDS.get(prize.kind, prize.kind),
        "amount": prize.amount,
        "label": prize.label,
    }


def participation_dict(item: EventParticipation) -> dict:
    return {
        "id": item.id,
        "event_id": item.event_id,
        "user_id": item.user_id,
        "score": item.score,
        "status": item.status,
        "team": item.team,
        "detail": parse_json(item.detail_json),
        "created_at": item.created_at,
        "finished_at": item.finished_at,
    }


def winner_dict(item: EventWinner, name: str | None = None) -> dict:
    return {
        "id": item.id,
        "event_id": item.event_id,
        "user_id": item.user_id,
        "user_name": name or "لاعب",
        "rank": item.rank,
        "prize_kind": item.prize_kind,
        "prize_kind_label": PRIZE_KINDS.get(item.prize_kind, item.prize_kind),
        "prize_amount": item.prize_amount,
        "prize_label": item.prize_label,
        "status": item.status,
        "created_at": item.created_at,
        "approved_at": item.approved_at,
        "sent_at": item.sent_at,
    }


def ledger_dict(item: EventLedger) -> dict:
    return {
        "id": item.id,
        "event_id": item.event_id,
        "kind": item.kind,
        "currency": item.currency,
        "amount": item.amount,
        "balance_after": item.balance_after,
        "ref": item.ref,
        "detail": item.detail,
        "created_at": item.created_at,
    }


def banner_dict(banner: EventBanner) -> dict:
    path = "/"
    external = False
    if banner.link_type == "event" and banner.link_ref:
        path = f"/events/{banner.link_ref}"
    elif banner.link_type == "store":
        path = "/store"
    elif banner.link_type == "gifts":
        path = "/store"
    elif banner.link_type == "frames":
        path = "/store"
    elif banner.link_type == "rooms":
        path = "/data-list"
    elif banner.link_type == "activity":
        path = "/activity-log"
    elif banner.link_type == "leaderboard":
        path = "/leaderboard"
    elif banner.link_type == "url" and banner.link_ref:
        path = banner.link_ref
        external = True
    return {
        "id": banner.id,
        "title": banner.title,
        "subtitle": banner.subtitle,
        "media_url": banner.media_url,
        "media_type": banner.media_type,
        "link_type": banner.link_type,
        "link_ref": banner.link_ref,
        "path": path,
        "external": external,
        "starts_at": banner.starts_at,
        "ends_at": banner.ends_at,
        "active": banner.active,
        "sort_order": banner.sort_order,
        "views": banner.views,
        "clicks": banner.clicks,
        "created_at": banner.created_at,
    }


def event_prizes(session: Session, event_id: int) -> list[EventPrize]:
    return list(
        session.scalars(
            select(EventPrize)
            .where(EventPrize.event_id == event_id)
            .order_by(EventPrize.rank)
        ).all()
    )


def event_leaderboard(session: Session, event_id: int, limit: int = 20) -> list[dict]:
    rows = session.execute(
        select(EventParticipation, Profile)
        .join(Profile, Profile.id == EventParticipation.user_id, isouter=True)
        .where(
            EventParticipation.event_id == event_id,
            EventParticipation.status == "finished",
        )
        .order_by(
            EventParticipation.score.desc(),
            EventParticipation.finished_at.asc(),
        )
        .limit(limit)
    ).all()
    return [
        {
            "rank": index,
            "user_id": part.user_id,
            "name": profile.name if profile is not None else "لاعب",
            "score": part.score,
            "team": part.team,
            "finished_at": part.finished_at,
        }
        for index, (part, profile) in enumerate(rows, start=1)
    ]


def event_winners(session: Session, event_id: int) -> list[dict]:
    rows = session.execute(
        select(EventWinner, Profile)
        .join(Profile, Profile.id == EventWinner.user_id, isouter=True)
        .where(EventWinner.event_id == event_id)
        .order_by(EventWinner.rank)
    ).all()
    return [
        winner_dict(winner, profile.name if profile is not None else None)
        for winner, profile in rows
    ]


def event_dict(session: Session, event: GameEvent, user_id: int = USER_ID) -> dict:
    prizes = event_prizes(session, event.id)
    participation = session.scalar(
        select(EventParticipation).where(
            EventParticipation.event_id == event.id,
            EventParticipation.user_id == user_id,
        )
    )
    game = session.scalar(select(EventGame).where(EventGame.key == event.game_key))
    phase = event_phase(event.status, event.starts_at, event.ends_at)
    participants = session.scalar(
        select(func.count())
        .select_from(EventParticipation)
        .where(EventParticipation.event_id == event.id)
    )
    questions: list[dict] | None = None
    if participation is not None and participation.status == "playing":
        state = parse_json(participation.state_json)
        questions = public_questions(state.get("questions") or [])
    winners = event_winners(session, event.id) if event.finalized or phase == "ended" else []
    team_scores: dict[str, int] = {}
    for row in session.scalars(
        select(EventParticipation).where(
            EventParticipation.event_id == event.id,
            EventParticipation.status == "finished",
        )
    ).all():
        if row.team:
            team_scores[row.team] = team_scores.get(row.team, 0) + row.score
    return {
        "id": event.id,
        "title": event.title,
        "kind": event.kind,
        "kind_label": EVENT_KINDS.get(event.kind, event.kind),
        "game_key": event.game_key,
        "game_name": game.name if game is not None else event.game_key,
        "game_rules": game.rules if game is not None else "",
        "game_duration": game.duration_seconds if game is not None else 60,
        "game_enabled": bool(game.enabled) if game is not None else False,
        "description": event.description,
        "media_url": event.media_url,
        "media_type": event.media_type,
        "rules": event.rules,
        "conditions": event.conditions,
        "starts_at": event.starts_at,
        "ends_at": event.ends_at,
        "entry_fee_gold": event.entry_fee_gold,
        "winners_count": event.winners_count,
        "status": event.status,
        "phase": phase,
        "published": event.published,
        "finalized": event.finalized,
        "participants": int(participants or 0),
        "prizes": [prize_dict(prize) for prize in prizes],
        "joined": participation is not None,
        "my_participation": participation_dict(participation) if participation else None,
        "questions": questions,
        "leaderboard": event_leaderboard(session, event.id),
        "team_scores": team_scores,
        "winners": winners,
        "created_at": event.created_at,
        "updated_at": event.updated_at,
    }


def admin_event_dict(session: Session, event: GameEvent) -> dict:
    data = event_dict(session, event)
    winners = event_winners(session, event.id)
    data["winner_count"] = len(winners)
    data["pending_winners"] = sum(1 for item in winners if item["status"] == "pending")
    data["sent_winners"] = sum(1 for item in winners if item["status"] == "sent")
    data["start_notified"] = event.start_notified
    data["ending_notified"] = event.ending_notified
    return data


def notify_user(session: Session, user_id: int, title: str, body: str, kind: str) -> None:
    if session.get(Profile, user_id) is None:
        return
    session.add(
        Notification(
            title=title[:120],
            body=body[:240],
            kind=kind,
            read=False,
            created_at=now_iso(),
        )
    )


def notify_all(session: Session, title: str, body: str, kind: str) -> None:
    for profile in session.scalars(select(Profile)).all():
        session.add(
            Notification(
                title=title[:120],
                body=body[:240],
                kind=kind,
                read=False,
                created_at=now_iso(),
            )
        )


def charge_entry(session: Session, event: GameEvent, user_id: int = USER_ID) -> None:
    """يخصم رسوم الدخول مرة واحدة بمرجع فريد، مع قفل صف الرصيد."""

    if event.entry_fee_gold <= 0:
        return
    profile = session.execute(
        select(Profile).where(Profile.id == user_id).with_for_update()
    ).scalar_one_or_none()
    if profile is None:
        raise HTTPException(status_code=404, detail="الحساب غير موجود")
    if profile.gold < event.entry_fee_gold:
        raise HTTPException(status_code=402, detail="رصيد الذهب غير كافٍ للمشاركة")
    profile.gold -= event.entry_fee_gold
    session.flush()
    session.add(
        EventLedger(
            user_id=user_id,
            event_id=event.id,
            kind="entry_fee",
            currency="gold",
            amount=event.entry_fee_gold,
            balance_after=profile.gold,
            ref=f"entry:{event.id}:{user_id}",
            detail=f"رسوم دخول: {event.title}"[:240],
            created_at=now_iso(),
        )
    )


def finalize_event(session: Session, event: GameEvent) -> list[EventWinner]:
    """يحوّل أعلى النتائج إلى فائزين معلّقين، مرة واحدة فقط."""

    if event.finalized:
        return list(
            session.scalars(
                select(EventWinner)
                .where(EventWinner.event_id == event.id)
                .order_by(EventWinner.rank)
            ).all()
        )

    prizes = {prize.rank: prize for prize in event_prizes(session, event.id)}
    ranked = list(
        session.scalars(
            select(EventParticipation)
            .where(
                EventParticipation.event_id == event.id,
                EventParticipation.status == "finished",
            )
            .order_by(
                EventParticipation.score.desc(),
                EventParticipation.finished_at.asc(),
            )
        ).all()
    )

    created: list[EventWinner] = []
    for rank, part in enumerate(ranked[: max(1, event.winners_count)], start=1):
        prize = prizes.get(rank)
        if prize is None:
            continue
        existing = session.scalar(
            select(EventWinner).where(
                EventWinner.event_id == event.id, EventWinner.rank == rank
            )
        )
        if existing is not None:
            created.append(existing)
            continue
        winner = EventWinner(
            event_id=event.id,
            participation_id=part.id,
            user_id=part.user_id,
            rank=rank,
            prize_id=prize.id,
            prize_kind=prize.kind,
            prize_amount=prize.amount,
            prize_label=prize.label,
            status="pending",
            created_at=now_iso(),
        )
        session.add(winner)
        session.flush()
        created.append(winner)
        label = prize.label or PRIZE_KINDS.get(prize.kind, prize.kind)
        notify_user(
            session,
            part.user_id,
            "فزت بجائزة!",
            f"حصلت على المركز {rank} في {event.title} — {label}",
            "reward",
        )

    event.finalized = True
    event.status = "ended"
    event.updated_at = now_iso()
    session.flush()
    return created


def send_winner_prize(session: Session, winner: EventWinner) -> EventWinner:
    """يصرف الجائزة مرة واحدة؛ المرجع الفريد في السجل يمنع الصرف المزدوج."""

    if winner.status == "sent":
        return winner
    if winner.status == "cancelled":
        raise HTTPException(status_code=409, detail="تم إلغاء هذه الجائزة")

    profile = session.execute(
        select(Profile).where(Profile.id == winner.user_id).with_for_update()
    ).scalar_one_or_none()
    if profile is None:
        raise HTTPException(status_code=404, detail="حساب الفائز غير موجود")

    ref = f"prize:{winner.id}"
    already = session.scalar(select(EventLedger).where(EventLedger.ref == ref))
    if already is None:
        currency = (
            winner.prize_kind
            if winner.prize_kind in {"gold", "coins", "diamonds"}
            else "gift"
        )
        if currency in {"gold", "coins", "diamonds"} and winner.prize_amount > 0:
            setattr(
                profile,
                currency,
                int(getattr(profile, currency) or 0) + winner.prize_amount,
            )
            session.flush()
            balance = int(getattr(profile, currency) or 0)
        else:
            balance = int(profile.gold or 0)
        session.add(
            EventLedger(
                user_id=winner.user_id,
                event_id=winner.event_id,
                kind="prize",
                currency=currency,
                amount=winner.prize_amount,
                balance_after=balance,
                ref=ref,
                detail=(winner.prize_label or PRIZE_KINDS.get(winner.prize_kind, ""))[:240],
                created_at=now_iso(),
            )
        )

    winner.status = "sent"
    winner.sent_at = now_iso()
    winner.payout_ref = ref
    if winner.approved_at is None:
        winner.approved_at = winner.sent_at
    notify_user(
        session,
        winner.user_id,
        "تم إرسال جائزتك",
        f"{winner.prize_label or PRIZE_KINDS.get(winner.prize_kind, 'جائزة')} — أُضيفت إلى حسابك",
        "reward",
    )
    session.flush()
    return winner


def global_leaderboard(session: Session, period: str = "all") -> list[dict]:
    now = datetime.now(timezone.utc)
    if period == "daily":
        start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    elif period == "weekly":
        start = (now - timedelta(days=now.weekday())).replace(
            hour=0, minute=0, second=0, microsecond=0
        )
    else:
        start = None

    rows = list(
        session.scalars(
            select(EventParticipation).where(EventParticipation.status == "finished")
        ).all()
    )
    totals: dict[int, dict] = {}
    for row in rows:
        created = parse_dt(row.created_at)
        if start is not None and (created is None or created < start):
            continue
        bucket = totals.setdefault(
            row.user_id, {"user_id": row.user_id, "score": 0, "plays": 0}
        )
        bucket["score"] += row.score
        bucket["plays"] += 1

    names = {
        profile.id: profile.name
        for profile in session.scalars(select(Profile)).all()
    }
    ranked = sorted(
        totals.values(), key=lambda item: (-item["score"], -item["plays"])
    )
    return [
        {
            "rank": index,
            "user_id": item["user_id"],
            "name": names.get(item["user_id"], "لاعب"),
            "score": item["score"],
            "plays": item["plays"],
        }
        for index, item in enumerate(ranked[:20], start=1)
    ]


def user_history(session: Session, user_id: int = USER_ID) -> dict:
    participations = list(
        session.scalars(
            select(EventParticipation)
            .where(EventParticipation.user_id == user_id)
            .order_by(EventParticipation.id.desc())
        ).all()
    )
    events = {
        event.id: event
        for event in session.scalars(
            select(GameEvent).where(
                GameEvent.id.in_([part.event_id for part in participations] or [0])
            )
        ).all()
    }
    rows = []
    for part in participations:
        event = events.get(part.event_id)
        rows.append(
            {
                **participation_dict(part),
                "event_title": event.title if event else "فعالية محذوفة",
                "event_kind": event.kind if event else "",
                "event_media": event.media_url if event else "",
                "event_phase": event_phase(event.status, event.starts_at, event.ends_at)
                if event
                else "ended",
            }
        )

    winners = session.execute(
        select(EventWinner, GameEvent)
        .join(GameEvent, GameEvent.id == EventWinner.event_id, isouter=True)
        .where(EventWinner.user_id == user_id)
        .order_by(EventWinner.id.desc())
    ).all()
    winner_rows = [
        {
            **winner_dict(winner, profile_name(session, user_id)),
            "event_title": event.title if event else "فعالية محذوفة",
        }
        for winner, event in winners
    ]

    ledger = list(
        session.scalars(
            select(EventLedger)
            .where(EventLedger.user_id == user_id)
            .order_by(EventLedger.id.desc())
            .limit(100)
        ).all()
    )
    profile = session.get(Profile, user_id)
    return {
        "participations": rows,
        "winners": winner_rows,
        "ledger": [ledger_dict(item) for item in ledger],
        "gold": int(profile.gold or 0) if profile else 0,
        "coins": int(profile.coins or 0) if profile else 0,
        "diamonds": int(profile.diamonds or 0) if profile else 0,
    }
