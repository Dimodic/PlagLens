"""Fire-and-forget background tasks that actually survive to completion.

``asyncio.create_task`` returns a task the event loop only holds a *weak*
reference to. If the caller doesn't keep a strong reference, the task can be
garbage-collected mid-execution — for our 2-3 minute contest/Stepik imports
that means the import silently truncates ("не все посылки выгрузились").

``spawn_tracked`` parks the task in a module-level set for its lifetime and
clears it on completion, so the import always runs to the end. It also logs
any unhandled exception (a bare create_task swallows it into the void).
"""
from __future__ import annotations

import asyncio
from typing import Any, Coroutine

import structlog

logger = structlog.get_logger(__name__)

# Strong references to in-flight background tasks. Membership keeps each task
# alive; the done-callback removes it so the set never grows unbounded.
_BG_TASKS: set[asyncio.Task[Any]] = set()


def spawn_tracked(
    coro: Coroutine[Any, Any, Any], *, name: str | None = None
) -> asyncio.Task[Any]:
    """Schedule ``coro`` as a background task that can't be GC'd mid-run."""
    if name is None:
        name = getattr(coro, "__qualname__", None) or getattr(coro, "__name__", None)
    task = asyncio.create_task(coro, name=name)
    _BG_TASKS.add(task)

    def _done(t: asyncio.Task[Any]) -> None:
        _BG_TASKS.discard(t)
        if t.cancelled():
            return
        exc = t.exception()
        if exc is not None:
            logger.error(
                "integration.background_task_failed",
                task=name or t.get_name(),
                error=str(exc),
                exc_info=exc,
            )

    task.add_done_callback(_done)
    return task


def active_task_count() -> int:
    """Number of tracked background tasks still running (diagnostics)."""
    return len(_BG_TASKS)
