"""Seed the «public» tenant for self-service registration

Self-registration on /register doesn't ask for an organisation slug
any more — the user is anchored to a placeholder tenant whose only job
is to be a legal ``user.tenant_id`` until they redeem an invitation.

When the user redeems a course-invite whose ``tenant_id`` differs, the
``POST /invitations:redeem`` handler migrates ``user.tenant_id`` to the
real organisation (one UPDATE row + a forced re-login). Until then the
account lives in this self-service tenant.

The slug is configurable via ``Settings.default_tenant_slug`` but must
match this seed for the registration path to work out of the box. The
``id`` is a fixed literal so the row is detectable across environments
without having to chase a generated UUID.

Idempotent: skip the insert when a row with this slug already exists.

Revision ID: 0007
Revises: 0006
Create Date: 2026-05-28 12:00:00
"""
from __future__ import annotations

from typing import Sequence, Union

from alembic import op

revision: str = "0007"
down_revision: Union[str, None] = "0006"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

SCHEMA = "identity"
PUBLIC_TENANT_ID = "tnt_public_default"
PUBLIC_TENANT_SLUG = "public"
PUBLIC_TENANT_NAME = "PlagLens"


def upgrade() -> None:
    # ``ON CONFLICT (slug) DO NOTHING`` keeps re-runs safe and also covers
    # the case where an operator pre-created a row by hand.
    op.execute(
        f"""
        INSERT INTO {SCHEMA}.tenants (id, slug, name, status, settings, cors_origins, created_at)
        VALUES (
            '{PUBLIC_TENANT_ID}',
            '{PUBLIC_TENANT_SLUG}',
            '{PUBLIC_TENANT_NAME}',
            'active',
            '{{}}'::jsonb,
            '{{}}',
            now()
        )
        ON CONFLICT (slug) DO NOTHING
        """
    )


def downgrade() -> None:
    # We delete by slug, not by id, in case the row was inserted by hand
    # with a different generated id. Users registered into this tenant
    # would have their FK violated — operators reverting this should drop
    # those users first; we don't cascade silently.
    op.execute(
        f"DELETE FROM {SCHEMA}.tenants WHERE slug = '{PUBLIC_TENANT_SLUG}'"
    )
