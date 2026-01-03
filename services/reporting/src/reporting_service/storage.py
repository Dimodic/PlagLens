"""MinIO storage abstraction with an in-memory fake for tests."""
from __future__ import annotations

import asyncio
import io
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from typing import Protocol


@dataclass
class StoredObject:
    bucket: str
    key: str
    size: int
    content_type: str
    data: bytes
    created_at: datetime = field(default_factory=lambda: datetime.utcnow())


class StorageBackend(Protocol):
    async def ensure_bucket(self, bucket: str) -> None: ...
    async def put(self, bucket: str, key: str, data: bytes, content_type: str) -> None: ...
    async def get(self, bucket: str, key: str) -> bytes | None: ...
    async def delete(self, bucket: str, key: str) -> bool: ...
    async def signed_url(self, bucket: str, key: str, ttl_seconds: int) -> str: ...
    async def list_expired(self, bucket: str, before: datetime) -> list[str]: ...


class InMemoryStorage:
    """Synchronous-by-default storage used in tests and as the default backend
    when MinIO is not configured. Simulates signed URLs by returning a sentinel
    pseudo-URL containing bucket/key/expiry."""

    def __init__(self) -> None:
        self._lock = asyncio.Lock()
        self._objects: dict[tuple[str, str], StoredObject] = {}
        self._buckets: set[str] = set()

    async def ensure_bucket(self, bucket: str) -> None:
        async with self._lock:
            self._buckets.add(bucket)

    async def put(self, bucket: str, key: str, data: bytes, content_type: str) -> None:
        await self.ensure_bucket(bucket)
        async with self._lock:
            self._objects[(bucket, key)] = StoredObject(
                bucket=bucket,
                key=key,
                size=len(data),
                content_type=content_type,
                data=bytes(data),
            )

    async def get(self, bucket: str, key: str) -> bytes | None:
        async with self._lock:
            obj = self._objects.get((bucket, key))
            return obj.data if obj else None

    async def delete(self, bucket: str, key: str) -> bool:
        async with self._lock:
            return self._objects.pop((bucket, key), None) is not None

    async def signed_url(self, bucket: str, key: str, ttl_seconds: int) -> str:
        expires = datetime.utcnow() + timedelta(seconds=ttl_seconds)
        return f"memory://{bucket}/{key}?expires={int(expires.timestamp())}"

    async def list_expired(self, bucket: str, before: datetime) -> list[str]:
        async with self._lock:
            return [k for (b, k), obj in self._objects.items() if b == bucket and obj.created_at < before]


class MinioStorage:
    """Thin async wrapper around the synchronous minio SDK.

    Falls back to ``InMemoryStorage`` if instantiation fails — keeps the
    service usable in CI / academic projects without a live MinIO.

    ``public_endpoint`` is the host the *browser* will use to follow
    signed-download URLs. In Docker the internal ``endpoint`` is
    ``minio:9000`` which the browser can't resolve, so a second client is
    initialised against the public address and used only for URL signing.
    AWS SigV4 signs the host into the URL, so post-hoc host rewrite
    wouldn't work.
    """

    def __init__(
        self,
        endpoint: str,
        access_key: str,
        secret_key: str,
        secure: bool,
        public_endpoint: str | None = None,
        region: str = "us-east-1",
    ):
        try:
            from minio import Minio  # type: ignore

            # ``region`` is set explicitly on both clients — without it the
            # SDK does a ``get_bucket_location`` round-trip *during URL
            # signing* (and during put on a new bucket), which for the
            # sign-client would try to hit the public endpoint *from inside
            # the container* and fail. With a known region the signer just
            # builds the URL offline.
            self._client = Minio(
                endpoint,
                access_key=access_key,
                secret_key=secret_key,
                secure=secure,
                region=region,
            )
            # Separate signing client. If no public endpoint is configured
            # we reuse the same one — that matches single-host deployments
            # where internal and external addresses are identical.
            self._sign_client = (
                Minio(
                    public_endpoint,
                    access_key=access_key,
                    secret_key=secret_key,
                    secure=secure,
                    region=region,
                )
                if public_endpoint and public_endpoint != endpoint
                else self._client
            )
        except Exception:
            self._client = None
            self._sign_client = None
        self._fallback = InMemoryStorage() if self._client is None else None

    async def ensure_bucket(self, bucket: str) -> None:
        if self._fallback:
            await self._fallback.ensure_bucket(bucket)
            return
        loop = asyncio.get_running_loop()
        await loop.run_in_executor(None, self._ensure_sync, bucket)

    def _ensure_sync(self, bucket: str) -> None:
        try:
            if not self._client.bucket_exists(bucket):
                self._client.make_bucket(bucket)
        except Exception:
            pass

    async def put(self, bucket: str, key: str, data: bytes, content_type: str) -> None:
        if self._fallback:
            await self._fallback.put(bucket, key, data, content_type)
            return
        loop = asyncio.get_running_loop()
        await loop.run_in_executor(
            None,
            lambda: self._client.put_object(
                bucket, key, io.BytesIO(data), length=len(data), content_type=content_type
            ),
        )

    async def get(self, bucket: str, key: str) -> bytes | None:
        if self._fallback:
            return await self._fallback.get(bucket, key)
        loop = asyncio.get_running_loop()

        def _read():
            try:
                resp = self._client.get_object(bucket, key)
                try:
                    return resp.read()
                finally:
                    resp.close()
                    resp.release_conn()
            except Exception:
                return None

        return await loop.run_in_executor(None, _read)

    async def delete(self, bucket: str, key: str) -> bool:
        if self._fallback:
            return await self._fallback.delete(bucket, key)
        loop = asyncio.get_running_loop()

        def _del():
            try:
                self._client.remove_object(bucket, key)
                return True
            except Exception:
                return False

        return await loop.run_in_executor(None, _del)

    async def signed_url(self, bucket: str, key: str, ttl_seconds: int) -> str:
        if self._fallback:
            return await self._fallback.signed_url(bucket, key, ttl_seconds)
        loop = asyncio.get_running_loop()
        # Use the public-endpoint-bound client so the host in the signed
        # URL is one the browser can actually reach.
        return await loop.run_in_executor(
            None,
            lambda: self._sign_client.presigned_get_object(
                bucket, key, expires=timedelta(seconds=ttl_seconds)
            ),
        )

    async def list_expired(self, bucket: str, before: datetime) -> list[str]:
        if self._fallback:
            return await self._fallback.list_expired(bucket, before)
        return []
