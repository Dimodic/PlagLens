"""Manual upload adapter — ZIP / CSV parsing (functional)."""
from __future__ import annotations

import csv
import io
import zipfile
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any, Dict, Iterable, List, Optional

import structlog

from integration_service.adapters.base import (
    ConnectionStatus,
    ImportResult,
    IntegrationAdapter,
    RemoteCourse,
)

logger = structlog.get_logger(__name__)


@dataclass
class ParsedSubmission:
    student_email: str
    assignment_slug: Optional[str] = None
    files: Dict[str, str] = field(default_factory=dict)  # filename -> content
    language: Optional[str] = None
    source_url: Optional[str] = None
    inline_code: Optional[str] = None


def parse_zip(data: bytes) -> List[ParsedSubmission]:
    """ZIP convention:
        upload.zip
          /assignment_slug/
            /student@email.com/
              main.py
              utils.py
    Files at the top-level (no assignment_slug) are still grouped per email
    in case the uploader chose the simpler form.
    """
    if not data:
        return []
    out: dict[tuple[Optional[str], str], ParsedSubmission] = {}
    with zipfile.ZipFile(io.BytesIO(data)) as zf:
        for info in zf.infolist():
            if info.is_dir():
                continue
            name = info.filename.replace("\\", "/").lstrip("/")
            parts = [p for p in name.split("/") if p]
            if len(parts) < 2:
                continue
            if len(parts) >= 3:
                assignment, email = parts[0], parts[1]
                rel = "/".join(parts[2:])
            else:
                assignment, email, rel = None, parts[0], parts[1]
            if "@" not in email:
                continue
            try:
                content = zf.read(info).decode("utf-8", errors="replace")
            except Exception:
                content = ""
            key = (assignment, email)
            if key not in out:
                out[key] = ParsedSubmission(
                    student_email=email, assignment_slug=assignment
                )
            out[key].files[rel] = content
    return list(out.values())


def parse_csv(data: bytes) -> List[ParsedSubmission]:
    """CSV columns: student_email, language, file_url? inline_code?"""
    if not data:
        return []
    text = data.decode("utf-8-sig", errors="replace")
    reader = csv.DictReader(io.StringIO(text))
    out: list[ParsedSubmission] = []
    for row in reader:
        email = (row.get("student_email") or "").strip()
        if not email or "@" not in email:
            continue
        out.append(
            ParsedSubmission(
                student_email=email,
                assignment_slug=(row.get("assignment_slug") or "").strip() or None,
                language=(row.get("language") or "").strip() or None,
                source_url=(row.get("file_url") or "").strip() or None,
                inline_code=(row.get("inline_code") or row.get("code") or "").strip() or None,
            )
        )
    return out


CSV_TEMPLATE_HEADERS = ("student_email", "assignment_slug", "language", "file_url", "inline_code")


def csv_template() -> str:
    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(CSV_TEMPLATE_HEADERS)
    writer.writerow(
        ("alice@example.com", "hw-01", "python", "https://example.com/alice.py", "")
    )
    return buf.getvalue()


def csv_schema() -> dict[str, Any]:
    return {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "title": "PlagLens manual CSV import",
        "type": "object",
        "properties": {
            "student_email": {"type": "string", "format": "email"},
            "assignment_slug": {"type": "string"},
            "language": {"type": "string"},
            "file_url": {"type": "string", "format": "uri"},
            "inline_code": {"type": "string"},
        },
        "required": ["student_email"],
    }


class ManualAdapter(IntegrationAdapter):
    kind = "manual"

    async def test_connection(self, config: Any) -> ConnectionStatus:  # noqa: ARG002
        return ConnectionStatus(ok=True, detail="Manual adapter is always available")

    async def list_remote_courses(self, config: Any) -> List[RemoteCourse]:  # noqa: ARG002
        return []

    async def import_submissions(
        self,
        config: Any,
        scope: Dict[str, Any],
        since: Optional[datetime],
    ) -> ImportResult:  # noqa: ARG002
        # Manual adapter is fed via direct upload endpoints, so a sync run is a no-op.
        return ImportResult()

    @staticmethod
    def parsed_iter(data: bytes, kind: str) -> Iterable[ParsedSubmission]:
        if kind == "zip":
            return parse_zip(data)
        if kind == "csv":
            return parse_csv(data)
        raise ValueError(f"Unsupported manual upload kind: {kind}")
