"""APScheduler-driven autosync.

Pulls participants (and counts submissions) from every active integration on
a fixed cadence. Each tick is fenced by a Redis lock so that running multiple
replicas of integration-service won't double-sync.

Wiring
------
* `start_scheduler(app)` is called from `main.py:lifespan` when
  `settings.enable_scheduler` is true.
* The scheduler keeps a single recurring job (`_run_tick`) at
  `settings.scheduler_interval_seconds` (default 300s).
* Inside `_run_tick` we acquire `lock:autosync:tick` in Redis (`SET NX EX`).
  If the lock is held we skip the tick — another replica is doing it.
* For each active `yandex_contest` config we fetch homeworks of the bound
  course (cross-schema HTTP to course-service with our s2s bearer), extract
  contest IDs, and fan out to `import-participants` / `import-submissions`
  through the same adapter the API endpoint uses.
* Every run materialises an `ImportJob` row so the UI can display history.

The pulled bearer is the cached admin service token (see
`service_token.py`), which has full cross-tenant rights.
"""
from __future__ import annotations

import re
import time
from datetime import UTC, datetime
from typing import Any, Optional

import httpx
import structlog
from apscheduler.schedulers.asyncio import AsyncIOScheduler

from integration_service.common.db import get_sessionmaker
from integration_service.common.ids import new_job_id
from integration_service.common.redis_client import get_redis
from integration_service.config import get_settings
from integration_service.models.entities import ImportJob, IntegrationConfig

logger = structlog.get_logger(__name__)

LOCK_KEY = "lock:autosync:tick"
CONTEST_ID_RE = re.compile(r"contest_id\s*=\s*(\d+)", re.I)

_scheduler: Optional[AsyncIOScheduler] = None


async def _list_active_yc_configs() -> list[IntegrationConfig]:
    """Cross-tenant select — the scheduler runs as admin and must see
    integrations across every tenant. The repo's `list_` is tenant-bound, so
    we issue a direct select here."""
    from sqlalchemy import select

    factory = get_sessionmaker()
    async with factory() as s:
        stmt = (
            select(IntegrationConfig)
            .where(
                IntegrationConfig.kind == "yandex_contest",
                IntegrationConfig.status == "active",
                IntegrationConfig.deleted_at.is_(None),
            )
            .limit(500)
        )
        rows = (await s.execute(stmt)).scalars().all()
        return list(rows)


async def _list_homework_contest_ids(course_id: str, headers: dict[str, str]) -> list[int]:
    s = get_settings()
    url = (
        s.course_service_url.rstrip("/")
        + f"/api/v1/courses/{course_id}/homeworks?limit=200"
    )
    async with httpx.AsyncClient(timeout=s.httpx_timeout_seconds) as client:
        resp = await client.get(url, headers=headers)
    if resp.status_code >= 400:
        logger.warning(
            "scheduler.homeworks_fetch_failed",
            course_id=course_id,
            status=resp.status_code,
            body=resp.text[:200],
        )
        return []
    data = resp.json().get("data") or []
    out: list[int] = []
    for hw in data:
        m = CONTEST_ID_RE.search(hw.get("description") or "")
        if m:
            out.append(int(m.group(1)))
    return out


async def _push_to_identity(headers: dict[str, str], items: list[dict[str, Any]], tenant_id: str) -> dict[str, Any]:
    s = get_settings()
    url = s.identity_service_url.rstrip("/") + "/api/v1/users/bulk-import"
    async with httpx.AsyncClient(timeout=s.httpx_timeout_seconds) as client:
        resp = await client.post(
            url,
            headers={**headers, "Content-Type": "application/json"},
            json={"items": items, "tenant_id": tenant_id},
        )
    if resp.status_code >= 400:
        return {"ok": False, "status": resp.status_code, "body": resp.text[:200]}
    return {"ok": True, **resp.json()}


async def _push_to_course(
    headers: dict[str, str], course_id: str, members: list[dict[str, Any]]
) -> dict[str, Any]:
    s = get_settings()
    url = (
        s.course_service_url.rstrip("/")
        + f"/api/v1/courses/{course_id}/members:batchCreate"
    )
    async with httpx.AsyncClient(timeout=s.httpx_timeout_seconds) as client:
        resp = await client.post(
            url,
            headers={**headers, "Content-Type": "application/json"},
            json={"members": members},
        )
    if resp.status_code >= 400:
        return {"ok": False, "status": resp.status_code, "body": resp.text[:200]}
    body = resp.json()
    rows = body if isinstance(body, list) else (body.get("data") or [])
    return {"ok": True, "added": len(rows)}


async def _record_job(
    config_id: str,
    tenant_id: str,
    started_at: datetime,
    finished_at: datetime,
    status: str,
    stats: dict[str, Any],
    error: Optional[str] = None,
) -> None:
    factory = get_sessionmaker()
    async with factory() as s:
        s.add(
            ImportJob(
                id=new_job_id(),
                tenant_id=tenant_id,
                integration_id=config_id,
                scope={},
                trigger="scheduled",
                status=status,
                progress=stats,
                started_at=started_at,
                finished_at=finished_at,
                stats=stats,
                error={"detail": error} if error else None,
            )
        )
        await s.commit()


async def _sync_one_config(cfg: IntegrationConfig) -> dict[str, Any]:
    """Autosync tick for one YC config.

    Reads ``cfg.settings.autosync`` (UI-managed prefs):
      * ``enabled``        — bool, master switch
      * ``hours``          — int 1..24, cooldown window
      * ``homework_ids``   — list of homework_id strings the teacher
                              ticked
      * ``last_run_at``    — ISO timestamp of the previous successful
                              tick (we stamp it ourselves on completion)

    If autosync is off, no homeworks are selected, or we're inside the
    cooldown window, the tick skips without burning rate limits. The
    actual resync work is delegated to the same
    ``run_sync_all_imported_contests`` helper that backs the manual
    "Sync all" button, but with a ``homework_filter`` set so only
    selected homeworks get pulled.
    """
    settings_obj = cfg.settings if isinstance(cfg.settings, dict) else {}
    autosync = settings_obj.get("autosync") if isinstance(settings_obj, dict) else None
    if not isinstance(autosync, dict):
        return {"config": cfg.id, "skipped": True, "reason": "no autosync prefs"}
    if not autosync.get("enabled", False):
        return {"config": cfg.id, "skipped": True, "reason": "autosync disabled"}

    try:
        hours = int(autosync.get("hours") or 6)
    except (TypeError, ValueError):
        hours = 6
    hours = max(1, min(24, hours))
    homework_ids = {str(x) for x in (autosync.get("homework_ids") or [])}
    if not homework_ids:
        return {
            "config": cfg.id,
            "skipped": True,
            "reason": "no homeworks selected",
        }

    # Cooldown — refuse to re-tick within ``hours`` of the last success.
    last_str = autosync.get("last_run_at")
    if isinstance(last_str, str):
        try:
            last_dt = datetime.fromisoformat(last_str.replace("Z", "+00:00"))
            elapsed_h = (datetime.now(UTC) - last_dt).total_seconds() / 3600.0
            if elapsed_h < hours:
                return {
                    "config": cfg.id,
                    "skipped": True,
                    "reason": f"cooldown ({elapsed_h:.1f}h < {hours}h)",
                }
        except (ValueError, AttributeError):
            pass

    # Run the same helper the manual sync uses, but constrained to the
    # selected homeworks. Inline await — the scheduler tick already
    # owns the event loop, no need for asyncio.create_task here.
    from integration_service.services.yc_import import (
        run_sync_all_imported_contests,
        stamp_autosync_last_run,
        start_import_job,
    )

    job_id = await start_import_job(
        config_id=str(cfg.id),
        tenant_id=str(cfg.tenant_id),
        scope={
            "autosync": True,
            "homework_ids": sorted(homework_ids),
            "hours": hours,
        },
        trigger="scheduled",
    )
    cfg_snap = type(
        "_CfgSnap",
        (),
        {
            "id": cfg.id,
            "tenant_id": cfg.tenant_id,
            "course_id": cfg.course_id,
            "settings": cfg.settings,
        },
    )()
    await run_sync_all_imported_contests(
        job_id=job_id, cfg=cfg_snap, homework_filter=homework_ids
    )
    await stamp_autosync_last_run(str(cfg.id))
    return {
        "config": cfg.id,
        "homeworks": len(homework_ids),
        "hours": hours,
    }


async def _run_tick() -> None:
    s = get_settings()
    redis = get_redis()
    lock_acquired = await redis.set(
        LOCK_KEY, str(time.time()), nx=True, ex=s.scheduler_lock_ttl_seconds
    )
    if not lock_acquired:
        logger.debug("scheduler.tick_skipped", reason="lock_held")
        return

    started = time.monotonic()
    try:
        configs = await _list_active_yc_configs()
        if not configs:
            logger.info("scheduler.tick_no_configs")
            return
        logger.info("scheduler.tick_start", configs=len(configs))
        results: list[dict[str, Any]] = []
        for cfg in configs:
            try:
                stat = await _sync_one_config(cfg)
                results.append({"config": cfg.id, **stat})
            except Exception as exc:  # noqa: BLE001
                logger.exception(
                    "scheduler.config_failed", config_id=cfg.id, error=str(exc)
                )
        elapsed = time.monotonic() - started
        logger.info(
            "scheduler.tick_done",
            elapsed_s=round(elapsed, 2),
            results=results,
        )
    finally:
        # Lock TTL'd to a fixed value; explicit DEL for fast handoff.
        try:
            await redis.delete(LOCK_KEY)
        except Exception:  # noqa: BLE001
            pass


def start_scheduler() -> AsyncIOScheduler:
    """Initialise + start a single recurring tick. Idempotent."""
    global _scheduler
    if _scheduler and _scheduler.running:
        return _scheduler
    s = get_settings()
    _scheduler = AsyncIOScheduler(timezone="UTC")
    _scheduler.add_job(
        _run_tick,
        "interval",
        seconds=s.scheduler_interval_seconds,
        id="autosync_tick",
        coalesce=True,
        max_instances=1,
        replace_existing=True,
    )
    _scheduler.start()
    logger.info(
        "scheduler.started",
        interval_seconds=s.scheduler_interval_seconds,
    )
    return _scheduler


def stop_scheduler() -> None:
    global _scheduler
    if _scheduler and _scheduler.running:
        _scheduler.shutdown(wait=False)
        logger.info("scheduler.stopped")
    _scheduler = None
