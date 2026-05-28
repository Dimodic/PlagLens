"""Per-tenant SMTP / Mailgun credentials inside email_transport_config

The admin UI needs to set SMTP host/port/username/password (or Mailgun
domain + API key) from a form, not from the env file. We extend
``email_transport_config`` with the missing columns; password and API
key are stored Fernet-encrypted as ``LargeBinary``.

The columns are all nullable so existing rows keep working — channels
fall back to env defaults when a column is NULL. The SQLAlchemy code in
``admin_email.py`` is what picks the per-row override over the env
fallback.

Revision ID: 0002
Revises: 0001
Create Date: 2026-05-28 13:00:00
"""
from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0002"
down_revision: str | Sequence[str] | None = "0001"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

SCHEMA = "notification"
TABLE = "email_transport_config"


def upgrade() -> None:
    with op.batch_alter_table(TABLE, schema=SCHEMA) as b:
        b.add_column(sa.Column("smtp_host", sa.String(length=255), nullable=True))
        b.add_column(sa.Column("smtp_port", sa.Integer(), nullable=True))
        b.add_column(sa.Column("smtp_username", sa.String(length=255), nullable=True))
        # Fernet ciphertext (URL-safe base64) — stored as LargeBinary so we
        # don't accidentally truncate / mojibake on encoding round-trips.
        b.add_column(
            sa.Column("smtp_password_encrypted", sa.LargeBinary(), nullable=True)
        )
        # Two boolean knobs for the two SMTP TLS modes:
        #   • use_tls = implicit TLS from the start (port 465, Yandex/Gmail SSL)
        #   • use_starttls = STARTTLS upgrade on a cleartext socket (port 587)
        # They are mutually exclusive in practice; the UI surfaces them as
        # a single «TLS mode» selector.
        b.add_column(
            sa.Column(
                "smtp_use_tls",
                sa.Boolean(),
                nullable=False,
                server_default=sa.false(),
            )
        )
        b.add_column(
            sa.Column(
                "smtp_use_starttls",
                sa.Boolean(),
                nullable=False,
                server_default=sa.true(),
            )
        )

        b.add_column(sa.Column("mailgun_domain", sa.String(length=255), nullable=True))
        b.add_column(
            sa.Column("mailgun_api_key_encrypted", sa.LargeBinary(), nullable=True)
        )
        b.add_column(
            sa.Column(
                "mailgun_region",
                sa.String(length=8),
                nullable=False,
                server_default="eu",
            )
        )


def downgrade() -> None:
    with op.batch_alter_table(TABLE, schema=SCHEMA) as b:
        b.drop_column("mailgun_region")
        b.drop_column("mailgun_api_key_encrypted")
        b.drop_column("mailgun_domain")
        b.drop_column("smtp_use_starttls")
        b.drop_column("smtp_use_tls")
        b.drop_column("smtp_password_encrypted")
        b.drop_column("smtp_username")
        b.drop_column("smtp_port")
        b.drop_column("smtp_host")
