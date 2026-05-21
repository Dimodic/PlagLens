"""File storage abstraction. Default impl uses MinIO via the `minio` lib
wrapped through `asyncio.to_thread`. An in-memory implementation is provided
for local development and tests (selected via `MINIO_DISABLED`).
"""
from __future__ import annotations

import asyncio
import io
from datetime import datetime
from typing import Protocol

from submission_service.config import Settings, get_settings


class FileStorage(Protocol):
    async def ensure_bucket(self, tenant_slug: str) -> str: ...

    async def put_object(
        self,
        *,
        tenant_slug: str,
        key: str,
        data: bytes,
        mime_type: str | None = None,
    ) -> str: ...

    async def get_object(self, *, bucket: str, key: str) -> bytes: ...

    async def delete_object(self, *, bucket: str, key: str) -> None: ...


def storage_layout_key(
    *, submission_id: str, file_id: str, filename: str, when: datetime
) -> str:
    """Build the canonical key inside the bucket.

    submissions/{yyyy}/{mm}/{dd}/sub_{id}/file_{file_id}_{filename}
    """
    safe_name = filename.replace("/", "_").replace("\\", "_")
    return (
        f"submissions/{when:%Y}/{when:%m}/{when:%d}/{submission_id}/"
        f"file_{file_id}_{safe_name}"
    )


_BUCKET_SAFE_CHARS = "abcdefghijklmnopqrstuvwxyz0123456789-"


def _sanitize_bucket_segment(value: str) -> str:
    """Lowercase + map disallowed chars to '-'.

    S3 bucket names allow only lowercase letters, digits, and hyphens. This
    matters when ``tenant_slug`` falls back to a tenant id like
    ``tnt_4e85ac83bfcf4508b0ed7a79`` which contains an underscore.
    """
    out: list[str] = []
    for ch in value.lower():
        out.append(ch if ch in _BUCKET_SAFE_CHARS else "-")
    cleaned = "".join(out).strip("-")
    return cleaned or "tenant"


def bucket_for_tenant(tenant_slug: str, prefix: str = "plaglens") -> str:
    return f"{_sanitize_bucket_segment(prefix)}-{_sanitize_bucket_segment(tenant_slug)}"


class InMemoryFileStorage:
    """Process-local storage. Useful for tests."""

    def __init__(self, prefix: str = "plaglens") -> None:
        self._prefix = prefix
        self._buckets: dict[str, set[str]] = {}
        self._objects: dict[tuple[str, str], bytes] = {}

    async def ensure_bucket(self, tenant_slug: str) -> str:
        bucket = bucket_for_tenant(tenant_slug, self._prefix)
        self._buckets.setdefault(bucket, set())
        return bucket

    async def put_object(
        self,
        *,
        tenant_slug: str,
        key: str,
        data: bytes,
        mime_type: str | None = None,
    ) -> str:
        bucket = await self.ensure_bucket(tenant_slug)
        self._objects[(bucket, key)] = data
        self._buckets[bucket].add(key)
        return f"s3://{bucket}/{key}"

    async def get_object(self, *, bucket: str, key: str) -> bytes:
        return self._objects[(bucket, key)]

    async def delete_object(self, *, bucket: str, key: str) -> None:
        self._objects.pop((bucket, key), None)
        self._buckets.get(bucket, set()).discard(key)


class MinioFileStorage:
    """Real MinIO/S3 storage. Uses sync `minio` client offloaded to a thread."""

    def __init__(self, settings: Settings) -> None:
        from minio import Minio  # type: ignore[import-not-found]

        self._settings = settings
        self._client = Minio(
            endpoint=settings.MINIO_ENDPOINT,
            access_key=settings.MINIO_ACCESS_KEY,
            secret_key=settings.MINIO_SECRET_KEY,
            secure=settings.MINIO_SECURE,
            region=settings.MINIO_REGION,
        )

    async def ensure_bucket(self, tenant_slug: str) -> str:
        bucket = bucket_for_tenant(tenant_slug, self._settings.MINIO_BUCKET_PREFIX)

        def _ensure() -> None:
            if not self._client.bucket_exists(bucket):
                self._client.make_bucket(bucket)

        await asyncio.to_thread(_ensure)
        return bucket

    async def put_object(
        self,
        *,
        tenant_slug: str,
        key: str,
        data: bytes,
        mime_type: str | None = None,
    ) -> str:
        bucket = await self.ensure_bucket(tenant_slug)

        def _put() -> None:
            self._client.put_object(
                bucket,
                key,
                io.BytesIO(data),
                length=len(data),
                content_type=mime_type or "application/octet-stream",
            )

        await asyncio.to_thread(_put)
        return f"s3://{bucket}/{key}"

    async def get_object(self, *, bucket: str, key: str) -> bytes:
        def _get() -> bytes:
            resp = self._client.get_object(bucket, key)
            try:
                return resp.read()
            finally:
                resp.close()
                resp.release_conn()

        return await asyncio.to_thread(_get)

    async def delete_object(self, *, bucket: str, key: str) -> None:
        await asyncio.to_thread(self._client.remove_object, bucket, key)


def build_file_storage(settings: Settings | None = None) -> FileStorage:
    settings = settings or get_settings()
    if settings.MINIO_DISABLED:
        return InMemoryFileStorage(prefix=settings.MINIO_BUCKET_PREFIX)
    return MinioFileStorage(settings)
