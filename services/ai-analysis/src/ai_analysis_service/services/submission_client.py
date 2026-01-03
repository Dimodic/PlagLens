"""HTTP client for the Submission Service.

Two jobs:
  • the curate-as-feedback flow —
    ``POST {SUBMISSION_SERVICE_URL}/api/v1/submissions/{id}/feedback:from-llm``;
  • fetching a submission's source code so the orchestrator can analyse
    it even when the caller (notably the batch endpoint) didn't pass any
    ``code`` in the request.

Service-to-service auth: we mint a short-lived admin-scoped RS256 JWT
with the shared private key (same pattern as the plagiarism service's
``submission_fetcher``). The submission service's file endpoints require
a real bearer token — ``X-Tenant-Id`` alone isn't enough there.
"""
from __future__ import annotations

import logging
import os
import time
from typing import Any

import httpx
import jwt

from ..config import get_settings

logger = logging.getLogger(__name__)

# tenant_id -> (token, expiry_epoch)
_SERVICE_TOKENS: dict[str, tuple[str, float]] = {}
_SERVICE_TOKEN_TTL_S = 30 * 60


def _service_token(tenant_id: str) -> str | None:
    """Mint (or reuse) a short-lived admin-scoped JWT for service-to-service
    calls. Returns ``None`` if the private key can't be loaded."""
    now = time.time()
    cached = _SERVICE_TOKENS.get(tenant_id)
    if cached is not None and cached[1] > now + 60:
        return cached[0]
    key_path = (
        os.environ.get("JWT_PRIVATE_KEY_PATH") or "/run/secrets/jwt_private.pem"
    )
    try:
        with open(key_path, encoding="utf-8") as fh:
            private_key = fh.read()
    except OSError as exc:
        logger.warning("service jwt key missing at %s: %s", key_path, exc)
        return None
    issuer = os.environ.get("JWT_ISSUER") or "https://plaglens.local"
    audience = os.environ.get("JWT_AUDIENCE") or "plaglens-api"
    algorithm = os.environ.get("JWT_ALGORITHM") or "RS256"
    iat = int(now)
    exp = iat + _SERVICE_TOKEN_TTL_S + 5 * 60
    payload = {
        "sub": "svc_ai_analysis",
        "iss": issuer,
        "aud": audience,
        "iat": iat,
        "exp": exp,
        "tenant_id": tenant_id,
        "global_role": "super_admin",  # service principal — bypasses RBAC
        "course_roles": {},
    }
    try:
        token = jwt.encode(payload, private_key, algorithm=algorithm)
    except Exception as exc:  # noqa: BLE001
        logger.warning("service jwt sign failed: %s", exc)
        return None
    if isinstance(token, bytes):
        token = token.decode("utf-8")
    _SERVICE_TOKENS[tenant_id] = (token, float(exp))
    return token


class SubmissionClient:
    def __init__(self, transport: httpx.AsyncBaseTransport | None = None) -> None:
        self._transport = transport
        self._settings = get_settings()

    def _build_client(self) -> httpx.AsyncClient:
        kwargs: dict[str, Any] = {
            "base_url": self._settings.SUBMISSION_SERVICE_URL.rstrip("/"),
            "timeout": 15.0,
        }
        if self._transport is not None:
            kwargs["transport"] = self._transport
        return httpx.AsyncClient(**kwargs)

    def _auth_headers(self, tenant_id: str) -> dict[str, str]:
        h = {"X-Tenant-Id": tenant_id}
        token = _service_token(tenant_id)
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
            except httpx.RequestError as exc:
                logger.exception("submission service unreachable")
                raise SubmissionClientError(f"submission unreachable: {exc}") from exc
            if resp.status_code >= 400:
                raise SubmissionClientError(
                    f"submission returned {resp.status_code}: {resp.text}"
                )
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
            except httpx.RequestError as exc:
                logger.warning("submission service unreachable: %s", exc)
                return ""
            if resp.status_code >= 400:
                logger.warning(
                    "submission detail %s returned %s",
                    submission_id,
                    resp.status_code,
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
                    cresp.raise_for_status()
                except httpx.HTTPError as exc:
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
