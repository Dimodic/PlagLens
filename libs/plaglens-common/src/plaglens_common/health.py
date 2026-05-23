"""Standard health, readiness, version and metrics endpoints.

"""

from __future__ import annotations

import inspect
import os
import time
from collections.abc import Awaitable, Callable
from typing import Any

CheckFn = Callable[[], Awaitable[bool] | bool]

def health_router(
    *,
    service_name: str,
    version: str,
    commit: str | None = None,
    checks: dict[str, CheckFn] | None = None,
    metrics_callable: Callable[[], tuple[bytes, str]] | None = None,
) -> Any:
    """Build an APIRouter exposing /healthz, /readyz, /metrics and /v1/version.

    `checks` is a mapping of name -> async/sync callable returning bool. /readyz
    fails (503) if any returns False or raises.
    """

    try:
        from fastapi import APIRouter  # type: ignore[import-not-found]
        from starlette.responses import JSONResponse, Response  # type: ignore[import-not-found]
    except ImportError as imp_err:  # pragma: no cover
        raise RuntimeError("FastAPI/Starlette is required for health_router") from imp_err

    router = APIRouter()
    started_at = time.time()
    checks = dict(checks or {})
    commit = commit or os.environ.get("GIT_COMMIT")

    @router.get("/healthz", include_in_schema=False)
    async def healthz() -> Any:
        return JSONResponse({"status": "ok", "service": service_name})

    @router.get("/readyz", include_in_schema=False)
    async def readyz() -> Any:
        results: dict[str, str] = {}
        all_ok = True
        for name, fn in checks.items():
            try:
                rv = fn()
                if inspect.isawaitable(rv):
                    rv = await rv
                ok = bool(rv)
            except Exception as exc:
                ok = False
                results[name] = f"error: {exc.__class__.__name__}"
            else:
                results[name] = "ok" if ok else "fail"
            if not ok:
                all_ok = False
        return JSONResponse(
            {"status": "ok" if all_ok else "fail", "checks": results},
            status_code=200 if all_ok else 503,
        )

    @router.get("/metrics", include_in_schema=False)
    async def metrics() -> Any:
        if metrics_callable is None:
            try:
                from prometheus_client import (  # type: ignore[import-not-found]
                    CONTENT_TYPE_LATEST,
                    generate_latest,
                )
            except ImportError as imp_err:  # pragma: no cover
                raise RuntimeError("prometheus_client is required for /metrics") from imp_err
            payload = generate_latest()
            ctype = CONTENT_TYPE_LATEST
        else:
            payload, ctype = metrics_callable()
        return Response(content=payload, media_type=ctype)

    version_str = version

    @router.get("/v1/version", include_in_schema=False)
    async def version_endpoint() -> Any:
        return JSONResponse(
            {
                "service": service_name,
                "version": version_str,
                "commit": commit,
                "built_at": os.environ.get("BUILT_AT"),
                "uptime_seconds": int(time.time() - started_at),
            }
        )

    return router

__all__ = ["health_router"]
