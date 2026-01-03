"""Idempotency-Key cache for POST replays.

Storage: Redis. Key = `idem:<tenant>:<user>:<idempotency_key>`.
Value = JSON {body_hash, status, headers, body_b64} for 24h.
"""

from __future__ import annotations

import base64
import hashlib
import json
from dataclasses import dataclass
from typing import Any

from gateway_service.redis_client import get_redis

TTL_S = 24 * 3600


@dataclass(frozen=True)
class IdempotencyRecord:
    body_hash: str
    status: int
    headers: list[tuple[str, str]]
    body: bytes


def _key(tenant: str | None, user: str | None, idem: str) -> str:
    t = tenant or "anon"
    u = user or "anon"
    return f"idem:{t}:{u}:{idem}"


def hash_body(body: bytes) -> str:
    return hashlib.sha256(body or b"").hexdigest()


async def get(tenant: str | None, user: str | None, idem: str) -> IdempotencyRecord | None:
    try:
        r = await get_redis()
        raw = await r.get(_key(tenant, user, idem))
        if raw is None:
            return None
        d = json.loads(raw)
        return IdempotencyRecord(
            body_hash=d["body_hash"],
            status=d["status"],
            headers=[(k, v) for k, v in d.get("headers", [])],
            body=base64.b64decode(d.get("body_b64", "")),
        )
    except Exception:
        return None


async def store(
    tenant: str | None,
    user: str | None,
    idem: str,
    *,
    body_hash: str,
    status: int,
    headers: list[tuple[str, str]],
    body: bytes,
) -> None:
    try:
        r = await get_redis()
        await r.set(
            _key(tenant, user, idem),
            json.dumps(
                {
                    "body_hash": body_hash,
                    "status": status,
                    "headers": list(headers),
                    "body_b64": base64.b64encode(body or b"").decode(),
                }
            ),
            ex=TTL_S,
        )
    except Exception:
        return


__all__ = ["IdempotencyRecord", "get", "store", "hash_body", "TTL_S"]


def _u(_x: Any) -> Any:  # pragma: no cover
    return _x
