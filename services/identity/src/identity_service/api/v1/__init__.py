"""API v1 — top-level router aggregator."""
from __future__ import annotations

from fastapi import APIRouter

from .admin import router as admin_router
from .api_keys import router as api_keys_router
from .auth import router as auth_router
from .auth_2fa import router as auth_2fa_router
from .auth_email import router as auth_email_router
from .auth_oauth import router as auth_oauth_router
from .auth_password import router as auth_password_router
from .external_bindings import router as external_bindings_router
from .invitations import router as invitations_router
from .jwks import router as jwks_router
from .me import router as me_router
from .operations import router as operations_router
from .roles import router as roles_router
from .tenants import router as tenants_router
from .users import router as users_router
from .version import router as version_router

api_v1 = APIRouter(prefix="/api/v1")
api_v1.include_router(auth_router)
api_v1.include_router(auth_password_router)
api_v1.include_router(auth_email_router)
api_v1.include_router(auth_2fa_router)
api_v1.include_router(auth_oauth_router)
api_v1.include_router(tenants_router)
api_v1.include_router(users_router)
api_v1.include_router(me_router)
api_v1.include_router(external_bindings_router)
api_v1.include_router(roles_router)
api_v1.include_router(invitations_router)
api_v1.include_router(api_keys_router)
api_v1.include_router(admin_router)
api_v1.include_router(jwks_router)
api_v1.include_router(operations_router)
api_v1.include_router(version_router)

__all__ = ["api_v1"]
