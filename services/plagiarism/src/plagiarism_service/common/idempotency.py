"""Idempotency-Key store — delegates to :mod:`plaglens_common.idempotency`."""

from __future__ import annotations

from plaglens_common.idempotency import IdempotencyStore as _BaseStore

from ..config import get_settings


class IdempotencyStore(_BaseStore):
    """plagiarism store, injecting the service's TTL setting."""

    def __init__(self, redis_client: object | None = None) -> None:
        super().__init__(redis_client, ttl=get_settings().redis_idempotency_ttl_seconds)


__all__ = ["IdempotencyStore"]
