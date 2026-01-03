"""Auth (login / register / refresh / me / 2fa / password / email) schemas."""
from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field


class RegisterRequest(BaseModel):
    email: str
    password: str = Field(min_length=4, max_length=128)
    display_name: str = Field(min_length=1, max_length=255)
    tenant_slug: str
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


class PasswordForgotRequest(BaseModel):
    email: str
    tenant_slug: str


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
