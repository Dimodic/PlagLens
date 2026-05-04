"""Submission fetcher tests — uses httpx.MockTransport to stand in for the
Submission Service."""
from __future__ import annotations

import httpx
import pytest

from plagiarism_service.services.submission_fetcher import SubmissionFetcher


def _make_handler():
    """Mock for the Submission Service. Knows two submissions."""
    submissions = {
        "sub_1": {
            "id": "sub_1",
            "author_id": "usr_a",
            "author_display_name": "Alice",
            "course_id": "crs_x",
            "assignment_id": "asn_x",
            "language": "python",
            "files": [{"id": "fil_1", "path": "main.py"}],
        },
        "sub_2": {
            "id": "sub_2",
            "author_id": "usr_b",
            "author_display_name": "Bob",
            "course_id": "crs_x",
            "assignment_id": "asn_x",
            "language": "python",
            "files": [
                {"id": "fil_2a", "path": "main.py"},
                {"id": "fil_2b", "path": "util.py"},
            ],
        },
    }
    contents = {
        "fil_1": "def f(x):\n    return x + 1\n",
        "fil_2a": "def g(x):\n    return x + 1\n",
        "fil_2b": "# helpers\n",
    }

    def handler(request: httpx.Request) -> httpx.Response:
        path = request.url.path
        # GET /api/v1/submissions/{id}
        if path.startswith("/api/v1/submissions/") and "/files/" not in path:
            sid = path.removeprefix("/api/v1/submissions/")
            if sid in submissions:
                return httpx.Response(200, json=submissions[sid])
            return httpx.Response(404, json={"error": "not_found"})
        # GET /v1/submissions/{id}/files/{file_id}/content
        if "/files/" in path and path.endswith("/content"):
            parts = path.split("/")
            file_id = parts[-2]
            if file_id in contents:
                return httpx.Response(
                    200,
                    content=contents[file_id].encode(),
                    headers={"content-type": "text/plain"},
                )
            return httpx.Response(404)
        return httpx.Response(404)

    return handler


@pytest.mark.asyncio
async def test_fetch_one_returns_files(monkeypatch):
    transport = httpx.MockTransport(_make_handler())
    fetcher = SubmissionFetcher(base_url="http://submission.local", token="test-token")

    # Wire mock transport into every async client this fetcher creates.
    real_async_client = httpx.AsyncClient

    def _patched(*args, **kwargs):
        kwargs["transport"] = transport
        return real_async_client(*args, **kwargs)

    monkeypatch.setattr(httpx, "AsyncClient", _patched)

    item = await fetcher.fetch_one(tenant_id="tnt_t", submission_id="sub_2")
    assert item is not None
    assert item.submission_id == "sub_2"
    assert item.author_display_name == "Bob"
    assert item.language == "python"
    assert len(item.files) == 2
    by_path = {f.path: f.content for f in item.files}
    assert "main.py" in by_path
    assert "util.py" in by_path
    assert "def g(x)" in by_path["main.py"]


@pytest.mark.asyncio
async def test_fetch_one_404(monkeypatch):
    transport = httpx.MockTransport(_make_handler())
    fetcher = SubmissionFetcher(base_url="http://submission.local")
    real_async_client = httpx.AsyncClient
    monkeypatch.setattr(
        httpx,
        "AsyncClient",
        lambda *a, **kw: real_async_client(*a, transport=transport, **kw),
    )
    item = await fetcher.fetch_one(tenant_id="tnt_t", submission_id="sub_404")
    assert item is None


@pytest.mark.asyncio
async def test_fetch_items_skips_missing(monkeypatch):
    transport = httpx.MockTransport(_make_handler())
    fetcher = SubmissionFetcher(base_url="http://submission.local")
    real_async_client = httpx.AsyncClient
    monkeypatch.setattr(
        httpx,
        "AsyncClient",
        lambda *a, **kw: real_async_client(*a, transport=transport, **kw),
    )
    items = await fetcher.fetch_items(
        tenant_id="tnt_t", submission_ids=["sub_1", "sub_404", "sub_2"]
    )
    assert {i.submission_id for i in items} == {"sub_1", "sub_2"}


@pytest.mark.asyncio
async def test_auth_header_attached(monkeypatch):
    captured_headers: list[dict[str, str]] = []

    def handler(request: httpx.Request) -> httpx.Response:
        captured_headers.append(dict(request.headers))
        if request.url.path == "/api/v1/submissions/sub_1":
            return httpx.Response(
                200,
                json={
                    "id": "sub_1",
                    "author_id": "usr_a",
                    "files": [],
                },
            )
        return httpx.Response(404)

    transport = httpx.MockTransport(handler)
    real_async_client = httpx.AsyncClient
    monkeypatch.setattr(
        httpx,
        "AsyncClient",
        lambda *a, **kw: real_async_client(*a, transport=transport, **kw),
    )
    fetcher = SubmissionFetcher(base_url="http://submission.local", token="abc-123")
    await fetcher.fetch_one(tenant_id="tnt_xyz", submission_id="sub_1")
    assert captured_headers
    h = captured_headers[0]
    assert h.get("authorization") == "Bearer abc-123"
    assert h.get("x-tenant-id") == "tnt_xyz"
