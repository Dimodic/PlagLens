"""Roles & permissions schemas."""
from __future__ import annotations

from pydantic import BaseModel, Field


class RoleOut(BaseModel):
    role: str
    description: str | None = None


class RolePermissionsOut(BaseModel):
    role: str
    permissions: list[str] = Field(default_factory=list)


class RoleAssignRequest(BaseModel):
    role: str
