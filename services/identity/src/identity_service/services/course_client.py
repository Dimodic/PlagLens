"""HTTP client for course-submission membership operations.

When a user redeems an invitation that carries a ``course_id``, identity has
to tell course-submission to add the user as a member with the right
course-role. We use the existing service-to-service auth flow:

1. Mint a long-lived super_admin JWT via the local service-token endpoint
   (shared ``SERVICE_AUTH_SECRET`` header). The minted token is impersonating
   "system" — sufficient because course-submission accepts admin-level writes
   from it for cross-service hand-offs.
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

import httpx

from ..common.security import issue_access_token

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

    def _service_token(self, *, tenant_id: str, as_user_id: str) -> str:
        """Mint a short-lived admin JWT identity uses to talk to other svcs.

        We reuse ``issue_access_token`` directly — it signs with the same
        private key course-submission verifies against. The token impersonates
        the user we're adding, which lines up with course-submission's RBAC
        (the user is acting on their own membership).
        """
        return issue_access_token(
            user_id=as_user_id,
            tenant_id=tenant_id,
            global_role="admin",  # identity-side admin override
            course_roles={},
        )

    async def add_member(
        self,
        *,
        course_id: str,
        user_id: str,
        role: str,
        tenant_id: str,
    ) -> dict[str, Any]:
        url = f"{self._base_url}/api/v1/courses/{course_id}/members"
        token = self._service_token(tenant_id=tenant_id, as_user_id=user_id)
        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {token}",
        }
        payload = {"user_id": user_id, "role": role}
        try:
            async with httpx.AsyncClient(timeout=self._timeout) as client:
                resp = await client.post(url, json=payload, headers=headers)
        except Exception as exc:
            raise CourseClientError(f"transport failed: {exc}") from exc
        if resp.status_code in (200, 201, 204):
            try:
                return resp.json()
            except Exception:
                return {"course_id": course_id, "user_id": user_id, "role": role}
        if resp.status_code == 409:
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
        raise CourseClientError(
            f"course-submission returned {resp.status_code}: {resp.text[:300]}"
        )

    async def claim_external_submissions(
        self,
        *,
        user_id: str,
        tenant_id: str,
        external_author_id: str,
    ) -> int:
        """Backfill imported submissions from an external participant to a user.

        Mirrors :meth:`add_member`: mints an admin-impersonation JWT and POSTs
        to course-submission's collection-level claim action. The endpoint
        reassigns every ``yandex_contest`` submission whose ``author_id`` equals
        ``external_author_id`` (in the token's tenant) to ``user_id`` and
        returns ``{"claimed": N}``. We surface ``N`` (default 0). The path
        ``/submissions:claim-external`` is what the gateway routes to
        submission — ``/users/{id}/...`` would route to identity instead.
        """
        url = f"{self._base_url}/api/v1/submissions:claim-external"
        token = self._service_token(tenant_id=tenant_id, as_user_id=user_id)
        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {token}",
        }
        payload = {"user_id": user_id, "external_author_id": external_author_id}
        try:
            async with httpx.AsyncClient(timeout=self._timeout) as client:
                resp = await client.post(url, json=payload, headers=headers)
        except Exception as exc:
            raise CourseClientError(f"transport failed: {exc}") from exc
        if 200 <= resp.status_code < 300:
            try:
                return int(resp.json().get("claimed", 0))
            except Exception:
                return 0
        raise CourseClientError(
            f"course-submission returned {resp.status_code}: {resp.text[:300]}"
        )
