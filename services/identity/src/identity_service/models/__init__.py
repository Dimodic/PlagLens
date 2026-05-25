"""SQLAlchemy 2.x async models. Schema: ``identity`` (PG) / default (sqlite tests)."""
from __future__ import annotations

import os
from datetime import datetime
from typing import Any, Optional

from sqlalchemy import (
    ARRAY,
    Boolean,
    DateTime,
    ForeignKey,
    LargeBinary,
    MetaData,
    String,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship

# When SQLITE_TESTS=1, drop the schema qualifier so aiosqlite can host the tables.
SCHEMA: Optional[str] = None if os.getenv("SQLITE_TESTS") == "1" else "identity"


def _json_type() -> Any:
    """Return JSONB on Postgres, JSON elsewhere (sqlite tests)."""
    if os.getenv("SQLITE_TESTS") == "1":
        from sqlalchemy import JSON

        return JSON
    from sqlalchemy.dialects.postgresql import JSONB

    return JSONB


def _str_array() -> Any:
    if os.getenv("SQLITE_TESTS") == "1":
        from sqlalchemy import JSON

        return JSON
    return ARRAY(String(255))


def _fk(table: str) -> str:
    prefix = f"{SCHEMA}." if SCHEMA else ""
    return f"{prefix}{table}"


class Base(DeclarativeBase):
    """Common base — schema bound for Postgres, default schema for sqlite tests."""

    metadata = MetaData(schema=SCHEMA) if SCHEMA else MetaData()


def utcnow() -> datetime:
    return datetime.utcnow()


# --------------------------------------------------------------------------- #
# Tenant
# --------------------------------------------------------------------------- #
class Tenant(Base):
    __tablename__ = "tenants"

    id: Mapped[str] = mapped_column(String(40), primary_key=True)
    slug: Mapped[str] = mapped_column(String(64), nullable=False, unique=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    domain: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="active")
    settings: Mapped[dict] = mapped_column(_json_type(), nullable=False, default=dict)
    cors_origins: Mapped[list[str]] = mapped_column(
        _str_array(), nullable=False, default=list
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    deleted_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    users: Mapped[list[User]] = relationship(back_populates="tenant")


# --------------------------------------------------------------------------- #
# User
# --------------------------------------------------------------------------- #
class User(Base):
    __tablename__ = "users"
    __table_args__ = (UniqueConstraint("tenant_id", "email", name="uq_users_tenant_email"),)

    id: Mapped[str] = mapped_column(String(40), primary_key=True)
    tenant_id: Mapped[str] = mapped_column(
        String(40),
        ForeignKey(_fk("tenants.id"), ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    email: Mapped[str] = mapped_column(String(320), nullable=False)
    email_verified_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    password_hash: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    display_name: Mapped[str] = mapped_column(String(255), nullable=False, default="")
    avatar_url: Mapped[Optional[str]] = mapped_column(String(1024), nullable=True)
    locale: Mapped[str] = mapped_column(String(8), nullable=False, default="ru")
    timezone: Mapped[str] = mapped_column(String(64), nullable=False, default="UTC")
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="active")
    global_role: Mapped[str] = mapped_column(String(32), nullable=False, default="student")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    last_login_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    deleted_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    anonymized_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    tenant: Mapped[Tenant] = relationship(back_populates="users")


# --------------------------------------------------------------------------- #
# OAuth identity
# --------------------------------------------------------------------------- #
class OAuthIdentity(Base):
    __tablename__ = "oauth_identities"
    __table_args__ = (
        UniqueConstraint("provider", "provider_user_id", name="uq_oauth_provider_subject"),
    )

    id: Mapped[str] = mapped_column(String(40), primary_key=True)
    user_id: Mapped[str] = mapped_column(
        String(40),
        ForeignKey(_fk("users.id"), ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    provider: Mapped[str] = mapped_column(String(32), nullable=False)
    provider_user_id: Mapped[str] = mapped_column(String(255), nullable=False)
    email: Mapped[Optional[str]] = mapped_column(String(320), nullable=True)
    raw_profile: Mapped[dict] = mapped_column(_json_type(), nullable=False, default=dict)
    linked_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )


# --------------------------------------------------------------------------- #
# External binding
# --------------------------------------------------------------------------- #
class ExternalBinding(Base):
    __tablename__ = "external_bindings"
    __table_args__ = (UniqueConstraint("system", "external_id", name="uq_external_binding"),)

    id: Mapped[str] = mapped_column(String(40), primary_key=True)
    user_id: Mapped[str] = mapped_column(
        String(40),
        ForeignKey(_fk("users.id"), ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    system: Mapped[str] = mapped_column(String(32), nullable=False)
    external_id: Mapped[str] = mapped_column(String(255), nullable=False)
    display_name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    linked_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )


# --------------------------------------------------------------------------- #
# Session (refresh token)
# --------------------------------------------------------------------------- #
class Session(Base):
    __tablename__ = "sessions"

    id: Mapped[str] = mapped_column(String(40), primary_key=True)
    user_id: Mapped[str] = mapped_column(
        String(40),
        ForeignKey(_fk("users.id"), ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    refresh_token_hash: Mapped[str] = mapped_column(String(128), nullable=False, unique=True)
    ip: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    user_agent: Mapped[Optional[str]] = mapped_column(String(512), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    last_used_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    revoked_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )


# --------------------------------------------------------------------------- #
# API Key
# --------------------------------------------------------------------------- #
class ApiKey(Base):
    __tablename__ = "api_keys"

    id: Mapped[str] = mapped_column(String(40), primary_key=True)
    owner_user_id: Mapped[str] = mapped_column(
        String(40),
        ForeignKey(_fk("users.id"), ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    key_hash: Mapped[str] = mapped_column(String(128), nullable=False, unique=True)
    scopes: Mapped[list[str]] = mapped_column(_str_array(), nullable=False, default=list)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    last_used_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    expires_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    revoked_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )


# --------------------------------------------------------------------------- #
# Password reset / email verify tokens
# --------------------------------------------------------------------------- #
class PasswordResetToken(Base):
    __tablename__ = "password_reset_tokens"

    id: Mapped[str] = mapped_column(String(40), primary_key=True)
    user_id: Mapped[str] = mapped_column(
        String(40),
        ForeignKey(_fk("users.id"), ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    token_hash: Mapped[str] = mapped_column(String(128), nullable=False, unique=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    used_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)


class EmailVerifyToken(Base):
    __tablename__ = "email_verify_tokens"

    id: Mapped[str] = mapped_column(String(40), primary_key=True)
    user_id: Mapped[str] = mapped_column(
        String(40),
        ForeignKey(_fk("users.id"), ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    email: Mapped[str] = mapped_column(String(320), nullable=False)
    token_hash: Mapped[str] = mapped_column(String(128), nullable=False, unique=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    used_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)


# --------------------------------------------------------------------------- #
# Two-factor secret
# --------------------------------------------------------------------------- #
class TwoFactorSecret(Base):
    __tablename__ = "two_factor_secrets"

    user_id: Mapped[str] = mapped_column(
        String(40),
        ForeignKey(_fk("users.id"), ondelete="CASCADE"),
        primary_key=True,
    )
    secret_encrypted: Mapped[bytes] = mapped_column(LargeBinary, nullable=False)
    backup_codes: Mapped[list[str]] = mapped_column(
        _str_array(), nullable=False, default=list
    )
    enabled_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )


# --------------------------------------------------------------------------- #
# Invitation
# --------------------------------------------------------------------------- #
class Invitation(Base):
    __tablename__ = "invitations"

    id: Mapped[str] = mapped_column(String(40), primary_key=True)
    tenant_id: Mapped[str] = mapped_column(
        String(40),
        ForeignKey(_fk("tenants.id"), ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    email: Mapped[str] = mapped_column(String(320), nullable=False)
    role: Mapped[str] = mapped_column(String(32), nullable=False)
    course_id: Mapped[Optional[str]] = mapped_column(String(40), nullable=True)
    token_hash: Mapped[str] = mapped_column(String(128), nullable=False, unique=True)
    # Short human-readable code (XXX-XXX-XXX, 9 chars + 2 dashes); unique
    # within a tenant. Nullable so legacy invitations (pre-migration 0004)
    # don't carry one — those still work via the long token URL.
    code: Mapped[Optional[str]] = mapped_column(String(16), nullable=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    accepted_by: Mapped[Optional[str]] = mapped_column(String(40), nullable=True)
    accepted_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    created_by: Mapped[Optional[str]] = mapped_column(String(40), nullable=True)
    revoked_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )


# --------------------------------------------------------------------------- #
# Role permission overrides (editable RBAC matrix)
# --------------------------------------------------------------------------- #
class RolePermission(Base):
    """One row per (role, permission) once an admin customises the matrix.

    Absence of any rows for a role means "use the static defaults"
    (PERMISSIONS_BY_GLOBAL_ROLE); once edited, the stored rows are authoritative.
    """

    __tablename__ = "role_permissions"

    role: Mapped[str] = mapped_column(String(32), primary_key=True)
    permission: Mapped[str] = mapped_column(String(64), primary_key=True)
    granted: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)


# --------------------------------------------------------------------------- #
# OAuth provider credential overrides (admin-editable)
# --------------------------------------------------------------------------- #
class OAuthProviderOverride(Base):
    """Per-installation override for an OAuth provider's client credentials.

    A row's presence (with non-empty values) replaces the corresponding env
    var pair (``<PROVIDER>_CLIENT_ID`` / ``<PROVIDER>_CLIENT_SECRET``) at
    runtime — env is the boot-time fallback used when no override exists
    or when the override row leaves the field NULL.

    Secrets are stored as plain text for now (the env vars they replace are
    already plaintext on the host). Encrypting them at rest is a roadmap
    item that pairs with the Vault integration.
    """

    __tablename__ = "oauth_provider_overrides"

    # One row per provider name (google / yandex / stepik / github).
    provider: Mapped[str] = mapped_column(String(32), primary_key=True)
    client_id: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    client_secret: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_by: Mapped[Optional[str]] = mapped_column(String(40), nullable=True)


__all__ = [
    "Base",
    "Tenant",
    "User",
    "OAuthIdentity",
    "ExternalBinding",
    "Session",
    "ApiKey",
    "PasswordResetToken",
    "EmailVerifyToken",
    "TwoFactorSecret",
    "Invitation",
    "RolePermission",
    "OAuthProviderOverride",
]
