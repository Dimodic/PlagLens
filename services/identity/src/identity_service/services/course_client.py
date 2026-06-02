"""HTTP client for course-submission membership operations.

When a user redeems an invitation that carries a ``course_id``, identity has
to tell course-submission to add the user as a member with the right
course-role. We use the existing service-to-service auth flow:

1. Mint a short-lived admin-scoped JWT via the shared
   :func:`plaglens_common.service_token.mint_service_jwt` helper (subject
   ``svc_identity``). It signs with the shared private key course-submission
   verifies against and carries ``global_role=admin`` — sufficient because
   course-submission accepts admin-level writes from it for cross-service
   hand-offs.
2. Call ``POST /api/v1/courses/{course_id}/members`` (the standard members
   endpoint) with the user_id + role payload.

If course-submission rejects the call we surface a clean ``CourseClientError``
so the route handler can return ``502 UPSTREAM_UNAVAILABLE`` instead of a
generic 500.
"""
from __future__ import annotations

import logging
import os
from typing import Any

from plaglens_common.errors import ConflictError, PlagLensError
from plaglens_common.service_client import ServiceClient
from plaglens_common.service_token import mint_service_jwt

logger = logging.getLogger(__name__)


class CourseClientError(RuntimeError):
    """Raised when course-submission rejects or is unreachable."""


class CourseMembershipClient:
    def __init__(self, *, timeout_seconds: float = 5.0) -> None:
        # The course-submission upstream URL is not part of identity's settings
        # (identity doesn't usually need to know about it). Compose plumbs it
        # in via COURSE_SERVICE_BASE_URL / COURSE_BASE_URL env on the identity
        # container.
        self._base_url = os.environ.get(
            "COURSE_SERVICE_BASE_URL",
            os.environ.get("COURSE_BASE_URL", "http://course-submission:8000"),
        ).rstrip("/")
        self._timeout = timeout_seconds

    def _auth_headers(self, *, tenant_id: str) -> dict[str, str]:
        """Authorization header carrying the shared admin service JWT.

        The token impersonates the ``svc_identity`` principal with
        ``global_role=admin`` (centralized in
        :func:`plaglens_common.service_token.mint_service_jwt`), which lines up
        with course-submission's RBAC for cross-service writes. Returns an
        empty mapping when the signing key is unavailable — the downstream call
        then fails auth (401) and surfaces as a clean ``CourseClientError``.
        """
        headers: dict[str, str] = {"Content-Type": "application/json"}
        token = mint_service_jwt(subject="svc_identity", tenant_id=tenant_id)
        if token:
            headers["Authorization"] = f"Bearer {token}"
        return headers

    async def add_member(
        self,
        *,
        course_id: str,
        user_id: str,
        role: str,
        tenant_id: str,
    ) -> dict[str, Any]:
        url = f"/api/v1/courses/{course_id}/members"
        payload = {"user_id": user_id, "role": role}
        try:
            async with ServiceClient(
                self._base_url, provider="course-submission", timeout=self._timeout
            ) as client:
                resp = await client.post(
                    url, json=payload, headers=self._auth_headers(tenant_id=tenant_id)
                )
        except ConflictError:
            # Already a member — idempotent for redeem.
            logger.info(
                "course member add idempotent: user=%s course=%s role=%s",
                user_id,
                course_id,
                role,
            )
            return {
                "course_id": course_id,
                "user_id": user_id,
                "role": role,
                "already_member": True,
            }
        except PlagLensError as exc:
            raise CourseClientError(f"course-submission rejected: {exc}") from exc
        except Exception as exc:
            raise CourseClientError(f"transport failed: {exc}") from exc
        try:
            return resp.json()
        except Exception:
            return {"course_id": course_id, "user_id": user_id, "role": role}

    async def claim_external_submissions(
        self,
        *,
        user_id: str,
        tenant_id: str,
        external_author_id: str,
    ) -> int:
        """Backfill imported submissions from an external participant to a user.

        Mirrors :meth:`add_member`: mints an admin service JWT and POSTs to
        course-submission's collection-level claim action. The endpoint
        reassigns every ``yandex_contest`` submission whose ``author_id`` equals
        ``external_author_id`` (in the token's tenant) to ``user_id`` and
        returns ``{"claimed": N}``. We surface ``N`` (default 0). The path
        ``/submissions:claim-external`` is what the gateway routes to
        submission — ``/users/{id}/...`` would route to identity instead.
        """
        url = "/api/v1/submissions:claim-external"
        payload = {"user_id": user_id, "external_author_id": external_author_id}
        try:
            async with ServiceClient(
                self._base_url, provider="course-submission", timeout=self._timeout
            ) as client:
                resp = await client.post(
                    url, json=payload, headers=self._auth_headers(tenant_id=tenant_id)
                )
        except PlagLensError as exc:
            raise CourseClientError(f"course-submission rejected: {exc}") from exc
        except Exception as exc:
            raise CourseClientError(f"transport failed: {exc}") from exc
        try:
            return int(resp.json().get("claimed", 0))
        except Exception:
            return 0
