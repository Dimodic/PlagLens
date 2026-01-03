"""Google Sheets sync endpoints."""
from __future__ import annotations

import pytest


@pytest.mark.asyncio
async def test_course_sheets_sync(client_factory, teacher_principal):
    async with client_factory(teacher_principal) as cli:
        r = await cli.post("/api/v1/courses/course-1/exports/google-sheets/sync")
        assert r.status_code == 202
        body = r.json()
        assert body["spreadsheet_id"] == "course-course-1-sheet"
        assert "Course Summary" in body["sheet_titles"]


@pytest.mark.asyncio
async def test_assignment_sheets_sync(client_factory, teacher_principal):
    async with client_factory(teacher_principal) as cli:
        r = await cli.post("/api/v1/assignments/asgn-1/exports/google-sheets/sync")
        assert r.status_code == 202
        body = r.json()
        assert body["spreadsheet_id"] == "assn-asgn-1-sheet"


@pytest.mark.asyncio
async def test_last_sync(client_factory, teacher_principal):
    async with client_factory(teacher_principal) as cli:
        r = await cli.get("/api/v1/courses/course-1/exports/google-sheets/last-sync")
        assert r.status_code == 200
        assert r.json()["course_id"] == "course-1"
