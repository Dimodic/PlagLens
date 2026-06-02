"""Repositories — thin async wrappers around SQLAlchemy queries."""
from __future__ import annotations

from .api_keys import ApiKeyRepository
from .external_bindings import ExternalBindingRepository
from .invitations import InvitationRepository
from .oauth import OAuthIdentityRepository
from .sessions import SessionRepository
from .telegram_binding import TelegramBindingRepository
from .tenants import TenantRepository
from .tokens import EmailVerifyTokenRepository, PasswordResetTokenRepository
from .two_factor import TwoFactorRepository
from .users import UserRepository

__all__ = [
    "ApiKeyRepository",
    "EmailVerifyTokenRepository",
    "ExternalBindingRepository",
    "InvitationRepository",
    "OAuthIdentityRepository",
    "PasswordResetTokenRepository",
    "SessionRepository",
    "TelegramBindingRepository",
    "TenantRepository",
    "TwoFactorRepository",
    "UserRepository",
]
