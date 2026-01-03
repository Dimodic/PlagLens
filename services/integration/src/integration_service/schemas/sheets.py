"""Google Sheets link schemas."""
from __future__ import annotations

from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel, Field


class GoogleSheetsLinkCreate(BaseModel):
    spreadsheet_id: str
    sheet_name: str
    columns_mapping: dict[str, Any] = Field(default_factory=dict)


class GoogleSheetsLinkUpdate(BaseModel):
    spreadsheet_id: Optional[str] = None
    sheet_name: Optional[str] = None
    columns_mapping: Optional[dict[str, Any]] = None


class GoogleSheetsLinkOut(BaseModel):
    id: str
    course_id: str
    tenant_id: str
    spreadsheet_id: str
    sheet_name: str
    columns_mapping: dict[str, Any]
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True
