"""Resolve a `op_*` operation_id to its owning backend service.

Prefix mapping (see 13-GATEWAY.md §«Эндпоинты, которые ОБСЛУЖИВАЕТ сам Gateway»):
    op_imp_*  → integration
    op_plg_*  → plagiarism
    op_ai_*   → ai-analysis
    op_exp_*  → reporting
    op_grd_*  → submission
"""

from __future__ import annotations

from gateway_service.config import settings

# Order matters: longer prefix first.
OP_PREFIX_TO_BACKEND: tuple[tuple[str, str], ...] = (
    ("op_imp_", "integration"),
    ("op_plg_", "plagiarism"),
    ("op_ai_", "ai-analysis"),
    ("op_exp_", "reporting"),
    ("op_grd_", "submission"),
)


def backend_for(op_id: str) -> str | None:
    if not op_id.startswith("op_"):
        return None
    for prefix, backend in OP_PREFIX_TO_BACKEND:
        if op_id.startswith(prefix):
            return backend
    return None


def backend_url_for(op_id: str) -> tuple[str, str] | None:
    """Return (backend_name, base_url) or None."""
    b = backend_for(op_id)
    if b is None:
        return None
    backends = settings.backends_map()
    base = backends.get(b)
    if not base:
        return None
    return b, base


def all_operation_backends() -> list[tuple[str, str]]:
    """Return list of (name, base_url) for every backend that owns operations."""
    backends = settings.backends_map()
    out: list[tuple[str, str]] = []
    seen: set[str] = set()
    for _prefix, name in OP_PREFIX_TO_BACKEND:
        if name in seen:
            continue
        seen.add(name)
        base = backends.get(name)
        if base:
            out.append((name, base))
    return out


__all__ = [
    "OP_PREFIX_TO_BACKEND",
    "backend_for",
    "backend_url_for",
    "all_operation_backends",
]
