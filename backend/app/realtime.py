"""إشارات المكالمة الصوتية الحقيقية (WebRTC) وحضور أعضاء الغرفة عبر WebSocket."""

from fastapi import WebSocket


class RoomHub:
    """يحتفظ بحضور كل غرفة في الذاكرة ويوزّع رسائل الإشارة بين أعضائها."""

    def __init__(self) -> None:
        self._rooms: dict[int, dict[str, dict]] = {}

    def peers(self, room_id: int) -> list[dict]:
        return [
            {
                "client_id": client_id,
                "name": peer["name"],
                "mic": peer["mic"],
                "hand": peer["hand"],
            }
            for client_id, peer in self._rooms.get(room_id, {}).items()
        ]

    async def broadcast(
        self, room_id: int, message: dict, exclude: str | None = None
    ) -> None:
        for client_id, peer in list(self._rooms.get(room_id, {}).items()):
            if client_id == exclude:
                continue
            try:
                await peer["ws"].send_json(message)
            except Exception:
                self._rooms.get(room_id, {}).pop(client_id, None)

    async def join(
        self, room_id: int, client_id: str, name: str, ws: WebSocket
    ) -> list[dict]:
        others = [p for p in self.peers(room_id) if p["client_id"] != client_id]
        self._rooms.setdefault(room_id, {})[client_id] = {
            "ws": ws,
            "name": name,
            "mic": False,
            "hand": False,
        }
        await self.broadcast(
            room_id,
            {"type": "presence", "peers": self.peers(room_id)},
            exclude=client_id,
        )
        return others

    async def leave(self, room_id: int, client_id: str) -> None:
        room = self._rooms.get(room_id)
        if not room:
            return
        room.pop(client_id, None)
        if not room:
            self._rooms.pop(room_id, None)
            return
        await self.broadcast(room_id, {"type": "presence", "peers": self.peers(room_id)})

    def set_state(self, room_id: int, client_id: str, **changes: object) -> None:
        peer = self._rooms.get(room_id, {}).get(client_id)
        if peer is None:
            return
        peer.update({key: value for key, value in changes.items() if value is not None})

    def name_of(self, room_id: int, client_id: str) -> str:
        peer = self._rooms.get(room_id, {}).get(client_id)
        return peer["name"] if peer else "مستخدم"

    async def send_to(self, room_id: int, target: str, message: dict) -> bool:
        peer = self._rooms.get(room_id, {}).get(target)
        if peer is None:
            return False
        try:
            await peer["ws"].send_json(message)
            return True
        except Exception:
            return False
