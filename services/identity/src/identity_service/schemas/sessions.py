"""Session list schemas."""
from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel


class SessionOut(BaseModel):
    id: str
    user_id: str
    ip: str | None = None
    user_agent: str | None = None
    created_at: datetime
    last_used_at: datetime
    expires_at: datetime
    revoked_at: datetime | None = None
    is_current: bool = False
