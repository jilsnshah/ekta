"""WebSocket fan-out hub.

Assignments, trip events and new alerts are written to the database and then
broadcast to every connected dashboard, so a second operator sees a change the
moment it is made.
"""
from __future__ import annotations

import asyncio
import json
from datetime import datetime
from typing import Any, Dict, List, Set

from fastapi import WebSocket


def _default(obj: Any):
    if isinstance(obj, datetime):
        return obj.isoformat()
    raise TypeError(f"Not JSON serialisable: {type(obj)}")


class Hub:
    def __init__(self) -> None:
        self._clients: Set[WebSocket] = set()
        self._lock = asyncio.Lock()

    async def connect(self, ws: WebSocket) -> None:
        await ws.accept()
        async with self._lock:
            self._clients.add(ws)

    async def disconnect(self, ws: WebSocket) -> None:
        async with self._lock:
            self._clients.discard(ws)

    @property
    def client_count(self) -> int:
        return len(self._clients)

    async def broadcast(self, event: str, payload: Dict[str, Any]) -> None:
        if not self._clients:
            return
        message = json.dumps({"event": event, "payload": payload}, default=_default)
        async with self._lock:
            targets: List[WebSocket] = list(self._clients)
        dead: List[WebSocket] = []
        for ws in targets:
            try:
                await ws.send_text(message)
            except Exception:
                dead.append(ws)
        if dead:
            async with self._lock:
                for ws in dead:
                    self._clients.discard(ws)


hub = Hub()
