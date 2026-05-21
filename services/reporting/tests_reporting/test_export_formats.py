"""Format encoders: CSV, XLSX, JSON, PDF, Google Sheets sync."""
from __future__ import annotations

import json

import pytest

from reporting_service.exports.builders.base import BuilderResult
from reporting_service.exports.formats.csv import to_csv
from reporting_service.exports.formats.google_sheets import (
    InMemoryGoogleSheetsClient,
    sync_to_sheet,
)
from reporting_service.exports.formats.json import stream_json, to_json
from reporting_service.exports.formats.pdf import to_pdf
from reporting_service.exports.formats.xlsx import to_xlsx


def _result():
    return BuilderResult(
        title="Demo",
        columns=["id", "score", "max_similarity"],
        rows=[
            {"id": "u1", "score": 90, "max_similarity": 0.95},
            {"id": "u2", "score": 40, "max_similarity": 0.10},
        ],
        metadata={"generated_at": "now"},
    )


def test_csv_format():
    blob, ct = to_csv(_result())
    text = blob.decode("utf-8")
    assert ct.startswith("text/csv")
    assert "id,score,max_similarity" in text
    assert "u1,90,0.95" in text
    assert text.startswith("﻿")  # BOM for Excel compatibility


def test_xlsx_format():
    blob, ct = to_xlsx(_result())
    assert ct.startswith("application/vnd.openxmlformats")
    # Magic bytes for ZIP/XLSX
    assert blob[:2] == b"PK"


def test_json_format():
    blob, ct = to_json(_result())
    assert ct == "application/json"
    body = json.loads(blob.decode())
    assert body["title"] == "Demo"
    assert len(body["rows"]) == 2


def test_pdf_format():
    blob, ct = to_pdf(_result())
    assert ct == "application/pdf"
    assert blob[:5] == b"%PDF-"


def test_stream_json_yields_chunks():
    chunks = list(stream_json(_result()))
    assembled = b"".join(chunks)
    body = json.loads(assembled.decode())
    assert body["columns"] == ["id", "score", "max_similarity"]


@pytest.mark.asyncio
async def test_google_sheets_sync_to_inmemory():
    client = InMemoryGoogleSheetsClient()
    resp = await sync_to_sheet(client, "spread-1", "MySheet", _result())
    assert resp["sheet"] == "MySheet"
    assert "spread-1" in client.spreadsheets
    rows = client.spreadsheets["spread-1"]["MySheet"]
    assert rows[0] == ["id", "score", "max_similarity"]
    assert len(rows) == 3  # header + 2 rows
