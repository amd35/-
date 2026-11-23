"""لوحة إدارة النشاطات والفعاليات: إنشاء، ألعاب، بانرات، نتائج، اعتماد وصرف الجوائز."""

from __future__ import annotations

import mimetypes
import os
from pathlib import Path
from uuid import uuid4

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from pydantic import BaseModel, Field
from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from .db import engine
from .events_common import (
    admin_event_dict,
    banner_dict,
    event_prizes,
    event_winners,
    finalize_event,
    parse_dt,
    parse_json,
    prize_dict,
    require_admin,
    send_winner_prize,
)
from .events_engine import (
    EVENT_KINDS,
    EVENT_STATUSES,
    MEDIA_TYPES,
    PRIZE_KINDS,
    iso,
)
from .events_models import (
    EventBanner,
    EventGame,
    EventParticipation,
    EventPrize,
    EventWinner,
    GameEvent,
)
from .events_ws import hub
from .models import Profile, now_iso

router = APIRouter(
    prefix="/api/admin", tags=["events-admin"], dependencies=[Depends(require_admin)]
)

UPLOAD_DIR = Path(
    os.environ.get("UPLOAD_DIR")
    or (Path(__file__).resolve().parent.parent / "uploads")
)
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
MAX_UPLOAD = 30 * 1024 * 1024
ALLOWED_EXT = {
    ".jpg",
    ".jpeg",
    ".png",
    ".webp",
    ".gif",
    ".mp4",
    ".webm",
    ".mov",
}
LINK_TYPES = {"event", "store", "gifts", "frames", "rooms", "activity", "leaderboard", "url"}


class PrizePayload(BaseModel):
    rank: int = Field(ge=1, le=50)
    kind: str = Field(default="gold", max_length=20)
    amount: int = Field(default=0, ge=0, le=10_000_000)
    label: str = Field(default="", max_length=120)


class EventPayload(BaseModel):
    title: str = Field(min_length=2, max_length=140)
    kind: str = Field(default="daily", max_length=30)
    game_key: str = Field(min_length=2, max_length=40)
    description: str = Field(default="", max_length=4000)
    media_url: str = Field(default="", max_length=500)
    media_type: str = Field(default="image", max_length=10)
    rules: str = Field(default="", max_length=4000)
    conditions: str = Field(default="", max_length=4000)
    starts_at: str = Field(min_length=10, max_length=40)
    ends_at: str = Field(min_length=10, max_length=40)
    entry_fee_gold: int = Field(default=0, ge=0, le=1_000_000)
    winners_count: int = Field(default=3, ge=1, le=50)
    status: str = Field(default="draft", max_length=20)
    published: bool = False
    prizes: list[PrizePayload] | None = None


class StatusPayload(BaseModel):
    status: str = Field(max_length=20)
    published: bool | None = None


class BannerPayload(BaseModel):
    title: str = Field(min_length=2, max_length=120)
    subtitle: str = Field(default="", max_length=200)
    media_url: str = Field(default="", max_length=500)
    media_type: str = Field(default="image", max_length=10)
    link_type: str = Field(default="event", max_length=20)
    link_ref: str | None = Field(default=None, max_length=80)
    starts_at: str = Field(min_length=10, max_length=40)
    ends_at: str | None = Field(default=None, max_length=40)
    active: bool = True
    sort_order: int = Field(default=0, ge=0, le=999)


class GamePayload(BaseModel):
    enabled: bool | None = None
    rules: str | None = Field(default=None, max_length=4000)
    duration_seconds: int | None = Field(default=None, ge=5, le=3600)
    name: str | None = Field(default=None, max_length=80)
    description: str | None = Field(default=None, max_length=240)


def _validate_event(session: Session, payload: EventPayload) -> None:
    if payload.kind not in EVENT_KINDS:
        raise HTTPException(status_code=422, detail="نوع الفعالية غير معروف")
    if payload.status not in EVENT_STATUSES:
        raise HTTPException(status_code=422, detail="حالة الفعالية غير معروفة")
    if payload.media_type not in MEDIA_TYPES:
        raise HTTPException(status_code=422, detail="نوع الوسائط يجب أن يكون image أو video")
    game = session.scalar(
        select(EventGame).where(EventGame.key == payload.game_key)
    )
    if game is None:
        raise HTTPException(status_code=422, detail="اللعبة غير موجودة في الكتالوج")
    start = parse_dt(payload.starts_at)
    end = parse_dt(payload.ends_at)
    if start is None or end is None:
        raise HTTPException(status_code=422, detail="تاريخ البداية أو النهاية غير صالح")
    if end <= start:
        raise HTTPException(status_code=422, detail="يجب أن تكون النهاية بعد البداية")
    if payload.prizes:
        ranks = [prize.rank for prize in payload.prizes]
        if len(ranks) != len(set(ranks)):
            raise HTTPException(status_code=422, detail="تكرار في ترتيب الجوائز")
        for prize in payload.prizes:
            if prize.kind not in PRIZE_KINDS:
                raise HTTPException(status_code=422, detail="نوع الجائزة غير معروف")


def _replace_prizes(session: Session, event: GameEvent, prizes: list[PrizePayload]) -> None:
    session.execute(delete(EventPrize).where(EventPrize.event_id == event.id))
    for prize in sorted(prizes, key=lambda item: item.rank):
        session.add(
            EventPrize(
                event_id=event.id,
                rank=prize.rank,
                kind=prize.kind,
                amount=prize.amount,
                label=prize.label,
                created_at=now_iso(),
            )
        )


def _apply_event(
    session: Session, event: GameEvent, payload: EventPayload, creating: bool
) -> None:
    _validate_event(session, payload)
    if not creating:
        participation_count = session.scalar(
            select(func.count())
            .select_from(EventParticipation)
            .where(EventParticipation.event_id == event.id)
        )
        if participation_count and event.game_key != payload.game_key:
            raise HTTPException(
                status_code=409,
                detail="لا يمكن تغيير اللعبة بعد بدء المشاركات",
            )
    event.title = payload.title
    event.kind = payload.kind
    event.game_key = payload.game_key
    event.description = payload.description
    event.media_url = payload.media_url
    event.media_type = payload.media_type
    event.rules = payload.rules
    event.conditions = payload.conditions
    event.starts_at = iso(parse_dt(payload.starts_at))
    event.ends_at = iso(parse_dt(payload.ends_at))
    event.entry_fee_gold = payload.entry_fee_gold
    event.winners_count = payload.winners_count
    event.status = payload.status
    event.published = payload.published
    event.updated_at = now_iso()
    if not creating and payload.prizes is not None:
        _replace_prizes(session, event, payload.prizes or [])


@router.get("/events")
def admin_events() -> list[dict]:
    with Session(engine) as session:
        rows = session.scalars(
            select(GameEvent).order_by(GameEvent.id.desc())
        ).all()
        return [admin_event_dict(session, row) for row in rows]


@router.post("/events", status_code=201)
async def create_event(payload: EventPayload) -> dict:
    with Session(engine) as session:
        event = GameEvent(created_at=now_iso(), updated_at=now_iso())
        _apply_event(session, event, payload, creating=True)
        session.add(event)
        session.flush()
        _replace_prizes(session, event, payload.prizes or [])
        session.commit()
        session.refresh(event)
        data = admin_event_dict(session, event)
    await hub.broadcast({"type": "event_update", "event_id": data["id"], "reason": "created"})
    return data


@router.put("/events/{event_id}")
async def update_event(event_id: int, payload: EventPayload) -> dict:
    with Session(engine) as session:
        event = session.get(GameEvent, event_id)
        if event is None:
            raise HTTPException(status_code=404, detail="الفعالية غير موجودة")
        _apply_event(session, event, payload, creating=False)
        session.commit()
        session.refresh(event)
        data = admin_event_dict(session, event)
    await hub.broadcast({"type": "event_update", "event_id": event_id, "reason": "updated"})
    return data


@router.post("/events/{event_id}/status")
async def set_event_status(event_id: int, payload: StatusPayload) -> dict:
    if payload.status not in EVENT_STATUSES:
        raise HTTPException(status_code=422, detail="حالة الفعالية غير معروفة")
    with Session(engine) as session:
        event = session.get(GameEvent, event_id)
        if event is None:
            raise HTTPException(status_code=404, detail="الفعالية غير موجودة")
        event.status = payload.status
        if payload.published is not None:
            event.published = payload.published
        event.updated_at = now_iso()
        session.commit()
        session.refresh(event)
        data = admin_event_dict(session, event)
    await hub.broadcast({"type": "event_update", "event_id": event_id, "reason": "status"})
    return data


@router.delete("/events/{event_id}", status_code=204)
async def delete_event(event_id: int):
    with Session(engine) as session:
        event = session.get(GameEvent, event_id)
        if event is None:
            raise HTTPException(status_code=404, detail="الفعالية غير موجودة")
        session.delete(event)
        session.commit()
    await hub.broadcast({"type": "event_update", "event_id": event_id, "reason": "deleted"})


@router.post("/events/{event_id}/finalize")
async def finalize(event_id: int) -> dict:
    with Session(engine) as session:
        event = session.get(GameEvent, event_id)
        if event is None:
            raise HTTPException(status_code=404, detail="الفعالية غير موجودة")
        winners = finalize_event(session, event)
        session.commit()
        data = {
            "event": admin_event_dict(session, event),
            "winners": event_winners(session, event.id),
            "created": len(winners),
        }
    await hub.broadcast({"type": "event_update", "event_id": event_id, "reason": "finalized"})
    return data


@router.get("/events/{event_id}/participants")
def participants(event_id: int) -> dict:
    with Session(engine) as session:
        event = session.get(GameEvent, event_id)
        if event is None:
            raise HTTPException(status_code=404, detail="الفعالية غير موجودة")
        rows = session.execute(
            select(EventParticipation, Profile)
            .join(Profile, Profile.id == EventParticipation.user_id, isouter=True)
            .where(EventParticipation.event_id == event_id)
            .order_by(
                EventParticipation.score.desc(), EventParticipation.id
            )
        ).all()
        teams: dict[str, int] = {}
        items = []
        for index, (part, profile) in enumerate(rows, start=1):
            if part.team:
                teams[part.team] = teams.get(part.team, 0) + part.score
            items.append(
                {
                    "rank": index,
                    "id": part.id,
                    "user_id": part.user_id,
                    "name": profile.name if profile else "لاعب",
                    "score": part.score,
                    "status": part.status,
                    "team": part.team,
                    "detail": parse_json(part.detail_json),
                    "created_at": part.created_at,
                    "finished_at": part.finished_at,
                }
            )
        return {"event": admin_event_dict(session, event), "participants": items, "teams": teams}


@router.post("/events/{event_id}/winners/{winner_id}/approve")
async def approve_winner(event_id: int, winner_id: int) -> dict:
    with Session(engine) as session:
        winner = session.get(EventWinner, winner_id)
        if winner is None or winner.event_id != event_id:
            raise HTTPException(status_code=404, detail="الفائز غير موجود")
        if winner.status == "cancelled":
            raise HTTPException(status_code=409, detail="الجائزة ملغاة")
        if winner.status == "pending":
            winner.status = "approved"
            winner.approved_at = now_iso()
            session.commit()
            session.refresh(winner)
        data = {
            "id": winner.id,
            "status": winner.status,
            "approved_at": winner.approved_at,
        }
    await hub.broadcast({"type": "event_update", "event_id": event_id, "reason": "approved"})
    return data


@router.post("/events/{event_id}/winners/{winner_id}/send")
async def send_winner(event_id: int, winner_id: int) -> dict:
    with Session(engine) as session:
        winner = session.get(EventWinner, winner_id)
        if winner is None or winner.event_id != event_id:
            raise HTTPException(status_code=404, detail="الفائز غير موجود")
        send_winner_prize(session, winner)
        session.commit()
        session.refresh(winner)
        profile = session.get(Profile, winner.user_id)
        data = {
            "id": winner.id,
            "status": winner.status,
            "sent_at": winner.sent_at,
            "payout_ref": winner.payout_ref,
            "gold": int(profile.gold or 0) if profile else 0,
        }
    await hub.broadcast({"type": "event_update", "event_id": event_id, "reason": "sent"})
    return data


@router.post("/events/{event_id}/winners/{winner_id}/cancel")
async def cancel_winner(event_id: int, winner_id: int) -> dict:
    with Session(engine) as session:
        winner = session.get(EventWinner, winner_id)
        if winner is None or winner.event_id != event_id:
            raise HTTPException(status_code=404, detail="الفائز غير موجود")
        if winner.status == "sent":
            raise HTTPException(status_code=409, detail="لا يمكن إلغاء جائزة صُرفت")
        winner.status = "cancelled"
        session.commit()
        session.refresh(winner)
        data = {"id": winner.id, "status": winner.status}
    await hub.broadcast({"type": "event_update", "event_id": event_id, "reason": "cancelled"})
    return data


@router.get("/games")
def admin_games() -> list[dict]:
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


@router.patch("/games/{game_key}")
async def update_game(game_key: str, payload: GamePayload) -> dict:
    with Session(engine) as session:
        game = session.scalar(select(EventGame).where(EventGame.key == game_key))
        if game is None:
            raise HTTPException(status_code=404, detail="اللعبة غير موجودة")
        for field in ("enabled", "rules", "duration_seconds", "name", "description"):
            value = getattr(payload, field)
            if value is not None:
                setattr(game, field, value)
        session.commit()
        session.refresh(game)
        data = {
            "key": game.key,
            "name": game.name,
            "description": game.description,
            "rules": game.rules,
            "duration_seconds": game.duration_seconds,
            "enabled": game.enabled,
            "sort_order": game.sort_order,
        }
    await hub.broadcast({"type": "games_update"})
    return data


@router.get("/banners")
def admin_banners() -> list[dict]:
    with Session(engine) as session:
        rows = session.scalars(
            select(EventBanner).order_by(EventBanner.sort_order, EventBanner.id)
        ).all()
        return [banner_dict(row) for row in rows]


def _validate_banner(session: Session, payload: BannerPayload) -> None:
    if payload.link_type not in LINK_TYPES:
        raise HTTPException(status_code=422, detail="نوع الرابط غير معروف")
    if payload.media_type not in MEDIA_TYPES:
        raise HTTPException(status_code=422, detail="نوع الوسائط غير صالح")
    start = parse_dt(payload.starts_at)
    if start is None:
        raise HTTPException(status_code=422, detail="تاريخ بداية البانر غير صالح")
    if payload.ends_at:
        end = parse_dt(payload.ends_at)
        if end is None or end <= start:
            raise HTTPException(status_code=422, detail="تاريخ نهاية البانر غير صالح")
    if payload.link_type == "event" and payload.link_ref:
        try:
            event_id = int(payload.link_ref)
        except ValueError as error:
            raise HTTPException(status_code=422, detail="مرجع الفعالية غير صالح") from error
        if session.get(GameEvent, event_id) is None:
            raise HTTPException(status_code=422, detail="الفعالية المرتبطة غير موجودة")
    if payload.link_type == "url" and not (
        (payload.link_ref or "").startswith("http://")
        or (payload.link_ref or "").startswith("https://")
    ):
        raise HTTPException(status_code=422, detail="رابط البانر يجب أن يبدأ بـ http")


def _apply_banner(banner: EventBanner, payload: BannerPayload) -> None:
    banner.title = payload.title
    banner.subtitle = payload.subtitle
    banner.media_url = payload.media_url
    banner.media_type = payload.media_type
    banner.link_type = payload.link_type
    banner.link_ref = payload.link_ref
    banner.starts_at = iso(parse_dt(payload.starts_at))
    banner.ends_at = iso(parse_dt(payload.ends_at)) if payload.ends_at else None
    banner.active = payload.active
    banner.sort_order = payload.sort_order


@router.post("/banners", status_code=201)
async def create_banner(payload: BannerPayload) -> dict:
    with Session(engine) as session:
        _validate_banner(session, payload)
        banner = EventBanner(created_at=now_iso())
        _apply_banner(banner, payload)
        session.add(banner)
        session.commit()
        session.refresh(banner)
        data = banner_dict(banner)
    await hub.broadcast({"type": "banner_update"})
    return data


@router.patch("/banners/{banner_id}")
async def update_banner(banner_id: int, payload: BannerPayload) -> dict:
    with Session(engine) as session:
        banner = session.get(EventBanner, banner_id)
        if banner is None:
            raise HTTPException(status_code=404, detail="البانر غير موجود")
        _validate_banner(session, payload)
        _apply_banner(banner, payload)
        session.commit()
        session.refresh(banner)
        data = banner_dict(banner)
    await hub.broadcast({"type": "banner_update"})
    return data


@router.delete("/banners/{banner_id}", status_code=204)
async def delete_banner(banner_id: int):
    with Session(engine) as session:
        banner = session.get(EventBanner, banner_id)
        if banner is None:
            raise HTTPException(status_code=404, detail="البانر غير موجود")
        session.delete(banner)
        session.commit()
    await hub.broadcast({"type": "banner_update"})


@router.post("/events/{event_id}/banner", status_code=201)
async def publish_event_banner(event_id: int) -> dict:
    """ينشر إعلان الفعالية في الرئيسية مباشرة (بانر مرتبط بالفعالية)."""

    with Session(engine) as session:
        event = session.get(GameEvent, event_id)
        if event is None:
            raise HTTPException(status_code=404, detail="الفعالية غير موجودة")
        existing = session.scalar(
            select(EventBanner).where(
                EventBanner.link_type == "event",
                EventBanner.link_ref == str(event.id),
                EventBanner.active.is_(True),
            )
        )
        if existing is not None:
            return banner_dict(existing)
        banner = EventBanner(
            title=event.title,
            subtitle=f"{EVENT_KINDS.get(event.kind, 'فعالية')} — جوائز ذهبية تنتظرك",
            media_url=event.media_url,
            media_type=event.media_type,
            link_type="event",
            link_ref=str(event.id),
            starts_at=event.starts_at,
            ends_at=event.ends_at,
            active=True,
            sort_order=0,
            created_at=now_iso(),
        )
        session.add(banner)
        session.commit()
        session.refresh(banner)
        data = banner_dict(banner)
    await hub.broadcast({"type": "banner_update"})
    return data


@router.post("/uploads", status_code=201)
async def upload_media(file: UploadFile = File(...)) -> dict:
    content_type = (file.content_type or "").lower()
    if not (content_type.startswith("image/") or content_type.startswith("video/")):
        raise HTTPException(status_code=415, detail="يُسمح بالصور والفيديو فقط")
    extension = Path(file.filename or "").suffix.lower()
    if extension not in ALLOWED_EXT:
        guessed = mimetypes.guess_extension(content_type.split(";")[0].strip()) or ""
        extension = guessed if guessed in ALLOWED_EXT else ""
    if not extension:
        raise HTTPException(status_code=415, detail="امتداد الملف غير مدعوم")

    name = f"{uuid4().hex}{extension}"
    destination = UPLOAD_DIR / name
    size = 0
    try:
        with destination.open("wb") as output:
            while chunk := await file.read(1024 * 1024):
                size += len(chunk)
                if size > MAX_UPLOAD:
                    raise HTTPException(
                        status_code=413, detail="حجم الملف يتجاوز 30 ميجابايت"
                    )
                output.write(chunk)
    except HTTPException:
        destination.unlink(missing_ok=True)
        raise
    finally:
        await file.close()

    return {
        "url": f"/api/uploads/{name}",
        "media_type": "video" if content_type.startswith("video/") else "image",
        "size": size,
    }
