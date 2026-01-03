"""Adapter unit tests — direct (no FastAPI)."""
from __future__ import annotations

import io
import zipfile
from types import SimpleNamespace

import pytest
import respx
from httpx import Response

from integration_service.adapters import get_adapter
from integration_service.adapters.manual import csv_schema, parse_csv, parse_zip
from integration_service.adapters.stepik import StepikAdapter
from integration_service.config import get_settings


async def test_manual_adapter_test_connection():
    a = get_adapter("manual")
    res = await a.test_connection(SimpleNamespace(settings={}))
    assert res.ok is True


def test_parse_zip_basic():
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as zf:
        zf.writestr("hw-1/alice@x.com/main.py", "code")
        zf.writestr("hw-1/bob@x.com/main.py", "code")
    parsed = parse_zip(buf.getvalue())
    assert len(parsed) == 2
    emails = {x.student_email for x in parsed}
    assert emails == {"alice@x.com", "bob@x.com"}


def test_parse_csv_basic():
    csv_data = (
        b"student_email,language,inline_code\n"
        b"alice@x.com,python,print(1)\n"
        b"bob@x.com,python,print(2)\n"
    )
    parsed = parse_csv(csv_data)
    assert len(parsed) == 2
    assert parsed[0].language == "python"


def test_csv_schema_shape():
    s = csv_schema()
    assert "properties" in s
    assert "student_email" in s["properties"]


@pytest.mark.asyncio
async def test_stepik_adapter_connection_no_token():
    a = StepikAdapter()
    res = await a.test_connection(SimpleNamespace(settings={}))
    assert res.ok is False


@pytest.mark.asyncio
async def test_stepik_import_submissions_paginates():
    settings = get_settings()
    base = settings.stepik_api_base_url.rstrip("/")
    a = StepikAdapter()
    cfg = SimpleNamespace(
        settings={"static_token": "tok", "stepik_course_ids": [1]}, kind="stepik"
    )
    pages = [
        Response(200, json={"submissions": [{"id": 1, "time": "2026-04-01"}], "meta": {"has_next": True}}),
        Response(200, json={"submissions": [{"id": 2, "time": "2026-04-02"}], "meta": {"has_next": False}}),
    ]
    counter = {"i": 0}

    def _next(_request):
        i = counter["i"]
        counter["i"] += 1
        return pages[min(i, len(pages) - 1)]

    with respx.mock(assert_all_called=False) as m:
        m.get(base + "/submissions").mock(side_effect=_next)
        result = await a.import_submissions(cfg, {"step_id": 7}, since=None)
    assert result.imported == 2
    assert result.cursor.get("last_imported_at") == "2026-04-02"
