"""Submission fetcher.

Pulls submission file content from the Submission Service over HTTP. The
orchestrator calls ``fetch_items()`` before passing the bundle to a provider.

Endpoints used (per ``05-SUBMISSION.md``):
    GET /api/v1/submissions/{id}                     → submission metadata + file list
    GET /api/v1/submissions/{id}/files/{file_id}/content → raw file bytes
    GET /api/v1/assignments/{id}/submissions/latest-per-student → IDs of latest per student

Auth: service-to-service. Submission rejects unauthenticated callers, and
we have no end-user JWT available inside the background scheduler tick.
We sign a short-lived admin-scoped JWT with the shared private key (the
same one identity-service uses) and cache it in-process for 30 min.

We surface a small, fully async HTTPX client. In tests it is replaceable
via ``set_submission_fetcher``.
"""
from __future__ import annotations

import os
import time
from collections.abc import Iterable
from typing import Any

import httpx
import jwt as pyjwt

from ..common.logging import get_logger
from ..config import settings
from ..providers.base import SubmissionFile, SubmissionItem

log = get_logger(__name__)

# Per-tenant cache of service tokens. A run can target a different tenant
# from the one we minted a token for last time, so we need separate
# entries — a global cache would return a tnt_A token in response to a
# tnt_B query and the API would refuse with cross-tenant 403.
_SERVICE_TOKENS: dict[str, tuple[str, float]] = {}
_SERVICE_TOKEN_TTL_S = 30 * 60  # 30 min — well under any reasonable jwt exp


def _service_token(tenant_id: str) -> str | None:
    """Mint (or reuse) a short-lived admin-scoped JWT for service-to-service
    calls to the submission service. Returns ``None`` if the private key
    can't be loaded — the caller will fall back to unauthenticated, which
    yields 401 in dev but at least doesn't raise."""
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
        log.warning("service_jwt_key_missing", path=key_path, error=str(exc))
        return None
    issuer = os.environ.get("JWT_ISSUER") or "https://plaglens.local"
    audience = os.environ.get("JWT_AUDIENCE") or "plaglens-api"
    algorithm = os.environ.get("JWT_ALGORITHM") or "RS256"
    iat = int(now)
    exp = iat + _SERVICE_TOKEN_TTL_S + 5 * 60  # small slack
    payload = {
        "sub": "svc_plagiarism",
        "iss": issuer,
        "aud": audience,
        "iat": iat,
        "exp": exp,
        "tenant_id": tenant_id,
        "global_role": "super_admin",  # service principal — bypasses RBAC
        "course_roles": {},
    }
    try:
        token = pyjwt.encode(payload, private_key, algorithm=algorithm)
    except Exception as exc:  # noqa: BLE001
        log.warning("service_jwt_sign_failed", error=str(exc))
        return None
    if isinstance(token, bytes):
        token = token.decode("utf-8")
    _SERVICE_TOKENS[tenant_id] = (token, float(exp))
    return token


class SubmissionFetcher:
    """HTTP client for the Submission Service."""

    def __init__(
        self,
        *,
        base_url: str | None = None,
        token: str | None = None,
        timeout: float | None = None,
    ) -> None:
        self.base_url = (base_url or settings.submission_service_base).rstrip("/")
        self.token = token if token is not None else settings.submission_service_token
        self.timeout = timeout or float(settings.submission_fetch_timeout_seconds)

    def _headers(self, tenant_id: str) -> dict[str, str]:
        h = {"Accept": "application/json", "X-Tenant-Id": tenant_id}
        # Prefer an explicitly-configured token (e.g. tests / prod
        # rotating creds). Otherwise mint a short-lived service JWT via
        # the shared private key so the background scheduler can fetch
        # submissions on behalf of a teacher who initiated the run.
        token = self.token or _service_token(tenant_id)
        if token:
            h["Authorization"] = f"Bearer {token}"
        return h

    async def fetch_one(
        self, *, tenant_id: str, submission_id: str
    ) -> SubmissionItem | None:
        """Fetch a single submission with its files. Returns ``None`` on 404."""
        url = f"{self.base_url}/api/v1/submissions/{submission_id}"
        async with httpx.AsyncClient(timeout=self.timeout) as client:
            resp = await client.get(url, headers=self._headers(tenant_id))
            if resp.status_code == 404:
                return None
            resp.raise_for_status()
            meta = resp.json()
            files: list[SubmissionFile] = []
            for f in meta.get("files", []) or []:
                fid = f.get("id") or f.get("file_id")
                fpath = f.get("path") or f.get("name") or f.get("filename") or ""
                if not fid:
                    continue
                content = await self._fetch_content(
                    client, tenant_id=tenant_id, submission_id=submission_id, file_id=fid
                )
                files.append(SubmissionFile(path=fpath, content=content))
            # Submission service returns three possible name fields,
            # depending on author origin:
            #   * author.display_name   — real PlagLens user (linked to identity)
            #   * author_label          — external participant (e.g. YC import,
            #                             stores "Петров Александр Сергеевич")
            #   * author_id (yc:NNN)    — raw fallback, opaque
            # Pick the first non-empty so the cluster map shows ФИО rather
            # than ``yc:12345`` / ``sub_abcdef``.
            author_obj = meta.get("author") or {}
            display_name = (
                (author_obj.get("display_name") if isinstance(author_obj, dict) else None)
                or meta.get("author_display_name")
                or meta.get("author_label")
            )
            return SubmissionItem(
                submission_id=submission_id,
                author_id=meta.get("author_id") or meta.get("user_id"),
                author_display_name=display_name,
                course_id=meta.get("course_id"),
                assignment_id=meta.get("assignment_id"),
                language=meta.get("language"),
                files=files,
            )

    async def _fetch_content(
        self,
        client: httpx.AsyncClient,
        *,
        tenant_id: str,
        submission_id: str,
        file_id: str,
    ) -> str:
        url = (
            f"{self.base_url}/api/v1/submissions/{submission_id}"
            f"/files/{file_id}/content"
        )
        try:
            resp = await client.get(url, headers=self._headers(tenant_id))
            resp.raise_for_status()
        except httpx.HTTPError as exc:
            log.warning(
                "submission_fetch_failed",
                submission_id=submission_id,
                file_id=file_id,
                error=str(exc),
            )
            return ""
        # Submission Service returns binary; we decode best-effort.
        try:
            return resp.text
        except UnicodeDecodeError:
            return resp.content.decode("utf-8", errors="replace")

    async def fetch_items(
        self, *, tenant_id: str, submission_ids: Iterable[str]
    ) -> list[SubmissionItem]:
        """Fetch all submissions in the iterable. Skips 404s."""
        items: list[SubmissionItem] = []
        for sid in submission_ids:
            item = await self.fetch_one(tenant_id=tenant_id, submission_id=sid)
            if item is not None:
                items.append(item)
        return items

    async def list_latest_per_student(
        self, *, tenant_id: str, assignment_id: str
    ) -> list[str]:
        """Return submission_ids for the assignment's latest-per-student feed.
        Used by the API to auto-fill ``scope.submission_ids`` when the
        caller asks to run plagiarism on a whole assignment without naming
        individual submissions."""
        url = (
            f"{self.base_url}/api/v1/assignments/{assignment_id}"
            f"/submissions/latest-per-student"
        )
        async with httpx.AsyncClient(timeout=self.timeout) as client:
            resp = await client.get(url, headers=self._headers(tenant_id))
            if resp.status_code == 404:
                return []
            resp.raise_for_status()
            body = resp.json()
        # The endpoint may return either a bare list or a paginated dict.
        rows: list[Any]
        if isinstance(body, list):
            rows = body
        elif isinstance(body, dict):
            rows = list(body.get("data") or [])
        else:
            rows = []
        return [str(r["id"]) for r in rows if isinstance(r, dict) and r.get("id")]


# ---------------------------------------------------------------------------
# Module-level singleton — replaceable for tests.
# ---------------------------------------------------------------------------
_fetcher: SubmissionFetcher | None = None


def get_submission_fetcher() -> SubmissionFetcher:
    global _fetcher
    if _fetcher is None:
        _fetcher = SubmissionFetcher()
    return _fetcher


def set_submission_fetcher(fetcher: Any) -> None:
    """Test helper."""
    global _fetcher
    _fetcher = fetcher
