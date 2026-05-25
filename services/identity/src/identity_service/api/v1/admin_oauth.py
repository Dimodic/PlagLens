"""Admin-side OAuth provider directory.

Read-only view over the OAuth credentials the identity service was started
with. Lets an admin see — without SSHing into the host — which providers are
configured and what callback URL to register on the provider's side.

Editing credentials through the UI requires moving them from env into a DB
table (with a fallback to env when no DB row exists). That migration is on
the roadmap; this endpoint already returns ``editable=false`` so the UI
knows to render fields read-only.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from ...config import settings
from ...deps import CurrentUser, require_global_role
from ...oauth.providers import list_known_providers

router = APIRouter(prefix="/admin/oauth", tags=["admin", "oauth"])


_PROVIDER_TITLES: dict[str, str] = {
    "google": "Google",
    "yandex": "Яндекс ID",
    "stepik": "Stepik",
    "github": "GitHub",
}

_PROVIDER_DOCS: dict[str, str] = {
    "google": "https://console.cloud.google.com/apis/credentials",
    "yandex": "https://oauth.yandex.ru/",
    "stepik": "https://stepik.org/oauth2/applications/",
    "github": "https://github.com/settings/developers",
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
    # When false, the UI must render fields read-only and surface a hint to
    # edit env vars on the host. Editable=true is reserved for the future
    # DB-backed override.
    editable: bool = False


@router.get("/providers", response_model=list[OAuthProviderInfo])
async def list_oauth_providers(
    _admin: CurrentUser = Depends(require_global_role("admin")),
) -> list[OAuthProviderInfo]:
    base = settings.oauth_callback_base_url.rstrip("/")
    out: list[OAuthProviderInfo] = []
    for name in list_known_providers():
        cid, csec = settings.oauth_credentials(name)
        out.append(
            OAuthProviderInfo(
                provider=name,
                title=_PROVIDER_TITLES.get(name, name.capitalize()),
                enabled=bool(cid and csec),
                client_id_preview=_mask(cid),
                has_secret=bool(csec),
                redirect_uri=f"{base}/api/v1/auth/oauth/{name}/callback",
                docs_url=_PROVIDER_DOCS.get(name),
            )
        )
    return out
