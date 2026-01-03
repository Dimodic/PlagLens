"""Shared schema fragments used across modules."""
from __future__ import annotations

from pydantic import BaseModel


class AuthorRef(BaseModel):
    id: str | None = None
    display_name: str | None = None


class ArtifactLink(BaseModel):
    html_url: str | None = None
    json_url: str | None = None
    archive_url: str | None = None


class PageInfo(BaseModel):
    next_cursor: str | None = None
    has_more: bool = False
    limit: int = 50


class OperationCreated(BaseModel):
    operation_id: str
    status_url: str
