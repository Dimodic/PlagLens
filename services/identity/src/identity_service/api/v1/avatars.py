"""Public avatar proxy — ``GET /api/v1/avatars/{user_id}``.

Streams a user's avatar bytes from MinIO so the bucket stays private and the
browser never needs a MinIO-reachable URL. The gateway allows the
``/api/v1/avatars/`` prefix without a JWT: ``<img src>`` can't send a Bearer
token and avatars aren't secret. Replaces the old flow that stored a MinIO
presigned URL pointing at the internal ``minio:9000`` host (unreachable from
the browser, and expiring).
"""
from __future__ import annotations

import asyncio
import logging

from fastapi import APIRouter, Response

from ...services.avatar_service import AvatarService

logger = logging.getLogger(__name__)
router = APIRouter()


@router.get("/avatars/{user_id}", summary="Public avatar proxy (streams from MinIO)")
async def get_avatar(user_id: str) -> Response:
    avatars = AvatarService()
    try:
        result = await asyncio.to_thread(avatars.fetch, user_id=user_id)
    except Exception as exc:  # noqa: BLE001 — storage hiccup → no avatar
        logger.info("avatar fetch failed for %s: %s", user_id, exc)
        result = None
    if result is None:
        return Response(status_code=404)
    data, content_type = result
    return Response(
        content=data,
        media_type=content_type,
        headers={"Cache-Control": "public, max-age=3600"},
    )


__all__ = ["router"]
