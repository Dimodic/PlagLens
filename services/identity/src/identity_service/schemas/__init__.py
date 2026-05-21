"""Pydantic v2 schemas for the Identity Service API."""
from __future__ import annotations

from .api_keys import ApiKeyCreate, ApiKeyCreated, ApiKeyOut
from .auth import (
    EmailChangeConfirm,
    EmailChangeRequest,
    EmailVerifyConfirm,
    LoginRequest,
    LoginResponse,
    MeResponse,
    PasswordChangeRequest,
    PasswordForgotRequest,
    PasswordResetRequest,
    RefreshResponse,
    RegisterRequest,
    RegisterResponse,
    TwoFactorEnableRequest,
    TwoFactorEnrollResponse,
    TwoFactorVerifyRequest,
    TwoFactorVerifyResponse,
)
from .external_bindings import ExternalBindingCreate, ExternalBindingOut
from .invitations import InvitationAccept, InvitationCreate, InvitationOut
from .roles import RoleAssignRequest, RoleOut, RolePermissionsOut
from .sessions import SessionOut
from .tenants import (
    TenantCreate,
    TenantOut,
    TenantSettingsOut,
    TenantSettingsUpdate,
    TenantUpdate,
    TenantUsageOut,
)
from .users import (
    UserBatchCreate,
    UserCreate,
    UserOut,
    UserUpdate,
)

__all__ = [
    "ApiKeyCreate",
    "ApiKeyCreated",
    "ApiKeyOut",
    "EmailChangeConfirm",
    "EmailChangeRequest",
    "EmailVerifyConfirm",
    "ExternalBindingCreate",
    "ExternalBindingOut",
    "InvitationAccept",
    "InvitationCreate",
    "InvitationOut",
    "LoginRequest",
    "LoginResponse",
    "MeResponse",
    "PasswordChangeRequest",
    "PasswordForgotRequest",
    "PasswordResetRequest",
    "RefreshResponse",
    "RegisterRequest",
    "RegisterResponse",
    "RoleAssignRequest",
    "RoleOut",
    "RolePermissionsOut",
    "SessionOut",
    "TenantCreate",
    "TenantOut",
    "TenantSettingsOut",
    "TenantSettingsUpdate",
    "TenantUpdate",
    "TenantUsageOut",
    "TwoFactorEnableRequest",
    "TwoFactorEnrollResponse",
    "TwoFactorVerifyRequest",
    "TwoFactorVerifyResponse",
    "UserBatchCreate",
    "UserCreate",
    "UserOut",
    "UserUpdate",
]
