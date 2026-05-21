"""Avatar storage backed by MinIO / S3.

Uploads land in ``settings.avatars_bucket`` under a per-user prefix so we can
soft-delete (just clear ``users.avatar_url``) while keeping past versions for
audit. The returned URL is presigned for ``settings.avatars_url_ttl_seconds``
so the bucket stays private — to "rotate" an avatar we either re-sign or
re-upload (versioning is enabled on the bucket via the init script).
"""
from __future__ import annotations

import io
import logging
from datetime import timedelta
from typing import Optional

from minio import Minio
from minio.error import S3Error

from ..config import get_settings

logger = logging.getLogger(__name__)


_ALLOWED_MIME = {
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/jpg": "jpg",
    "image/webp": "webp",
    "image/gif": "gif",
}


class AvatarStorageError(RuntimeError):
    """Raised when MinIO is not reachable or rejects the upload."""


class AvatarService:
    """Thin wrapper around the synchronous ``minio.Minio`` client.

    Identity is async (FastAPI) but ``minio`` is sync; we run the small,
    bounded calls (``put_object`` / ``presigned_get_object``) in the default
    threadpool via ``asyncio.to_thread`` to avoid blocking the event loop.
    """

    def __init__(self, client: Optional[Minio] = None) -> None:
        self._settings = get_settings()
        self._client = client or self._build_client()

    def _build_client(self) -> Minio:
        s = self._settings
        return Minio(
            endpoint=s.minio_endpoint,
            access_key=s.minio_access_key,
            secret_key=s.minio_secret_key,
            secure=s.minio_secure,
            region=s.minio_region,
        )

    @staticmethod
    def ext_for(content_type: str) -> str:
        return _ALLOWED_MIME.get(content_type.lower(), "bin")

    @staticmethod
    def is_supported(content_type: str) -> bool:
        return content_type.lower() in _ALLOWED_MIME

    def _ensure_bucket(self) -> None:
        bucket = self._settings.avatars_bucket
        try:
            if not self._client.bucket_exists(bucket):
                self._client.make_bucket(bucket)
        except S3Error as exc:
            raise AvatarStorageError(f"bucket check failed: {exc}") from exc

    def put(
        self,
        *,
        user_id: str,
        data: bytes,
        content_type: str,
    ) -> tuple[str, str]:
        """Store the bytes and return ``(object_key, presigned_url)``."""
        self._ensure_bucket()
        ext = self.ext_for(content_type)
        key = f"users/{user_id}/avatar.{ext}"
        try:
            self._client.put_object(
                bucket_name=self._settings.avatars_bucket,
                object_name=key,
                data=io.BytesIO(data),
                length=len(data),
                content_type=content_type,
            )
        except S3Error as exc:
            raise AvatarStorageError(f"put_object failed: {exc}") from exc
        url = self.presigned_url(key=key)
        return key, url

    def presigned_url(self, *, key: str) -> str:
        try:
            return self._client.presigned_get_object(
                bucket_name=self._settings.avatars_bucket,
                object_name=key,
                expires=timedelta(seconds=self._settings.avatars_url_ttl_seconds),
            )
        except S3Error as exc:
            raise AvatarStorageError(f"presigned_get_object failed: {exc}") from exc

    def delete(self, *, key: str) -> None:
        try:
            self._client.remove_object(
                bucket_name=self._settings.avatars_bucket,
                object_name=key,
            )
        except S3Error as exc:
            logger.warning("avatar delete failed (%s): %s", key, exc)
