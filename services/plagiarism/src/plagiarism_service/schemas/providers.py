"""Provider admin schemas (§F)."""
from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field


class ProviderAdmin(BaseModel):
    provider: str
    enabled: bool = True
    default_for_tenant: bool = False
    settings: dict[str, Any] = Field(default_factory=dict)
    capabilities: dict[str, Any] = Field(default_factory=dict)


class ProviderUpdate(BaseModel):
    enabled: bool | None = None
    settings: dict[str, Any] | None = None
    credentials_secret_ref: str | None = None


class ProviderTestResponse(BaseModel):
    provider: str
    ok: bool
    detail: str | None = None
    capabilities: dict[str, Any] = Field(default_factory=dict)


class ProviderUsage(BaseModel):
    provider: str
    runs_total: int = 0
    runs_completed: int = 0
    runs_failed: int = 0
    avg_duration_seconds: float = 0.0
    last_run_at: str | None = None
