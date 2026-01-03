"""Tiny in-memory circuit breaker, per backend.

Closed → Open: if 5xx-rate over `cb_window_s` exceeds threshold (and
`cb_min_calls` was reached), open for `cb_open_for_s`.
Open → Half-open: after `cb_open_for_s`, allow one probe.
Half-open → Closed: a successful probe closes the breaker.
Half-open → Open: a failing probe re-opens it for the same duration.
"""

from __future__ import annotations

import asyncio
import time
from dataclasses import dataclass, field
from enum import Enum

from gateway_service.config import settings
from gateway_service.metrics import backend_unavailable_total


class CBState(str, Enum):
    CLOSED = "closed"
    OPEN = "open"
    HALF_OPEN = "half_open"


@dataclass
class _Stats:
    state: CBState = CBState.CLOSED
    opened_at: float = 0.0
    successes: int = 0
    failures: int = 0
    window_started_at: float = field(default_factory=time.time)


class CircuitBreaker:
    """Per-(backend) breaker. Process-local; in HA setup pin clients to gateways."""

    def __init__(self) -> None:
        self._stats: dict[str, _Stats] = {}
        self._lock = asyncio.Lock()

    def _get(self, backend: str) -> _Stats:
        s = self._stats.get(backend)
        if s is None:
            s = _Stats()
            self._stats[backend] = s
        return s

    async def allow(self, backend: str) -> bool:
        async with self._lock:
            s = self._get(backend)
            now = time.time()
            if s.state == CBState.OPEN:
                if now - s.opened_at >= settings.cb_open_for_s:
                    s.state = CBState.HALF_OPEN
                    return True
                return False
            return True

    async def record(self, backend: str, *, success: bool) -> None:
        async with self._lock:
            s = self._get(backend)
            now = time.time()
            # roll the window
            if now - s.window_started_at > settings.cb_window_s:
                s.successes = 0
                s.failures = 0
                s.window_started_at = now

            if success:
                s.successes += 1
                if s.state == CBState.HALF_OPEN:
                    s.state = CBState.CLOSED
                    s.failures = 0
                    s.opened_at = 0.0
                return

            s.failures += 1
            if s.state == CBState.HALF_OPEN:
                s.state = CBState.OPEN
                s.opened_at = now
                backend_unavailable_total.labels(backend=backend).inc()
                return

            total = s.successes + s.failures
            if total >= settings.cb_min_calls:
                rate = (s.failures / total) * 100.0
                if rate >= settings.cb_failure_threshold_pct:
                    s.state = CBState.OPEN
                    s.opened_at = now
                    backend_unavailable_total.labels(backend=backend).inc()

    def state_of(self, backend: str) -> CBState:
        return self._get(backend).state

    def reset(self, backend: str | None = None) -> None:
        if backend is None:
            self._stats.clear()
            return
        self._stats.pop(backend, None)


breaker = CircuitBreaker()

__all__ = ["CircuitBreaker", "CBState", "breaker"]
