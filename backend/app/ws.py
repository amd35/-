"""WebSocket endpoint: presence, room events, chat and WebRTC signalling.

The socket carries realtime updates only; every mutation that touches money or
permissions is also available over REST and is re-checked on the server.
"""
import asyncio
import logging
from typing import Any, Optional

from fastapi import APIRouter, Query, WebSocket, WebSocketDisconnect
from sqlalchemy import select

from .db import SessionLocal
from .models import DirectMessage, RoomMember, RoomMessage, User, utcnow
from .notifications import create_notification
from .realtime import hub
from .room_service import membership, room_state
from .security import decode_token
from .serializers import message_public, user_public

log = logging.getLogger("app.ws")
router = APIRouter(tags=["realtime"])


def _room_snapshot(db, room_id: int) -> Optional[dict]:
    from .models import Room

    room = db.get(Room, room_id)
    if room is None:
        return None
    return room_state(db, room)


@router.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket, token: str = Query(default="")):
    user_id = decode_token(token)
    if user_id is None:
        await websocket.close(code=4401)
        return

    db = SessionLocal()
    user = db.get(User, user_id)
    if user is None or user.status in {"banned", "deleted"}:
        db.close()
        await websocket.close(code=4403)
        return

    await websocket.accept()
    hub.bind_loop(asyncio.get_running_loop())
    await hub.register(user.id, websocket)

    user.online = True
    user.last_seen_at = utcnow()
    db.commit()

    joined_room: Optional[int] = None
    try:
        await websocket.send_json(
            {"type": "ready", "user": user_public(user), "online": hub.is_online(user.id)}
        )
        while True:
            payload: dict[str, Any] = await websocket.receive_json()
            kind = payload.get("type")

            if kind == "ping":
                await websocket.send_json({"type": "pong"})

            elif kind == "join_room":
                room_id = int(payload.get("room_id", 0))
                if membership(db, room_id, user.id) is None:
                    await websocket.send_json({"type": "error", "message": "لست عضواً في هذه الغرفة"})
                    continue
                if joined_room and joined_room != room_id:
                    await hub.leave_room(joined_room, user.id, websocket)
                joined_room = room_id
                await hub.join_room(room_id, user.id, websocket)
                snapshot = _room_snapshot(db, room_id)
                if snapshot:
                    await websocket.send_json({"type": "room_state", "room": snapshot})
                await hub.push_room(
                    room_id,
                    {"type": "presence", "room_id": room_id, "user_id": user.id, "online": True},
                    exclude_user=user.id,
                )

            elif kind == "leave_room":
                room_id = int(payload.get("room_id", joined_room or 0))
                if room_id:
                    await hub.leave_room(room_id, user.id, websocket)
                    snapshot = _room_snapshot(db, room_id)
                    if snapshot:
                        await hub.push_room(room_id, {"type": "room_state", "room": snapshot})
                joined_room = None

            elif kind == "room_state":
                room_id = int(payload.get("room_id", 0))
                snapshot = _room_snapshot(db, room_id)
                if snapshot:
                    await websocket.send_json({"type": "room_state", "room": snapshot})

            elif kind == "chat":
                room_id = int(payload.get("room_id", 0))
                text = str(payload.get("text", "")).strip()[:1000]
                if not text or membership(db, room_id, user.id) is None:
                    continue
                message = RoomMessage(room_id=room_id, user_id=user.id, kind="chat", text=text)
                db.add(message)
                db.commit()
                db.refresh(message)
                await hub.push_room(
                    room_id,
                    {"type": "chat", "room_id": room_id, "message": message_public(message, user)},
                )

            elif kind == "hand":
                room_id = int(payload.get("room_id", 0))
                raised = bool(payload.get("value", True))
                member = membership(db, room_id, user.id)
                if member is None:
                    continue
                member.hand_raised = raised
                db.commit()
                snapshot = _room_snapshot(db, room_id)
                if snapshot:
                    await hub.push_room(room_id, {"type": "room_state", "room": snapshot})

            elif kind == "mic":
                room_id = int(payload.get("room_id", 0))
                member = membership(db, room_id, user.id)
                if member is None:
                    continue
                wanted = bool(payload.get("value", True))
                if wanted and (member.seat_index is None or member.muted_by_mod or (
                    member.role == "member" and not member.mic_granted
                )):
                    await websocket.send_json(
                        {"type": "error", "message": "لا يمكن تشغيل المايك بهذه الحالة"}
                    )
                    continue
                member.mic_on = wanted
                db.commit()
                snapshot = _room_snapshot(db, room_id)
                if snapshot:
                    await hub.push_room(room_id, {"type": "room_state", "room": snapshot})

            elif kind in {"webrtc_offer", "webrtc_answer", "webrtc_ice", "rtc_state", "typing"}:
                target = int(payload.get("to", 0))
                if target and target != user.id:
                    message = {**payload, "from": user.id}
                    await hub.push_user(target, message)

            elif kind == "dm":
                target = int(payload.get("to", 0))
                text = str(payload.get("text", "")).strip()[:2000]
                recipient = db.get(User, target) if target else None
                if recipient is None or not text:
                    continue
                direct = DirectMessage(sender_id=user.id, recipient_id=target, text=text)
                db.add(direct)
                db.commit()
                db.refresh(direct)
                await hub.push_user(
                    target, {"type": "dm", "message": {**message_public(direct), "sender": user_public(user)}}
                )
                await websocket.send_json({"type": "dm_sent", "message": message_public(direct)})
                create_notification(
                    db,
                    target,
                    "message",
                    "رسالة جديدة",
                    f"{user.display_name or user.username}: {text[:80]}",
                    {"from": user.id},
                )
                db.commit()

            else:
                await websocket.send_json({"type": "error", "message": f"نوع غير معروف: {kind}"})

    except WebSocketDisconnect:
        pass
    except Exception as exc:  # pragma: no cover - defensive
        log.warning("socket error for user %s: %s", user_id, exc)
    finally:
        await hub.unregister(user.id, websocket)
        if joined_room:
            snapshot = _room_snapshot(db, joined_room)
            if snapshot:
                await hub.push_room(joined_room, {"type": "room_state", "room": snapshot})
        remaining = bool(hub.user_sockets.get(user.id))
        if not remaining:
            fresh = db.get(User, user_id)
            if fresh is not None:
                fresh.online = False
                fresh.last_seen_at = utcnow()
                db.commit()
        db.close()
