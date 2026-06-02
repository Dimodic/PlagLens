"""Validate + apply a user email set / change / clear.

Email is OPTIONAL (migration 0009). This helper centralises the rules for
*setting* one from a PATCH body, shared by ``PATCH /users/me`` (self-service)
and ``PATCH /users/{id}`` (admin) so ANY user — regardless of how they
registered (password, OAuth, Telegram) — can add or change their address:

* empty / whitespace → clears the email back to NULL (email-less account);
* a non-empty value   → must look like an address and be unique within the
  tenant (the partial unique index), and is recorded as UNVERIFIED. The user
  may later confirm it via the ``/auth/email/verify`` flow.
"""
from __future__ import annotations

import re

from .problem import ProblemException

# Pragmatic, permissive address shape — we do NOT do full RFC 5322 (that
# rejects valid addresses and accepts junk). "something@something.tld".
_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


async def apply_email_update(users_repo, db_user, raw_email: str) -> None:
    """Mutate ``db_user.email`` from a PATCH value. Raises ProblemException
    (422 invalid / 409 already-in-use) on bad input. No-ops on an unchanged
    value (so the verified flag survives a profile save that didn't touch
    the email)."""
    normalized = (raw_email or "").strip().lower()

    # Clear → back to NULL.
    if not normalized:
        if db_user.email is not None:
            db_user.email = None
            db_user.email_verified_at = None
        return

    # Unchanged → leave the verified flag intact.
    if normalized == (db_user.email or "").lower():
        return

    if not _EMAIL_RE.match(normalized):
        raise ProblemException(
            status=422,
            code="INVALID_EMAIL",
            title="Invalid email address",
            detail="Enter a valid email like name@example.com.",
        )

    clash = await users_repo.get_by_email(db_user.tenant_id, normalized)
    if clash is not None and clash.id != db_user.id:
        raise ProblemException(
            status=409,
            code="EMAIL_TAKEN",
            title="Email already in use",
            detail="Another account in this organization already uses this email.",
        )

    db_user.email = normalized
    db_user.email_verified_at = None  # a freshly set/changed email is unverified
