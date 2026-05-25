"""Cache-Control hardening.

Every API response is user-scoped — there's no situation where a browser
should reuse a cached body across requests on its own (no shared CDN
caches it either, since these responses carry a Bearer token in the
Authorization header and we proxy them at the gateway).

Without an explicit ``Cache-Control`` header browsers fall back to
heuristics: if the response has a ``Last-Modified`` (which we don't
set) or simply looks "stable", they may freshen lazily and serve a
stale copy on the next navigation. That's exactly what bit us on
``/users/me`` after a profile change — the SPA never re-fetched and we
spent hours wondering "почему не видно изменений".

This middleware unconditionally stamps ``Cache-Control: no-store`` on
every response that doesn't already say otherwise. Static assets are
served by the frontend nginx (different host), not by the gateway, so
this won't accidentally make CSS/JS uncacheable.
"""
from __future__ import annotations

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response


class NoCacheAPIMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):  # noqa: D401
        response: Response = await call_next(request)
        # Only stamp if the response handler hasn't already set a more
        # specific value (e.g. file downloads with ``private, max-age=…``).
        if "cache-control" not in {k.lower() for k in response.headers}:
            response.headers["Cache-Control"] = "no-store"
        return response


__all__ = ["NoCacheAPIMiddleware"]
