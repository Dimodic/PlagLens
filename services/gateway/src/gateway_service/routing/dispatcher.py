"""URL → backend dispatcher. Pure logic; transport in proxy.forwarder."""

from __future__ import annotations

from gateway_service.config import settings
from gateway_service.routing.table import Route, match


def resolve(path: str) -> tuple[Route, str] | None:
    """Resolve a path to (Route, backend_base_url) or None."""
    route = match(path)
    if route is None:
        return None
    backends = settings.backends_map()
    base = backends.get(route.backend)
    if not base:
        return None
    return route, base


__all__ = ["resolve"]
