"""Idempotency-Key store — delegates to :mod:`plaglens_common.idempotency`."""

from __future__ import annotations

from plaglens_common.idempotency import IdempotencyStore as _BaseStore

from ..config import get_settings


class IdempotencyStore(_BaseStore):
    """ai-analysis store, injecting the service's TTL setting."""

    def __init__(self, redis_client: object | None = None) -> None:
        super().__init__(redis_client, ttl=get_settings().IDEMPOTENCY_TTL_SECONDS)


__all__ = ["IdempotencyStore"]
