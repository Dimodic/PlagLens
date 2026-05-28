"""Add resend_api_key_encrypted to email_transport_config

Resend (resend.com) is added as a third email provider alongside SMTP
and Mailgun. We need a place to store its Fernet-encrypted API key.
The provider field stays a free-form String(16) — no enum change is
necessary; admin_email.py validates the allowed values in code.

Revision ID: 0003
Revises: 0002
Create Date: 2026-05-28 14:00:00
"""
from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0003"
down_revision: str | Sequence[str] | None = "0002"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

SCHEMA = "notification"
TABLE = "email_transport_config"


def upgrade() -> None:
    with op.batch_alter_table(TABLE, schema=SCHEMA) as b:
        b.add_column(
            sa.Column("resend_api_key_encrypted", sa.LargeBinary(), nullable=True)
        )


def downgrade() -> None:
    with op.batch_alter_table(TABLE, schema=SCHEMA) as b:
        b.drop_column("resend_api_key_encrypted")
