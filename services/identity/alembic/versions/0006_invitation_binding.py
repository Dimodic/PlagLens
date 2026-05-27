"""invitations.binding_system / binding_external_id — external-link claim payload

Adds two nullable columns to ``invitations`` so a code can carry an
external-identity binding. When such a code is redeemed, identity creates an
``ExternalBinding`` for the redeemer and asks course-submission to backfill the
matching imported submissions (Yandex.Contest participant → native user).

* ``binding_system``      mirrors ExternalBinding.system (e.g. "yandex_contest")
* ``binding_external_id`` the participant key (e.g. "yc:126352134")

Both NULL for ordinary invitations (the redeem path is a no-op then).

Revision ID: 0006
Revises: 0005
Create Date: 2026-05-27 10:00:00
"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0006"
down_revision: Union[str, None] = "0005"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

SCHEMA = "identity"


def upgrade() -> None:
    op.add_column(
        "invitations",
        sa.Column("binding_system", sa.String(32), nullable=True),
        schema=SCHEMA,
    )
    op.add_column(
        "invitations",
        sa.Column("binding_external_id", sa.String(255), nullable=True),
        schema=SCHEMA,
    )


def downgrade() -> None:
    op.drop_column("invitations", "binding_external_id", schema=SCHEMA)
    op.drop_column("invitations", "binding_system", schema=SCHEMA)
