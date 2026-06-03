"""Concrete OAuth provider definitions (Google / Yandex / Stepik / GitHub).

Each provider exposes:

* the URLs needed to drive the authorization-code flow;
* the default scopes;
* an ``async fetch_userinfo(access_token)`` helper that calls the provider with
  the provider-specific Authorization header;
* a ``parse_userinfo(raw)`` mapper from the provider's JSON shape to the
  uniform :class:`OAuthProfile`.

Network calls go through ``httpx.AsyncClient`` so tests can intercept them with
``respx`` (no real OAuth calls in tests).
"""
from __future__ import annotations

from typing import Any, ClassVar, Protocol, runtime_checkable

import httpx
from pydantic import BaseModel, Field


class OAuthProfile(BaseModel):
    """Provider-agnostic view of a user profile returned by the OAuth provider."""

    provider: str
    provider_user_id: str
    email: str | None = None
    email_verified: bool = False
    display_name: str | None = None
    avatar_url: str | None = None
    raw: dict[str, Any] = Field(default_factory=dict)


@runtime_checkable
class OAuthProvider(Protocol):
    """Abstract OAuth2 provider — covers all 4 supported providers."""

    name: str
    authorize_url: str
    token_url: str
    userinfo_url: str
    default_scopes: list[str]

    async def fetch_userinfo(self, access_token: str) -> OAuthProfile: ...

    def parse_userinfo(self, raw: dict[str, Any]) -> OAuthProfile: ...


# --------------------------------------------------------------------------- #
# Base helper
# --------------------------------------------------------------------------- #
class _ProviderBase:
    """Shared boilerplate (HTTP client + ``fetch_userinfo`` plumbing)."""

    name: ClassVar[str] = ""
    authorize_url: ClassVar[str] = ""
    token_url: ClassVar[str] = ""
    userinfo_url: ClassVar[str] = ""
    default_scopes: ClassVar[list[str]] = []

    auth_header_scheme: ClassVar[str] = "Bearer"
    extra_headers: ClassVar[dict[str, str]] = {}

    async def fetch_userinfo(self, access_token: str) -> OAuthProfile:
        headers = {
            "Authorization": f"{self.auth_header_scheme} {access_token}",
            "Accept": "application/json",
        }
        headers.update(self.extra_headers)
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(self.userinfo_url, headers=headers)
            resp.raise_for_status()
            payload = resp.json()
        return self.parse_userinfo(payload)

    # Subclasses must override.
    def parse_userinfo(self, raw: dict[str, Any]) -> OAuthProfile:  # pragma: no cover
        raise NotImplementedError


# --------------------------------------------------------------------------- #
# Google
# --------------------------------------------------------------------------- #
class GoogleProvider(_ProviderBase):
    """Google OpenID Connect.

    Userinfo example::

        {
          "sub": "1234567890",
          "email": "ivan@example.com",
          "email_verified": true,
          "name": "Иван Иванов",
          "picture": "https://lh3.googleusercontent.com/..."
        }
    """

    name: ClassVar[str] = "google"
    authorize_url: ClassVar[str] = "https://accounts.google.com/o/oauth2/v2/auth"
    token_url: ClassVar[str] = "https://oauth2.googleapis.com/token"
    userinfo_url: ClassVar[str] = "https://openidconnect.googleapis.com/v1/userinfo"
    default_scopes: ClassVar[list[str]] = ["openid", "email", "profile"]

    def parse_userinfo(self, raw: dict[str, Any]) -> OAuthProfile:
        sub = str(raw.get("sub") or raw.get("id") or "")
        if not sub:
            raise ValueError("Google userinfo response missing 'sub'")
        email = raw.get("email")
        return OAuthProfile(
            provider=self.name,
            provider_user_id=sub,
            email=email.lower() if isinstance(email, str) else None,
            email_verified=bool(raw.get("email_verified", False)),
            display_name=raw.get("name") or raw.get("given_name"),
            avatar_url=raw.get("picture"),
            raw=raw,
        )


# --------------------------------------------------------------------------- #
# Yandex
# --------------------------------------------------------------------------- #
class YandexProvider(_ProviderBase):
    """Yandex Login API.

    Userinfo (``GET https://login.yandex.ru/info``) example::

        {
          "id": "1130000012345678",
          "login": "ivan",
          "default_email": "ivan@yandex.ru",
          "real_name": "Иван Иванов",
          "display_name": "Иван",
          "default_avatar_id": "abc123",
          "is_avatar_empty": false
        }

    Yandex returns its OAuth tokens (and userinfo when called with
    ``Authorization: OAuth …``) for both the ``login:email`` and ``login:info``
    scopes.
    """

    name: ClassVar[str] = "yandex"
    authorize_url: ClassVar[str] = "https://oauth.yandex.ru/authorize"
    token_url: ClassVar[str] = "https://oauth.yandex.ru/token"
    userinfo_url: ClassVar[str] = "https://login.yandex.ru/info"
    # login:avatar lets us read default_avatar_id → import the user's portrait
    # as their PlagLens avatar on first login (mirrors Telegram's photo_url).
    default_scopes: ClassVar[list[str]] = ["login:email", "login:info", "login:avatar"]

    auth_header_scheme: ClassVar[str] = "OAuth"

    def parse_userinfo(self, raw: dict[str, Any]) -> OAuthProfile:
        uid = str(raw.get("id") or "")
        if not uid:
            raise ValueError("Yandex userinfo response missing 'id'")
        emails = raw.get("emails") or []
        email = raw.get("default_email") or (emails[0] if emails else None)
        avatar_id = raw.get("default_avatar_id")
        avatar_url: str | None = None
        if avatar_id and not raw.get("is_avatar_empty"):
            avatar_url = f"https://avatars.yandex.net/get-yapic/{avatar_id}/islands-200"
        return OAuthProfile(
            provider=self.name,
            provider_user_id=uid,
            email=email.lower() if isinstance(email, str) else None,
            email_verified=bool(email),  # Yandex returns only verified emails
            display_name=(
                raw.get("real_name")
                or raw.get("display_name")
                or raw.get("login")
            ),
            avatar_url=avatar_url,
            raw=raw,
        )


# --------------------------------------------------------------------------- #
# Stepik
# --------------------------------------------------------------------------- #
class StepikProvider(_ProviderBase):
    """Stepik OAuth2.

    The userinfo endpoint ``https://stepik.org/api/users/me`` returns::

        {
          "users": [
            { "id": 12345, "first_name": "Иван", "last_name": "Иванов",
              "full_name": "Иван Иванов", "email": "ivan@stepik.org",
              "avatar": "https://stepik.org/static/avatar.png" }
          ]
        }
    """

    name: ClassVar[str] = "stepik"
    authorize_url: ClassVar[str] = "https://stepik.org/oauth2/authorize"
    token_url: ClassVar[str] = "https://stepik.org/oauth2/token"
    userinfo_url: ClassVar[str] = "https://stepik.org/api/users/me"
    default_scopes: ClassVar[list[str]] = ["read"]

    def parse_userinfo(self, raw: dict[str, Any]) -> OAuthProfile:
        # Stepik wraps the profile in a ``users`` list.
        if "users" in raw and isinstance(raw["users"], list) and raw["users"]:
            user = raw["users"][0]
        else:
            user = raw
        uid = str(user.get("id") or "")
        if not uid:
            raise ValueError("Stepik userinfo response missing 'id'")
        email = user.get("email")
        return OAuthProfile(
            provider=self.name,
            provider_user_id=uid,
            email=email.lower() if isinstance(email, str) else None,
            # Stepik does not surface a "verified" flag; treat presence as best-effort.
            email_verified=bool(email),
            display_name=(
                user.get("full_name")
                or " ".join(
                    p
                    for p in (user.get("first_name"), user.get("last_name"))
                    if p
                ).strip()
                or None
            ),
            avatar_url=user.get("avatar"),
            raw=raw,
        )


# --------------------------------------------------------------------------- #
# GitHub
# --------------------------------------------------------------------------- #
class GitHubProvider(_ProviderBase):
    """GitHub OAuth2.

    Userinfo: ``GET https://api.github.com/user`` returns::

        {
          "login": "ivanivanov",
          "id": 11223344,
          "avatar_url": "https://avatars.githubusercontent.com/u/...",
          "name": "Иван Иванов",
          "email": "ivan@example.com"   # null when the user hides it
        }

    GitHub returns ``email = null`` whenever the user has set their
    primary email to *private* (default for accounts created since 2020).
    Our provisioning flow refuses no-email profiles (``OAUTH_NO_EMAIL``),
    so we ALSO hit the ``/user/emails`` endpoint — that one needs the
    ``user:email`` scope (already in defaults) and returns every linked
    email regardless of visibility. We pick the ``primary``+``verified``
    one to fill the gap.
    """

    name: ClassVar[str] = "github"
    authorize_url: ClassVar[str] = "https://github.com/login/oauth/authorize"
    token_url: ClassVar[str] = "https://github.com/login/oauth/access_token"
    userinfo_url: ClassVar[str] = "https://api.github.com/user"
    emails_url: ClassVar[str] = "https://api.github.com/user/emails"
    default_scopes: ClassVar[list[str]] = ["read:user", "user:email"]

    extra_headers: ClassVar[dict[str, str]] = {
        "X-GitHub-Api-Version": "2022-11-28",
    }

    async def fetch_userinfo(self, access_token: str) -> OAuthProfile:
        headers = {
            "Authorization": f"{self.auth_header_scheme} {access_token}",
            "Accept": "application/json",
        }
        headers.update(self.extra_headers)
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(self.userinfo_url, headers=headers)
            resp.raise_for_status()
            payload = resp.json()
            # Patch the missing email from /user/emails when the user
            # has their primary address marked private. Best-effort — a
            # 404/403 here means the token simply lacks user:email scope,
            # in which case the downstream OAUTH_NO_EMAIL is the correct
            # error.
            if not payload.get("email"):
                try:
                    er = await client.get(self.emails_url, headers=headers)
                    if er.status_code == 200:
                        emails = er.json()
                        primary = next(
                            (
                                e
                                for e in emails
                                if isinstance(e, dict)
                                and e.get("primary")
                                and e.get("verified")
                                and e.get("email")
                            ),
                            None,
                        )
                        # Fallback: any verified email when no entry is
                        # flagged primary (rare, but observed on legacy
                        # accounts).
                        if primary is None:
                            primary = next(
                                (
                                    e
                                    for e in emails
                                    if isinstance(e, dict)
                                    and e.get("verified")
                                    and e.get("email")
                                ),
                                None,
                            )
                        if primary:
                            payload["email"] = primary["email"]
                            payload["_email_verified"] = True
                except httpx.HTTPError:
                    # Network blip: surface the original (no-email) profile
                    # so the higher-level handler produces a clean 400 with
                    # a "configure email scope" hint, not a 500.
                    pass
        return self.parse_userinfo(payload)

    def parse_userinfo(self, raw: dict[str, Any]) -> OAuthProfile:
        # GitHub recommends ``id`` as the stable subject, but we expose
        # ``login`` for human readability — for matching we use ``id``.
        login = raw.get("login")
        gh_id = raw.get("id")
        if gh_id is None and not login:
            raise ValueError("GitHub userinfo response missing 'id'/'login'")
        # Use numeric id when available (it's stable), otherwise fall back to login.
        provider_user_id = str(gh_id) if gh_id is not None else str(login)
        email = raw.get("email")
        # ``_email_verified`` is our own breadcrumb set by ``fetch_userinfo``
        # when we filled the email in from /user/emails (where every entry
        # carries an explicit verified flag). When we read the email
        # directly from /user there's no verification flag in the payload,
        # so we infer "verified" from "present" — GitHub doesn't expose
        # unverified primaries via /user.
        verified_hint = raw.get("_email_verified")
        return OAuthProfile(
            provider=self.name,
            provider_user_id=provider_user_id,
            email=email.lower() if isinstance(email, str) else None,
            email_verified=(
                bool(verified_hint) if verified_hint is not None else bool(email)
            ),
            display_name=raw.get("name") or login,
            avatar_url=raw.get("avatar_url"),
            raw=raw,
        )


# --------------------------------------------------------------------------- #
# Telegram (Login Widget — NOT real OAuth2)
# --------------------------------------------------------------------------- #
class TelegramProvider(_ProviderBase):
    """Telegram Login Widget.

    Telegram doesn't speak OAuth2 — sign-in is driven from
    :mod:`identity_service.api.v1.auth_telegram` (HMAC-verified callback
    from ``t.me/<bot>?domain=...``). This class exists only so that
    ``assert_provider("telegram")`` succeeds for shared code-paths that
    treat every identity provider uniformly (admin OAuth list, unlink,
    ``OAuthIdentity`` foreign keys).

    Calling the OAuth2 helpers raises — :func:`assert_provider_enabled`
    refuses Telegram via ``settings.oauth_providers_enabled``, so we
    should never get here in practice.
    """

    name: ClassVar[str] = "telegram"
    authorize_url: ClassVar[str] = ""
    token_url: ClassVar[str] = ""
    userinfo_url: ClassVar[str] = ""
    default_scopes: ClassVar[list[str]] = []

    async def fetch_userinfo(self, access_token: str) -> OAuthProfile:  # pragma: no cover
        raise NotImplementedError(
            "Telegram uses Login Widget — see auth_telegram.py instead."
        )

    def parse_userinfo(self, raw: dict[str, Any]) -> OAuthProfile:  # pragma: no cover
        raise NotImplementedError(
            "Telegram uses Login Widget — see auth_telegram.py instead."
        )


# --------------------------------------------------------------------------- #
# Registry
# --------------------------------------------------------------------------- #
_PROVIDER_CLASSES: dict[str, type[_ProviderBase]] = {
    GoogleProvider.name: GoogleProvider,
    YandexProvider.name: YandexProvider,
    StepikProvider.name: StepikProvider,
    GitHubProvider.name: GitHubProvider,
    TelegramProvider.name: TelegramProvider,
}


def get_provider(name: str) -> OAuthProvider | None:
    """Return a fresh provider instance, or ``None`` if name is unknown."""
    cls = _PROVIDER_CLASSES.get(name)
    if cls is None:
        return None
    return cls()  # type: ignore[return-value]


def list_known_providers() -> list[str]:
    """Names of all built-in providers (regardless of configuration)."""
    return list(_PROVIDER_CLASSES.keys())
