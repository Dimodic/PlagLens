"""Admin-side OAuth provider directory.

Returns the four built-in providers' configuration state and lets an admin
edit client_id / client_secret without redeploying the identity service.
Edits land in the ``oauth_provider_overrides`` table and are mirrored into
an in-process cache so the very next OAuth flow uses the new credentials.
Env vars are kept as a fallback when no DB override exists.
"""
from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, status
from pydantic import BaseModel, Field
from sqlalchemy import delete
from sqlalchemy.ext.asyncio import AsyncSession

from ...config import settings
from ...deps import CurrentUser, get_session, require_global_role
from ...models import OAuthProviderOverride
from ...oauth import overrides as oauth_overrides
from ...oauth.providers import list_known_providers

router = APIRouter(prefix="/admin/oauth", tags=["admin", "oauth"])


_PROVIDER_TITLES: dict[str, str] = {
    "google": "Google",
    "yandex": "Яндекс ID",
    "stepik": "Stepik",
    "github": "GitHub",
    "telegram": "Telegram",
}

_PROVIDER_DOCS: dict[str, str] = {
    "google": "https://console.cloud.google.com/apis/credentials",
    "yandex": "https://oauth.yandex.ru/",
    "stepik": "https://stepik.org/oauth2/applications/",
    "github": "https://github.com/settings/developers",
    # Telegram uses @BotFather instead of an OAuth console: the admin
    # types /newbot, gets a bot_token, then /setdomain to whitelist this
    # deployment's host so the Login Widget can redirect back.
    "telegram": "https://t.me/BotFather",
}


def _mask(value: str) -> str:
    """Show first 6 + last 4 chars, hide the middle. Empty → empty."""
    if not value:
        return ""
    if len(value) <= 12:
        return "•" * len(value)
    return f"{value[:6]}…{value[-4:]}"


class OAuthProviderInfo(BaseModel):
    provider: str
    title: str
    enabled: bool
    client_id_preview: str
    has_secret: bool
    redirect_uri: str
    docs_url: str | None = None
    # 'env'      — value resolved from environment vars (no DB override yet).
    # 'override' — value comes from the admin-edited DB row.
    source: str = "env"
    editable: bool = True


class OAuthProviderUpdate(BaseModel):
    """Body for PATCH /admin/oauth/providers/{provider}.

    Pass ``null`` to leave a field unchanged. Pass an empty string to clear
    the override and fall back to env. Pass a real value to overwrite.
    """

    client_id: str | None = Field(default=None)
    client_secret: str | None = Field(default=None)


def _is_known(provider: str) -> bool:
    return provider in list_known_providers()


def _build_info(provider: str) -> OAuthProviderInfo:
    cid, csec = settings.oauth_credentials(provider)
    source = "override" if oauth_overrides.get_override(provider) else "env"
    base = settings.oauth_callback_base_url.rstrip("/")
    # For Telegram we expose the bot username (client_id) directly — it's
    # public information and the admin needs to copy it into @BotFather's
    # /setdomain step. Masking it would only confuse them.
    if provider == "telegram":
        client_id_preview = cid
    else:
        client_id_preview = _mask(cid)
    return OAuthProviderInfo(
        provider=provider,
        title=_PROVIDER_TITLES.get(provider, provider.capitalize()),
        enabled=bool(cid and csec),
        client_id_preview=client_id_preview,
        has_secret=bool(csec),
        redirect_uri=f"{base}/api/v1/auth/oauth/{provider}/callback",
        docs_url=_PROVIDER_DOCS.get(provider),
        source=source,
    )


@router.get("/providers", response_model=list[OAuthProviderInfo])
async def list_oauth_providers(
    _admin: CurrentUser = Depends(require_global_role("admin")),
) -> list[OAuthProviderInfo]:
    return [_build_info(name) for name in list_known_providers()]


@router.patch(
    "/providers/{provider}",
    response_model=OAuthProviderInfo,
    status_code=status.HTTP_200_OK,
    summary="Update OAuth provider client_id / client_secret",
)
async def update_oauth_provider(
    provider: str,
    payload: OAuthProviderUpdate,
    admin: CurrentUser = Depends(require_global_role("admin")),
    session: AsyncSession = Depends(get_session),
) -> OAuthProviderInfo:
    if not _is_known(provider):
        # 404 keeps the OpenAPI surface honest — unknown providers don't
        # silently create rows.
        from ...common.problem import ProblemException

        raise ProblemException(
            status=404, code="NOT_FOUND", title=f"Unknown OAuth provider '{provider}'"
        )

    # Load (or create) the row. SQLite + Postgres both honour this pattern;
    # we deliberately avoid an UPSERT to stay portable across the test
    # SQLite engine.
    existing = await session.get(OAuthProviderOverride, provider)
    if existing is None:
        existing = OAuthProviderOverride(provider=provider)
        session.add(existing)

    if payload.client_id is not None:
        existing.client_id = payload.client_id.strip() or None
    if payload.client_secret is not None:
        existing.client_secret = payload.client_secret.strip() or None

    # If both halves end up empty, drop the row entirely so /providers
    # reports source='env' again.
    if not (existing.client_id or "").strip() and not (existing.client_secret or "").strip():
        await session.execute(
            delete(OAuthProviderOverride).where(OAuthProviderOverride.provider == provider)
        )
        oauth_overrides.clear_override(provider)
    else:
        existing.updated_at = datetime.now(timezone.utc)
        existing.updated_by = admin.id
        oauth_overrides.set_override(
            provider,
            (existing.client_id or "").strip(),
            (existing.client_secret or "").strip(),
        )

    await session.commit()
    return _build_info(provider)
