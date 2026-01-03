"""Shared schemas: pagination, operation, problem."""
from __future__ import annotations

from datetime import datetime
from typing import Any, Generic, List, Optional, TypeVar

from pydantic import BaseModel, Field

T = TypeVar("T")


class Pagination(BaseModel):
    next_cursor: Optional[str] = None
    has_more: bool = False
    limit: int = 50


class Page(BaseModel, Generic[T]):
    data: List[T]
    pagination: Pagination


class OperationOut(BaseModel):
    id: str
    kind: str
    status: str = "queued"
    progress: dict[str, Any] = Field(default_factory=dict)
    started_at: Optional[datetime] = None
    finished_at: Optional[datetime] = None
    result_url: Optional[str] = None
    error: Optional[dict[str, Any]] = None
    metadata: dict[str, Any] = Field(default_factory=dict)


class Problem(BaseModel):
    type: str
    title: str
    status: int
    detail: Optional[str] = None
    code: str
    request_id: Optional[str] = None
