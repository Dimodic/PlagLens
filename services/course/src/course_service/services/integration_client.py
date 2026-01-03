"""Tiny httpx wrapper for cross-service calls to the Integration Service.

Per spec §10.6: validating ``external_bindings`` (e.g. Stepik step IDs) when
creating an assignment. The wrapper is best-effort — failures degrade to a warning
so the service stays usable while Integration is down.
"""

from __future__ import annotations

from typing import Any

import httpx
import structlog

from ..config import Settings

logger = structlog.get_logger(__name__)


class IntegrationClient:
    def __init__(self, settings: Settings, client: httpx.AsyncClient | None = None) -> None:
        self.settings = settings
        self._client = client

    async def _http(self) -> httpx.AsyncClient:
        if self._client is not None:
            return self._client
        self._client = httpx.AsyncClient(
            base_url=self.settings.integration_service_url,
            timeout=self.settings.http_client_timeout_s,
        )
        return self._client

    async def close(self) -> None:
        if self._client is not None:
            await self._client.aclose()
            self._client = None

    async def validate_external_binding(
        self,
        *,
        system: str,
        external_assignment_id: str,
        tenant_id: str,
        bearer_token: str | None = None,
    ) -> dict[str, Any]:
        client = await self._http()
        headers = {"X-Tenant-Id": tenant_id}
        if bearer_token:
            headers["Authorization"] = f"Bearer {bearer_token}"
        url = f"/api/v1/integrations/{system}/steps/{external_assignment_id}/validate"
        try:
            resp = await client.get(url, headers=headers)
        except httpx.HTTPError as exc:
            logger.warning(
                "integration.validate_failed", system=system, error=str(exc)
            )
            return {"valid": True, "warning": "integration-service-unreachable"}
        if resp.status_code >= 400:
            logger.warning(
                "integration.validate_rejected",
                system=system,
                status=resp.status_code,
            )
            return {"valid": False, "status": resp.status_code, "body": resp.text}
        return resp.json() if resp.content else {"valid": True}
