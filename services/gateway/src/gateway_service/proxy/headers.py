"""Hop-by-hop header handling + tenant injection."""

from __future__ import annotations

from collections.abc import Iterable

from gateway_service.auth import Principal
from gateway_service.config import HOP_BY_HOP_HEADERS


def strip_hop_by_hop(headers: Iterable[tuple[str, str]]) -> list[tuple[str, str]]:
    out: list[tuple[str, str]] = []
    for k, v in headers:
        kl = k.lower()
        if kl in HOP_BY_HOP_HEADERS:
            continue
        if kl == "host":
            continue
        if kl == "content-length":
            # Recomputed by httpx
            continue
        out.append((k, v))
    return out


def inject_forward_headers(
    headers: list[tuple[str, str]],
    *,
    request_id: str | None,
    principal: Principal | None,
    client_ip: str | None,
) -> list[tuple[str, str]]:
    """Add gateway-only headers: X-Tenant-Id, X-Request-Id, X-Forwarded-For."""
    res = list(headers)
    if request_id and not _has(res, "x-request-id"):
        res.append(("X-Request-Id", request_id))
    if principal and principal.tenant_id:
        res = _replace(res, "x-tenant-id", principal.tenant_id)
    if principal and principal.user_id:
        res = _replace(res, "x-user-id", principal.user_id)
    if principal and principal.global_role:
        res = _replace(res, "x-global-role", principal.global_role)
    if client_ip:
        existing = _get(res, "x-forwarded-for")
        if existing:
            res = _replace(res, "x-forwarded-for", f"{existing}, {client_ip}")
        else:
            res.append(("X-Forwarded-For", client_ip))
    return res


def _has(headers: list[tuple[str, str]], name_lower: str) -> bool:
    return any(k.lower() == name_lower for k, _ in headers)


def _get(headers: list[tuple[str, str]], name_lower: str) -> str | None:
    for k, v in headers:
        if k.lower() == name_lower:
            return v
    return None


def _replace(headers: list[tuple[str, str]], name_lower: str, value: str) -> list[tuple[str, str]]:
    out = [(k, v) for k, v in headers if k.lower() != name_lower]
    out.append((name_lower.title(), value))
    return out


__all__ = ["strip_hop_by_hop", "inject_forward_headers"]
