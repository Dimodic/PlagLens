"""Auth (login / register / refresh / me / 2fa / password / email) schemas."""
from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field


class RegisterRequest(BaseModel):
    email: str
    password: str = Field(min_length=4, max_length=128)
    display_name: str = Field(min_length=1, max_length=255)
    # tenant_slug is optional from the SPA — the registration form on
    # /login doesn't ask for an organisation. When omitted, the service
    # plants the user in ``Settings.default_tenant_slug`` (a placeholder
    # «public» tenant). A real organisation is picked up later when the
    # user redeems an invitation code, which migrates ``user.tenant_id``.
    tenant_slug: str | None = None
    locale: str = "ru"
    invitation_token: str | None = None


class RegisterResponse(BaseModel):
    user_id: str
    email_verification_required: bool = True


class LoginRequest(BaseModel):
    email: str
    password: str
    # Optional: when omitted (or empty), the backend auto-resolves the tenant
    # by email — works as long as the email is unique across tenants. If
    # multiple tenants have a user with that email, the response is 409 with
    # a list of slugs to disambiguate.
    tenant_slug: str | None = None
    totp_code: str | None = None


class UserSummary(BaseModel):
    id: str
    email: str
    display_name: str
    avatar_url: str | None = None
    global_role: str
    tenant_id: str


class LoginResponse(BaseModel):
    """Response of POST /auth/login.

    Two shapes share this schema:

    * **Single-factor success** — ``access_token``, ``expires_in`` and ``user``
      are populated; ``two_factor_required`` is ``False``.
    * **2FA challenge** — the user has 2FA enabled and did not supply a TOTP
      code yet. The server has issued an ``mfa_token`` (short-lived, stored in
      Redis) which the client exchanges at ``POST /auth/2fa/verify`` together
      with a TOTP or backup code. ``access_token`` / ``user`` are ``None`` and
      ``two_factor_required`` is ``True``.
    """
    access_token: str | None = None
    expires_in: int | None = None
    user: UserSummary | None = None
    two_factor_required: bool = False
    mfa_token: str | None = None


class TwoFactorVerifyResponse(BaseModel):
    """Response of POST /auth/2fa/verify — mirrors the happy-path login."""
    access_token: str
    expires_in: int
    user: UserSummary


class RefreshResponse(BaseModel):
    access_token: str
    expires_in: int


class TenantBrief(BaseModel):
    id: str
    slug: str
    name: str


class MeResponse(BaseModel):
    id: str
    email: str
    display_name: str
    avatar_url: str | None = None
    locale: str = "ru"
    timezone: str = "UTC"
    global_role: str
    course_roles: dict[str, str] = Field(default_factory=dict)
    tenant: TenantBrief
    email_verified: bool = False
    two_factor_enabled: bool = False
    linked_oauth: list[str] = Field(default_factory=list)
    last_login_at: datetime | None = None
    # ``true`` when ``email`` is the auto-generated ``tg-<id>@telegram.plaglens.local``
    # stub we mint for Telegram-only users (no real mailbox). UI hides the
    # technical address and surfaces the Telegram handle instead.
    email_is_placeholder: bool = False
    # Optional public-facing handle from an external identity provider.
    # Currently populated from Telegram OAuth (``@username`` if set,
    # otherwise the Telegram first/last name). Stored WITHOUT the leading
    # ``@``; UI is free to prepend it. ``None`` when no such provider is
    # linked.
    external_handle: str | None = None


class PasswordForgotRequest(BaseModel):
    email: str
    # Optional. Self-registered users live in the default «public» tenant
    # and the SPA's recovery form no longer asks for org slug — same
    # mental model as ``/auth/login`` (POST body's ``tenant_slug`` is also
    # optional there). Omitted → server resolves by unique-email lookup;
    # ambiguous email (one address in multiple tenants) returns 202 with
    # no email sent — the user must use the admin-provided link or include
    # tenant_slug explicitly.
    tenant_slug: str | None = None


class PasswordResetRequest(BaseModel):
    token: str
    new_password: str = Field(min_length=8, max_length=128)


class PasswordChangeRequest(BaseModel):
    current_password: str
    new_password: str = Field(min_length=8, max_length=128)


class EmailVerifyConfirm(BaseModel):
    token: str


class EmailChangeRequest(BaseModel):
    new_email: str


class EmailChangeConfirm(BaseModel):
    token: str


class TwoFactorEnrollResponse(BaseModel):
    secret: str
    otpauth_uri: str
    qr_svg: str | None = None


class TwoFactorEnableRequest(BaseModel):
    totp_code: str


class TwoFactorVerifyRequest(BaseModel):
    mfa_token: str
    totp_code: str | None = None
    backup_code: str | None = None


class TwoFactorBackupCodes(BaseModel):
    codes: list[str]


class OAuthAuthorizeResponse(BaseModel):
    authorize_url: str
    state: str
    expires_in: int


class OAuthCallbackResponse(BaseModel):
    access_token: str
    expires_in: int
    user: UserSummary
    linked: bool = False
    is_new_user: bool = False
    link_required: bool = False
    link_token: str | None = None


class OAuthLinkRequest(BaseModel):
    code: str
    state: str


class OAuthLinkConfirmRequest(BaseModel):
    link_token: str


class OperationAcceptedOut(BaseModel):
    operation_id: str
    status_url: str
    metadata: dict[str, Any] = Field(default_factory=dict)
