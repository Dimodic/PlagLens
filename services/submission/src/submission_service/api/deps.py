"""HTTP-layer dependencies: storage, course client, idempotency, operations."""
from __future__ import annotations

from typing import Annotated, Any

from fastapi import Depends, Header, Request
from sqlalchemy.ext.asyncio import AsyncSession

from submission_service.common.idempotency import IdempotencyStore
from submission_service.deps import CurrentUser, SessionDep
from submission_service.events.producer import EventPublisher, get_publisher
from submission_service.services.course_client import (
    CourseClient,
    HttpCourseClient,
    InMemoryCourseClient,
)
from submission_service.services.file_storage_service import (
    FileStorage,
    build_file_storage,
)
from submission_service.services.submission_service import SubmissionService

# ---- Singletons (overridable in tests via app.dependency_overrides) ----

_storage: FileStorage | None = None
_course_client: CourseClient | None = None
_idempotency: IdempotencyStore | None = None


def get_storage() -> FileStorage:
    global _storage
    if _storage is None:
        _storage = build_file_storage()
    return _storage


def set_storage(storage: FileStorage) -> None:
    global _storage
    _storage = storage


def get_course_client() -> CourseClient:
    global _course_client
    if _course_client is None:
        # Prefer the HTTP client when running inside the dev/test stack —
        # COURSE_SERVICE_URL is provided via docker-compose. Fall back to
        # in-memory for unit tests where the env var is unset.
        import os
        if os.environ.get("COURSE_SERVICE_URL") or os.environ.get("COURSE_BASE_URL"):
            _course_client = HttpCourseClient()
        else:
            _course_client = InMemoryCourseClient()
    return _course_client


def set_course_client(client: CourseClient) -> None:
    global _course_client
    _course_client = client


def get_idempotency_store() -> IdempotencyStore:
    global _idempotency
    if _idempotency is None:
        _idempotency = IdempotencyStore(redis_client=None)
    return _idempotency


def set_idempotency_store(store: IdempotencyStore) -> None:
    global _idempotency
    _idempotency = store


# ---- FastAPI dependency providers ----


def _get_storage_dep() -> FileStorage:
    return get_storage()


def _get_course_dep() -> CourseClient:
    return get_course_client()


def _get_idem_dep() -> IdempotencyStore:
    return get_idempotency_store()


StorageDep = Annotated[FileStorage, Depends(_get_storage_dep)]
CourseDep = Annotated[CourseClient, Depends(_get_course_dep)]
IdempotencyDep = Annotated[IdempotencyStore, Depends(_get_idem_dep)]
PublisherDep = Annotated[EventPublisher, Depends(get_publisher)]


def get_submission_service(
    session: SessionDep,
    storage: StorageDep,
    course_client: CourseDep,
) -> SubmissionService:
    return SubmissionService(
        session=session, storage=storage, course_client=course_client
    )


SubmissionServiceDep = Annotated[SubmissionService, Depends(get_submission_service)]


def tenant_slug_from_request(request: Request, user: CurrentUser) -> str:
    """Pick tenant slug from X-Tenant-Hint header, fallback to tenant_id."""
    hint = request.headers.get("X-Tenant-Hint")
    return hint or user.tenant_id


__all__ = [
    "CurrentUser",
    "SessionDep",
    "StorageDep",
    "CourseDep",
    "IdempotencyDep",
    "PublisherDep",
    "SubmissionService",
    "SubmissionServiceDep",
    "AsyncSession",
    "get_storage",
    "set_storage",
    "get_course_client",
    "set_course_client",
    "get_idempotency_store",
    "set_idempotency_store",
    "tenant_slug_from_request",
    "Header",
    "Any",
]
