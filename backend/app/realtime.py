"""Realtime hub: presence, room events and WebRTC signalling relay.

Connections live in one worker process (FastAPI). Sync request handlers run in
a threadpool, so pushes from them go through ``call_soon_threadsafe``.
"""
import asyncio
import logging
from typing import Any

from fastapi import WebSocket

log = logging.getLogger("app.realtime")


class Hub:
    def __init__(self) -> None:
        self.loop: asyncio.AbstractEventLoop | None = None
        self.user_sockets: dict[int, set[WebSocket]] = {}
        self.room_sockets: dict[int, dict[int, set[WebSocket]]] = {}

    def bind_loop(self, loop: asyncio.AbstractEventLoop) -> None:
        self.loop = loop

    # --- registration ---
    async def register(self, user_id: int, socket: WebSocket) -> None:
        self.user_sockets.setdefault(user_id, set()).add(socket)

    async def unregister(self, user_id: int, socket: WebSocket) -> None:
        sockets = self.user_sockets.get(user_id)
        if sockets:
            sockets.discard(socket)
            if not sockets:
                self.user_sockets.pop(user_id, None)
        for room_id, members in list(self.room_sockets.items()):
            member_sockets = members.get(user_id)
            if member_sockets:
                member_sockets.discard(socket)
                if not member_sockets:
                    members.pop(user_id, None)
            if not members:
                self.room_sockets.pop(room_id, None)

    def is_online(self, user_id: int) -> bool:
        return bool(self.user_sockets.get(user_id))

    async def join_room(self, room_id: int, user_id: int, socket: WebSocket) -> None:
        self.room_sockets.setdefault(room_id, {}).setdefault(user_id, set()).add(socket)

    async def leave_room(self, room_id: int, user_id: int, socket: WebSocket) -> None:
        members = self.room_sockets.get(room_id)
        if not members:
            return
        sockets = members.get(user_id)
        if sockets:
            sockets.discard(socket)
            if not sockets:
                members.pop(user_id, None)
        if not members:
            self.room_sockets.pop(room_id, None)

    # --- sending ---
    @staticmethod
    async def _send(socket: WebSocket, payload: dict[str, Any]) -> None:
        try:
            await socket.send_json(payload)
        except Exception:  # socket already closing
            pass

    async def push_user(self, user_id: int, payload: dict[str, Any]) -> None:
        for socket in list(self.user_sockets.get(user_id, ())):
            await self._send(socket, payload)

    async def push_room(self, room_id: int, payload: dict[str, Any], exclude_user: int | None = None) -> None:
        for member_id, sockets in list(self.room_sockets.get(room_id, {}).items()):
            if exclude_user is not None and member_id == exclude_user:
                continue
            for socket in list(sockets):
                await self._send(socket, payload)

    async def push_room_users(self, room_id: int, user_ids: list[int], payload: dict[str, Any]) -> None:
        members = self.room_sockets.get(room_id, {})
        for user_id in user_ids:
            for socket in list(members.get(user_id, ())):
                await self._send(socket, payload)

    # --- thread-safe pushes for sync handlers ---
    def notify_user(self, user_id: int, payload: dict[str, Any]) -> None:
        if not self.loop or not self.loop.is_running():
            return
        asyncio.run_coroutine_threadsafe(self.push_user(user_id, payload), self.loop)

    def notify_room(self, room_id: int, payload: dict[str, Any], exclude_user: int | None = None) -> None:
        if not self.loop or not self.loop.is_running():
            return
        asyncio.run_coroutine_threadsafe(self.push_room(room_id, payload, exclude_user), self.loop)

    def notify_users(self, user_ids: list[int], payload: dict[str, Any]) -> None:
        if not self.loop or not self.loop.is_running():
            return
        for user_id in user_ids:
            asyncio.run_coroutine_threadsafe(self.push_user(user_id, payload), self.loop)

    def room_user_ids(self, room_id: int) -> list[int]:
        return list(self.room_sockets.get(room_id, {}).keys())


hub = Hub()
