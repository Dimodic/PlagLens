"""Google Sheets adapter (skeleton)."""
from __future__ import annotations

import json
import os
from datetime import datetime
from typing import Any, Dict, List, Optional

import structlog

from integration_service.adapters.base import (
    ConnectionStatus,
    ImportResult,
    IntegrationAdapter,
    RemoteCourse,
)
from integration_service.config import get_settings

logger = structlog.get_logger(__name__)


def load_service_account_info() -> Optional[dict[str, Any]]:
    s = get_settings()
    path = s.google_service_account_json_path
    if not path:
        return None
    if not os.path.exists(path):
        logger.warning("google.sa_path_missing", path=path)
        return None
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except Exception as exc:  # pragma: no cover
        logger.warning("google.sa_load_failed", error=str(exc))
        return None


class GoogleSheetsAdapter(IntegrationAdapter):
    kind = "google_sheets"

    async def test_connection(self, config: Any) -> ConnectionStatus:  # noqa: ARG002
        info = load_service_account_info()
        if info is None:
            return ConnectionStatus(
                ok=False,
                detail="GOOGLE_SERVICE_ACCOUNT_JSON_PATH not set or unreadable",
            )
        return ConnectionStatus(
            ok=True,
            metadata={"service_account_email": info.get("client_email")},
        )

    async def list_remote_courses(self, config: Any) -> List[RemoteCourse]:  # noqa: ARG002
        return []

    async def import_submissions(
        self,
        config: Any,
        scope: Dict[str, Any],
        since: Optional[datetime],
    ) -> ImportResult:  # noqa: ARG002
        # Sheet → submissions is not the import direction; reports go through Reporting.
        return ImportResult()

    async def list_spreadsheets(self) -> list[dict[str, Any]]:
        """Stub — real implementation calls Drive API. We return placeholder."""
        info = load_service_account_info()
        if info is None:
            return []
        return [
            {
                "spreadsheet_id": "placeholder-sheet-id",
                "name": "Demo PlagLens Reports",
                "owner": info.get("client_email"),
            }
        ]

    async def validate_access(self, spreadsheet_id: str) -> ConnectionStatus:
        info = load_service_account_info()
        if info is None:
            return ConnectionStatus(
                ok=False,
                detail="Service account credentials not configured",
            )
        # In production: use sheets API to fetch spreadsheet metadata.
        return ConnectionStatus(
            ok=True,
            metadata={
                "spreadsheet_id": spreadsheet_id,
                "service_account_email": info.get("client_email"),
            },
        )
