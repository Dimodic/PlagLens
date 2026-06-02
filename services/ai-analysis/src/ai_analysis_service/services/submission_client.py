"""HTTP client for the Submission Service.

Two jobs:
  • the curate-as-feedback flow —
    ``POST {SUBMISSION_SERVICE_URL}/api/v1/submissions/{id}/feedback:from-llm``;
  • fetching a submission's source code so the orchestrator can analyse
    it even when the caller (notably the batch endpoint) didn't pass any
    ``code`` in the request.

Service-to-service auth: we mint a short-lived admin-scoped RS256 JWT via
the shared :func:`plaglens_common.service_token.mint_service_jwt` (same
pattern as the plagiarism service's ``submission_fetcher``). The submission
service's file endpoints require a real bearer token — ``X-Tenant-Id``
alone isn't enough there.

Transport is the shared :class:`plaglens_common.service_client.ServiceClient`
(``X-Request-Id`` propagation, Problem→error translation). Retries are
disabled here to preserve the previous raw-httpx behaviour (a single attempt
per call); the feedback POST and the best-effort code fetch keep their own
error handling.
"""
from __future__ import annotations

import logging
from typing import Any

import httpx
from plaglens_common.errors import PlagLensError
from plaglens_common.service_client import ServiceClient
from plaglens_common.service_token import mint_service_jwt

from ..config import get_settings

logger = logging.getLogger(__name__)

# Token lifetime preserved from the previous local minting: 30 min + 5 min skew.
_SERVICE_TOKEN_TTL_S = 30 * 60 + 5 * 60


class SubmissionClient:
    def __init__(self, transport: httpx.AsyncBaseTransport | None = None) -> None:
        self._transport = transport
        self._settings = get_settings()

    def _build_client(self) -> ServiceClient:
        kwargs: dict[str, Any] = {
            "base_url": self._settings.SUBMISSION_SERVICE_URL.rstrip("/"),
            "timeout": 15.0,
        }
        if self._transport is not None:
            kwargs["transport"] = self._transport
        # Single attempt per request — the previous raw-httpx client did not
        # retry; keep that so semantics (and test expectations) are unchanged.
        return ServiceClient(
            provider="submission",
            max_retries=0,
            client=httpx.AsyncClient(**kwargs),
        )

    def _auth_headers(self, tenant_id: str) -> dict[str, str]:
        h = {"X-Tenant-Id": tenant_id}
        token = mint_service_jwt(
            subject="svc_ai_analysis",
            tenant_id=tenant_id,
            ttl_seconds=_SERVICE_TOKEN_TTL_S,
        )
        if token:
            h["Authorization"] = f"Bearer {token}"
        return h

    async def create_feedback_from_llm(
        self,
        submission_id: str,
        *,
        tenant_id: str,
        actor_id: str,
        body: dict[str, Any],
    ) -> dict[str, Any]:
        async with self._build_client() as client:
            try:
                resp = await client.post(
                    f"/api/v1/submissions/{submission_id}/feedback:from-llm",
                    json=body,
                    headers={
                        "X-Tenant-Id": tenant_id,
                        "X-Actor-Id": actor_id,
                    },
                )
            except PlagLensError as exc:
                # Covers transport errors, timeouts, open circuit and any
                # >=400 the submission service returned (ServiceClient maps
                # Problem responses to typed errors). Surface the same
                # SubmissionClientError the caller already handles.
                logger.warning("submission feedback call failed: %s", exc)
                raise SubmissionClientError(f"submission call failed: {exc}") from exc
            try:
                return resp.json()
            except ValueError:
                return {}

    async def fetch_submission_code(
        self, submission_id: str, *, tenant_id: str
    ) -> str:
        """Fetch a submission's source: GET the detail (→ file list), then
        each file's content, concatenated. Best-effort — returns ``""`` if
        the submission is gone or the service is unreachable, so analysis
        degrades to "no code" instead of crashing."""
        async with self._build_client() as client:
            headers = self._auth_headers(tenant_id)
            try:
                resp = await client.get(
                    f"/api/v1/submissions/{submission_id}", headers=headers
                )
            except PlagLensError as exc:
                logger.warning(
                    "submission detail %s fetch failed: %s", submission_id, exc
                )
                return ""
            try:
                meta = resp.json()
            except ValueError:
                return ""

            files = meta.get("files") or []
            parts: list[str] = []
            for f in files:
                file_id = f.get("id") or f.get("file_id")
                if not file_id:
                    continue
                path = f.get("path") or f.get("name") or ""
                try:
                    cresp = await client.get(
                        f"/api/v1/submissions/{submission_id}"
                        f"/files/{file_id}/content",
                        headers=headers,
                    )
                except PlagLensError as exc:
                    logger.warning(
                        "file content fetch failed (%s/%s): %s",
                        submission_id,
                        file_id,
                        exc,
                    )
                    continue
                try:
                    text = cresp.text
                except UnicodeDecodeError:
                    text = cresp.content.decode("utf-8", errors="replace")
                # Multi-file submissions get a small path header so the
                # LLM can tell where one file ends and the next begins.
                if len(files) > 1 and path:
                    parts.append(f"// ==== {path} ====\n{text}")
                else:
                    parts.append(text)
            return "\n\n".join(parts)


class SubmissionClientError(RuntimeError):
    pass
