"""تحديثات الفعاليات اللحظية عبر WebSocket، ومهمة خلفية للإشعارات والاعتماد التلقائي."""

from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from sqlalchemy import select
from sqlalchemy.orm import Session

from .db import engine
from .events_common import finalize_event, notify_all
from .events_engine import parse_dt
from .events_models import GameEvent

logger = logging.getLogger("events")
router = APIRouter()


class EventsHub:
    """يوزّع تحديثات الفعاليات على كل الواجهات المتصلة."""

    def __init__(self) -> None:
        self._clients: set[WebSocket] = set()

    async def connect(self, websocket: WebSocket) -> None:
        await websocket.accept()
        self._clients.add(websocket)
        await websocket.send_json({"type": "hello", "channel": "events"})

    def disconnect(self, websocket: WebSocket) -> None:
        self._clients.discard(websocket)

    async def broadcast(self, message: dict) -> None:
        for websocket in list(self._clients):
            try:
                await websocket.send_json(message)
            except Exception:
                self._clients.discard(websocket)


hub = EventsHub()


@router.websocket("/api/ws/events")
async def events_socket(websocket: WebSocket) -> None:
    await hub.connect(websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        pass
    finally:
        hub.disconnect(websocket)


def _tick() -> list[int]:
    """يفحص الفعاليات: بدء، اقتراب النهاية، ثم اعتماد النتائج عند الانتهاء."""

    changed: list[int] = []
    now = datetime.now(timezone.utc)
    with Session(engine) as session:
        events = list(
            session.scalars(
                select(GameEvent).where(GameEvent.status.in_(["active", "paused"]))
            ).all()
        )
        for event in events:
            start = parse_dt(event.starts_at)
            end = parse_dt(event.ends_at)

            if (
                event.status == "active"
                and start is not None
                and now >= start
                and not event.start_notified
            ):
                notify_all(
                    session,
                    "بدأت الفعالية الآن",
                    f"{event.title} — شارك قبل انتهاء الوقت",
                    "event",
                )
                event.start_notified = True
                changed.append(event.id)

            if (
                event.status == "active"
                and end is not None
                and timedelta(0) <= end - now <= timedelta(minutes=30)
                and not event.ending_notified
            ):
                notify_all(
                    session,
                    "باقي أقل من 30 دقيقة",
                    f"{event.title} تقترب من النهاية — لا تفوّت فرصتك",
                    "alert",
                )
                event.ending_notified = True
                changed.append(event.id)

            if event.status == "active" and end is not None and now >= end:
                finalize_event(session, event)
                changed.append(event.id)

        session.commit()
    return changed


async def events_worker() -> None:
    """مهمة خلفية تعمل كل 20 ثانية طوال عمر التطبيق."""

    while True:
        try:
            changed = await asyncio.to_thread(_tick)
            for event_id in changed:
                await hub.broadcast({"type": "event_update", "event_id": event_id})
        except asyncio.CancelledError:
            raise
        except Exception:  # pragma: no cover - يُسجّل ولا يوقف الخدمة
            logger.exception("فشل تحديث الفعاليات الدوري")
        await asyncio.sleep(20)
