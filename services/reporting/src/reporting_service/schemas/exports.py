"""Export-related request and response schemas."""
from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field

ExportKind = Literal[
    "assignment_grades",
    "course_summary",
    "plagiarism_report",
    "ai_analysis_summary",
    "audit_log",
    "tenant_usage",
]
ExportFormat = Literal["csv", "xlsx", "json", "pdf", "google_sheets"]
ExportStatus = Literal["queued", "running", "completed", "failed", "cancelled"]


class ExportOptions(BaseModel):
    model_config = ConfigDict(extra="allow")
    include_columns: list[str] | None = None
    include_late_marks: bool = True
    include_feedback_visible: bool = False
    include_all_versions: bool = False
    language_filter: str | None = None
    anonymize: bool = False
    with_feedback: bool = False


class ExportCreateRequest(BaseModel):
    kind: ExportKind
    format: ExportFormat
    scope: dict[str, Any] = Field(default_factory=dict)
    options: ExportOptions = Field(default_factory=ExportOptions)


class ExportRead(BaseModel):
    id: str
    operation_id: str
    kind: ExportKind
    format: ExportFormat
    status: ExportStatus
    scope: dict[str, Any]
    options: dict[str, Any]
    artifact_filename: str | None
    artifact_size_bytes: int | None
    expiry_at: datetime | None
    triggered_by: str
    created_at: datetime
    started_at: datetime | None
    finished_at: datetime | None
    error: dict[str, Any] | None


class ExportDownload(BaseModel):
    url: str
    expires_in: int
    filename: str
    content_type: str


class ScheduledExportCreate(BaseModel):
    kind: ExportKind
    format: ExportFormat
    target: Literal["file_download", "google_sheets"] = "file_download"
    cron: str = Field(min_length=5, max_length=64)
    scope: dict[str, Any] = Field(default_factory=dict)
    enabled: bool = True


class ScheduledExportPatch(BaseModel):
    cron: str | None = None
    enabled: bool | None = None
    scope: dict[str, Any] | None = None


class ScheduledExportRead(BaseModel):
    id: str
    course_id: str
    kind: ExportKind
    format: ExportFormat
    target: str
    cron: str
    scope: dict[str, Any]
    enabled: bool
    last_run_at: datetime | None
    next_run_at: datetime | None
    created_by: str
    created_at: datetime


class GoogleSheetsSyncResponse(BaseModel):
    operation_id: str
    spreadsheet_id: str | None = None
    sheet_titles: list[str] = Field(default_factory=list)
    last_sync_at: datetime | None = None
