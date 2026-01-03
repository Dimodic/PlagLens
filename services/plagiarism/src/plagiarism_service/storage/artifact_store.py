"""MinIO/S3 artifact store with TTL-bound signed URLs.

The store is dependency-injectable so tests can swap in an in-memory
implementation; in production the singleton wraps the real ``minio.Minio``.
"""
from __future__ import annotations

import io
from dataclasses import dataclass
from datetime import timedelta
from typing import Any

from ..config import settings


@dataclass
class StoredArtifact:
    bucket: str
    key: str
    size: int
    content_type: str


class ArtifactStore:
    """Abstract artifact store. Subclasses implement actual storage."""

    async def put(
        self,
        *,
        tenant_id: str,
        run_id: str,
        kind: str,
        data: bytes,
        content_type: str = "application/octet-stream",
        filename: str | None = None,
    ) -> StoredArtifact:  # pragma: no cover - interface
        raise NotImplementedError

    async def get(self, *, bucket: str, key: str) -> bytes:  # pragma: no cover - interface
        raise NotImplementedError

    async def signed_url(
        self, *, bucket: str, key: str, ttl_seconds: int | None = None
    ) -> str:  # pragma: no cover - interface
        raise NotImplementedError


class InMemoryArtifactStore(ArtifactStore):
    """Test-friendly in-memory implementation."""

    def __init__(self) -> None:
        self._objects: dict[tuple[str, str], tuple[bytes, str]] = {}

    async def put(
        self,
        *,
        tenant_id: str,
        run_id: str,
        kind: str,
        data: bytes,
        content_type: str = "application/octet-stream",
        filename: str | None = None,
    ) -> StoredArtifact:
        bucket = f"{settings.minio_bucket_prefix}-{tenant_id}".lower()
        key = f"plagiarism/{run_id}/{kind}.{(filename or kind).split('.')[-1]}"
        self._objects[(bucket, key)] = (data, content_type)
        return StoredArtifact(bucket=bucket, key=key, size=len(data), content_type=content_type)

    async def get(self, *, bucket: str, key: str) -> bytes:
        data, _ = self._objects.get((bucket, key), (b"", ""))
        return data

    async def signed_url(
        self, *, bucket: str, key: str, ttl_seconds: int | None = None
    ) -> str:
        ttl = ttl_seconds or settings.minio_signed_url_ttl_seconds
        return f"http://memory.local/{bucket}/{key}?ttl={ttl}"


class MinioArtifactStore(ArtifactStore):
    def __init__(self) -> None:
        from minio import Minio

        self._client = Minio(
            settings.minio_endpoint,
            access_key=settings.minio_access_key,
            secret_key=settings.minio_secret_key,
            secure=settings.minio_secure,
        )

    def _bucket(self, tenant_id: str) -> str:
        return f"{settings.minio_bucket_prefix}-{tenant_id}".lower()

    def _ensure_bucket(self, bucket: str) -> None:
        try:
            if not self._client.bucket_exists(bucket):
                self._client.make_bucket(bucket)
        except Exception:
            # Bucket may already exist with stricter policy; ignore.
            pass

    async def put(
        self,
        *,
        tenant_id: str,
        run_id: str,
        kind: str,
        data: bytes,
        content_type: str = "application/octet-stream",
        filename: str | None = None,
    ) -> StoredArtifact:
        bucket = self._bucket(tenant_id)
        ext = "bin"
        if filename and "." in filename:
            ext = filename.rsplit(".", 1)[-1]
        elif kind == "html":
            ext = "html"
        elif kind == "json":
            ext = "json"
        elif kind == "archive":
            ext = "zip"
        key = f"plagiarism/{run_id}/{kind}.{ext}"
        self._ensure_bucket(bucket)
        stream = io.BytesIO(data)
        self._client.put_object(
            bucket_name=bucket,
            object_name=key,
            data=stream,
            length=len(data),
            content_type=content_type,
        )
        return StoredArtifact(bucket=bucket, key=key, size=len(data), content_type=content_type)

    async def get(self, *, bucket: str, key: str) -> bytes:
        resp = self._client.get_object(bucket, key)
        try:
            return resp.read()
        finally:
            resp.close()
            resp.release_conn()

    async def signed_url(
        self, *, bucket: str, key: str, ttl_seconds: int | None = None
    ) -> str:
        ttl = ttl_seconds or settings.minio_signed_url_ttl_seconds
        return self._client.presigned_get_object(
            bucket, key, expires=timedelta(seconds=ttl)
        )


_store: ArtifactStore | None = None


def get_artifact_store() -> ArtifactStore:
    global _store
    if _store is None:
        # Default to InMemory for tests / local dev when env=test.
        if settings.env == "test":
            _store = InMemoryArtifactStore()
        else:
            try:
                _store = MinioArtifactStore()
            except Exception:
                _store = InMemoryArtifactStore()
    return _store


def set_artifact_store(store: ArtifactStore) -> None:
    """Test injection helper."""
    global _store
    _store = store


def parse_uri(uri: str) -> tuple[str, str] | None:
    """Parse ``s3://bucket/key`` style URIs back into ``(bucket, key)``."""
    if not uri:
        return None
    if uri.startswith("s3://"):
        rest = uri[len("s3://") :]
    elif uri.startswith("memory://") or uri.startswith("http://memory.local/"):
        rest = uri.split("memory.local/", 1)[-1].split("?", 1)[0] if "memory.local/" in uri else uri[len("memory://") :]
    else:
        rest = uri
    if "/" not in rest:
        return None
    bucket, key = rest.split("/", 1)
    return bucket, key


def make_uri(bucket: str, key: str) -> str:
    return f"s3://{bucket}/{key}"


def _identity(*args: Any, **kwargs: Any) -> Any:  # pragma: no cover
    return args, kwargs
