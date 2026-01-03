"""Builder: audit log proxy snapshot. Pulls from in-memory audit proxy."""
from __future__ import annotations

from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from .base import BuilderResult


async def build_audit_log(
    session: AsyncSession, scope: dict[str, Any], options: dict[str, Any]
) -> BuilderResult:
    rows = list(scope.get("entries", []))
    columns = ["timestamp", "actor", "action", "resource", "result"]
    return BuilderResult(
        title="Audit Log",
        columns=columns,
        rows=rows,
        metadata={"period": scope.get("period")},
    )
