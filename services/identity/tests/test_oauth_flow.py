"""End-to-end OAuth flow tests (mocked HTTP via respx).

We never make real OAuth calls — `respx.mock` intercepts the token + userinfo
endpoints. Tests cover:

* full happy path for each provider (authorize → callback → user provisioned);
* state validation: unknown state, expired state, provider mismatch;
* link flow (existing user adds a new provider);
* unlink protections (refuse to remove last login method);
* "provider not configured" rejection.
"""
from __future__ import annotations

import json
from typing import Any
from urllib.parse import parse_qs, urlparse

import httpx
import pytest
import respx

from identity_service.config import settings as svc_settings
from identity_service.models import OAuthIdentity, User


# --------------------------------------------------------------------------- #
# Fixtures
# --------------------------------------------------------------------------- #
@pytest.fixture(autouse=True)
def _set_oauth_creds(monkeypatch):
    """All four providers configured for tests, regardless of host env."""
    monkeypatch.setattr(svc_settings, "google_client_id", "g_id")
    monkeypatch.setattr(svc_settings, "google_client_secret", "g_secret")
    monkeypatch.setattr(svc_settings, "yandex_client_id", "y_id")
    monkeypatch.setattr(svc_settings, "yandex_client_secret", "y_secret")
    monkeypatch.setattr(svc_settings, "stepik_client_id", "s_id")
    monkeypatch.setattr(svc_settings, "stepik_client_secret", "s_secret")
    monkeypatch.setattr(svc_settings, "github_client_id", "h_id")
    monkeypatch.setattr(svc_settings, "github_client_secret", "h_secret")
    monkeypatch.setattr(
        svc_settings, "oauth_callback_base_url", "http://gateway.test"
    )


def _userinfo_for(provider: str, *, sub: str = "1234", email: str = "ivan@example.com") -> dict[str, Any]:
    if provider == "google":
        return {
            "sub": sub,
            "email": email,
            "email_verified": True,
            "name": "Ivan Ivanov",
            "picture": "https://lh3.googleusercontent.com/test",
        }
    if provider == "yandex":
        return {
            "id": sub,
            "login": "ivan",
            "default_email": email,
            "real_name": "Ivan Ivanov",
            "display_name": "Ivan",
            "default_avatar_id": "av-1",
            "is_avatar_empty": False,
        }
    if provider == "stepik":
        return {
            "users": [
                {
                    "id": int(sub) if sub.isdigit() else sub,
                    "first_name": "Ivan",
                    "last_name": "Ivanov",
                    "full_name": "Ivan Ivanov",
                    "email": email,
                    "avatar": "https://stepik.org/static/avatar.png",
                }
            ]
        }
    if provider == "github":
        return {
            "id": int(sub) if sub.isdigit() else 11223344,
            "login": "ivanivanov",
            "name": "Ivan Ivanov",
            "email": email,
            "avatar_url": "https://avatars.githubusercontent.com/u/11223344",
        }
    raise ValueError(provider)


def _token_url(provider: str) -> str:
    return {
        "google": "https://oauth2.googleapis.com/token",
        "yandex": "https://oauth.yandex.ru/token",
        "stepik": "https://stepik.org/oauth2/token",
        "github": "https://github.com/login/oauth/access_token",
    }[provider]


def _userinfo_url(provider: str) -> str:
    return {
        "google": "https://openidconnect.googleapis.com/v1/userinfo",
        "yandex": "https://login.yandex.ru/info",
        "stepik": "https://stepik.org/api/users/me",
        "github": "https://api.github.com/user",
    }[provider]


# --------------------------------------------------------------------------- #
# /authorize
# --------------------------------------------------------------------------- #
@pytest.mark.asyncio
async def test_authorize_redirects_to_provider(client, seed_tenant):
    r = await client.get(
        "/api/v1/auth/oauth/google/authorize",
        params={"tenant_slug": seed_tenant.slug, "redirect_url": "/dash"},
        follow_redirects=False,
    )
    assert r.status_code == 302, r.text
    target = r.headers["location"]
    parsed = urlparse(target)
    assert parsed.netloc.endswith("google.com")
    qs = parse_qs(parsed.query)
    # PKCE + state
    assert "state" in qs and len(qs["state"][0]) > 16
    assert qs["code_challenge_method"] == ["S256"]
    assert "code_challenge" in qs
    # Google-specific param
    assert qs["prompt"] == ["consent"]
    assert qs["client_id"] == ["g_id"]
    assert qs["redirect_uri"] == [
        "http://gateway.test/api/v1/auth/oauth/google/callback"
    ]
    assert qs["scope"] == ["openid email profile"]


@pytest.mark.asyncio
async def test_authorize_yandex_force_confirm(client, seed_tenant):
    r = await client.get(
        "/api/v1/auth/oauth/yandex/authorize",
        params={"tenant_slug": seed_tenant.slug, "format": "json"},
        follow_redirects=False,
    )
    assert r.status_code == 200, r.text
    body = r.json()
    parsed = urlparse(body["authorize_url"])
    qs = parse_qs(parsed.query)
    assert qs["force_confirm"] == ["true"]
    assert qs["scope"] == ["login:email login:info"]


@pytest.mark.asyncio
async def test_authorize_unknown_provider(client, seed_tenant):
    r = await client.get(
        "/api/v1/auth/oauth/unknown/authorize",
        params={"tenant_slug": seed_tenant.slug},
        follow_redirects=False,
    )
    assert r.status_code == 404
    assert r.json()["code"] == "NOT_FOUND"


@pytest.mark.asyncio
async def test_authorize_provider_not_configured(client, seed_tenant, monkeypatch):
    monkeypatch.setattr(svc_settings, "google_client_id", "")
    monkeypatch.setattr(svc_settings, "google_client_secret", "")
    monkeypatch.setattr(svc_settings, "oauth_google_client_id", "")
    monkeypatch.setattr(svc_settings, "oauth_google_client_secret", "")
    r = await client.get(
        "/api/v1/auth/oauth/google/authorize",
        params={"tenant_slug": seed_tenant.slug},
        follow_redirects=False,
    )
    assert r.status_code == 400
    body = r.json()
    assert body["code"] == "OAUTH_PROVIDER_NOT_CONFIGURED"


# --------------------------------------------------------------------------- #
# /callback — happy path (new user)
# --------------------------------------------------------------------------- #
@pytest.mark.parametrize(
    "provider", ["google", "yandex", "stepik", "github"]
)
@pytest.mark.asyncio
async def test_callback_creates_new_user(
    provider, client, seed_tenant, session_factory
):
    # 1) Initiate flow → grab the state.
    r1 = await client.get(
        f"/api/v1/auth/oauth/{provider}/authorize",
        params={"tenant_slug": seed_tenant.slug, "format": "json"},
    )
    assert r1.status_code == 200, r1.text
    state = r1.json()["state"]

    # 2) Mock the provider HTTP endpoints.
    with respx.mock(assert_all_called=False) as mock:
        mock.post(_token_url(provider)).mock(
            return_value=httpx.Response(
                200,
                json={
                    "access_token": "PROVIDER_AT",
                    "expires_in": 3600,
                    "refresh_token": "PROVIDER_RT",
                },
            )
        )
        mock.get(_userinfo_url(provider)).mock(
            return_value=httpx.Response(
                200, json=_userinfo_for(provider, sub="9001", email=f"new-{provider}@example.com")
            )
        )

        r2 = await client.get(
            f"/api/v1/auth/oauth/{provider}/callback",
            params={"code": "AUTH_CODE", "state": state, "format": "json"},
            follow_redirects=False,
        )

    assert r2.status_code == 200, r2.text
    body = r2.json()
    assert body["access_token"]
    assert body["expires_in"] >= 60
    assert body["is_new_user"] is True
    assert body["link_required"] is False
    assert body["user"]["email"] == f"new-{provider}@example.com"
    # Refresh cookie set
    assert svc_settings.refresh_cookie_name in r2.cookies

    # User + identity persisted.
    from sqlalchemy import select

    async with session_factory() as s:
        users = (
            (await s.execute(select(User).where(User.email == f"new-{provider}@example.com")))
            .scalars()
            .all()
        )
        assert len(users) == 1
        ids = (
            (
                await s.execute(
                    select(OAuthIdentity).where(
                        OAuthIdentity.provider == provider,
                        OAuthIdentity.provider_user_id == "9001"
                        if provider != "github"
                        else OAuthIdentity.provider_user_id == "9001",
                    )
                )
            )
            .scalars()
            .all()
        )
        assert len(ids) == 1
        assert ids[0].user_id == users[0].id


# --------------------------------------------------------------------------- #
# /callback — existing user (already linked) → straight login
# --------------------------------------------------------------------------- #
@pytest.mark.asyncio
async def test_callback_logs_in_existing_linked_user(
    client, seed_tenant, seed_user, session_factory
):
    # Pre-link `seed_user` with a Google identity.
    async with session_factory() as s:
        s.add(
            OAuthIdentity(
                id="oid_test1",
                user_id=seed_user.id,
                provider="google",
                provider_user_id="999",
                email=seed_user.email,
                raw_profile={},
            )
        )
        await s.commit()

    r1 = await client.get(
        "/api/v1/auth/oauth/google/authorize",
        params={"tenant_slug": seed_tenant.slug, "format": "json"},
    )
    state = r1.json()["state"]

    with respx.mock(assert_all_called=False) as mock:
        mock.post(_token_url("google")).mock(
            return_value=httpx.Response(200, json={"access_token": "AT"})
        )
        mock.get(_userinfo_url("google")).mock(
            return_value=httpx.Response(
                200, json=_userinfo_for("google", sub="999", email=seed_user.email)
            )
        )
        r2 = await client.get(
            "/api/v1/auth/oauth/google/callback",
            params={"code": "C", "state": state, "format": "json"},
            follow_redirects=False,
        )

    assert r2.status_code == 200
    body = r2.json()
    assert body["is_new_user"] is False
    assert body["user"]["id"] == seed_user.id


# --------------------------------------------------------------------------- #
# /callback — link required (existing email, no link)
# --------------------------------------------------------------------------- #
@pytest.mark.asyncio
async def test_callback_link_required_for_existing_email(
    client, seed_tenant, seed_user
):
    r1 = await client.get(
        "/api/v1/auth/oauth/google/authorize",
        params={"tenant_slug": seed_tenant.slug, "format": "json"},
    )
    state = r1.json()["state"]

    with respx.mock(assert_all_called=False) as mock:
        mock.post(_token_url("google")).mock(
            return_value=httpx.Response(200, json={"access_token": "AT"})
        )
        mock.get(_userinfo_url("google")).mock(
            return_value=httpx.Response(
                200, json=_userinfo_for("google", sub="22222", email=seed_user.email)
            )
        )
        r2 = await client.get(
            "/api/v1/auth/oauth/google/callback",
            params={"code": "C", "state": state, "format": "json"},
            follow_redirects=False,
        )
    assert r2.status_code == 200, r2.text
    body = r2.json()
    assert body["link_required"] is True
    assert body["link_token"]
    # No JWT issued for the link path.
    assert body["access_token"] == ""


# --------------------------------------------------------------------------- #
# State validation
# --------------------------------------------------------------------------- #
@pytest.mark.asyncio
async def test_callback_unknown_state(client):
    r = await client.get(
        "/api/v1/auth/oauth/google/callback",
        params={"code": "C", "state": "not-issued"},
        follow_redirects=False,
    )
    assert r.status_code == 400
    assert r.json()["code"] == "BAD_REQUEST"


@pytest.mark.asyncio
async def test_callback_state_provider_mismatch(app, client, seed_tenant):
    """A state issued for `google` cannot be used on the `yandex` callback."""
    r1 = await client.get(
        "/api/v1/auth/oauth/google/authorize",
        params={"tenant_slug": seed_tenant.slug, "format": "json"},
    )
    state = r1.json()["state"]

    r = await client.get(
        "/api/v1/auth/oauth/yandex/callback",
        params={"code": "C", "state": state},
        follow_redirects=False,
    )
    assert r.status_code == 400
    assert "provider" in (r.json().get("title", "") + r.json().get("detail", "")).lower()


@pytest.mark.asyncio
async def test_callback_expired_state(app, client, seed_tenant):
    """Manually backdate the state record so the timestamp check fires."""
    r1 = await client.get(
        "/api/v1/auth/oauth/google/authorize",
        params={"tenant_slug": seed_tenant.slug, "format": "json"},
    )
    state = r1.json()["state"]

    redis = app.state.redis
    key = f"oauth:state:{state}"
    raw = await redis.get(key)
    payload = json.loads(raw)
    payload["expires_at"] = "2000-01-01T00:00:00+00:00"
    await redis.set(key, json.dumps(payload))

    r = await client.get(
        "/api/v1/auth/oauth/google/callback",
        params={"code": "C", "state": state},
        follow_redirects=False,
    )
    assert r.status_code == 400


@pytest.mark.asyncio
async def test_callback_provider_returns_error_param(client, seed_tenant):
    r1 = await client.get(
        "/api/v1/auth/oauth/google/authorize",
        params={"tenant_slug": seed_tenant.slug, "format": "json"},
    )
    state = r1.json()["state"]
    r = await client.get(
        "/api/v1/auth/oauth/google/callback",
        params={
            "state": state,
            "error": "access_denied",
            "error_description": "user said no",
        },
        follow_redirects=False,
    )
    assert r.status_code == 400
    assert r.json()["code"] == "OAUTH_PROVIDER_ERROR"


# --------------------------------------------------------------------------- #
# Link flow
# --------------------------------------------------------------------------- #
@pytest.mark.asyncio
async def test_link_flow_attaches_provider_to_existing_user(
    client, auth_admin, seed_user, session_factory
):
    # 1) Authenticated user starts a link flow.
    r_link = await client.post(
        "/api/v1/auth/oauth/github/link",
        headers=auth_admin,
    )
    assert r_link.status_code == 200, r_link.text
    body = r_link.json()
    state = body["state"]

    # The state record must carry link_user_id.
    # 2) Provider redirects back to /callback. With the link state, the service
    # should add the OAuthIdentity to seed_user without minting a new session.
    with respx.mock(assert_all_called=False) as mock:
        mock.post(_token_url("github")).mock(
            return_value=httpx.Response(200, json={"access_token": "AT"})
        )
        mock.get(_userinfo_url("github")).mock(
            return_value=httpx.Response(
                200, json=_userinfo_for("github", sub="555", email="other@x.com")
            )
        )
        r2 = await client.get(
            "/api/v1/auth/oauth/github/callback",
            params={"code": "C", "state": state, "format": "json"},
            follow_redirects=False,
        )
    # When state has link_user_id set the callback finalises the link silently
    # and returns the standard JSON envelope (no JWT — link flow).
    assert r2.status_code == 200, r2.text

    # Verify the identity row is now attached to seed_user.
    from sqlalchemy import select

    async with session_factory() as s:
        rows = (
            (
                await s.execute(
                    select(OAuthIdentity).where(
                        OAuthIdentity.provider == "github",
                        OAuthIdentity.provider_user_id == "555",
                    )
                )
            )
            .scalars()
            .all()
        )
        assert len(rows) == 1
        assert rows[0].user_id == seed_user.id


# --------------------------------------------------------------------------- #
# Unlink
# --------------------------------------------------------------------------- #
@pytest.mark.asyncio
async def test_unlink_works_when_password_present(
    client, auth_admin, seed_user, session_factory
):
    async with session_factory() as s:
        s.add(
            OAuthIdentity(
                id="oid_unlink_1",
                user_id=seed_user.id,
                provider="google",
                provider_user_id="abc",
                email=seed_user.email,
                raw_profile={},
            )
        )
        await s.commit()

    r = await client.delete(
        "/api/v1/auth/oauth/google/unlink", headers=auth_admin
    )
    assert r.status_code == 204, r.text


@pytest.mark.asyncio
async def test_unlink_refused_for_last_login_method(
    client, session_factory, seed_tenant
):
    """User has NO password and only ONE OAuth identity → 409 on unlink."""
    from identity_service.common.security import issue_access_token
    from identity_service.models import User

    # Create a passwordless OAuth-only user with ONE identity.
    async with session_factory() as s:
        u = User(
            id="usr_oauth_only",
            tenant_id=seed_tenant.id,
            email="oauth-only@example.com",
            password_hash=None,
            display_name="OO",
            global_role="student",
        )
        s.add(u)
        s.add(
            OAuthIdentity(
                id="oid_only",
                user_id=u.id,
                provider="google",
                provider_user_id="solo",
                email=u.email,
                raw_profile={},
            )
        )
        await s.commit()
    token = issue_access_token(
        user_id="usr_oauth_only",
        tenant_id=seed_tenant.id,
        global_role="student",
    )
    headers = {"Authorization": f"Bearer {token}"}
    r = await client.delete(
        "/api/v1/auth/oauth/google/unlink", headers=headers
    )
    assert r.status_code == 409
    assert r.json()["code"] == "CONFLICT"


@pytest.mark.asyncio
async def test_unlink_404_when_provider_not_linked(client, auth_admin):
    r = await client.delete(
        "/api/v1/auth/oauth/google/unlink", headers=auth_admin
    )
    assert r.status_code == 404


# --------------------------------------------------------------------------- #
# Existing email + password login still works alongside OAuth
# --------------------------------------------------------------------------- #
@pytest.mark.asyncio
async def test_password_login_still_works(client, seed_tenant, seed_user):
    r = await client.post(
        "/api/v1/auth/login",
        json={
            "email": seed_user.email,
            "password": "p4ssword!",
            "tenant_slug": seed_tenant.slug,
        },
    )
    assert r.status_code == 200
    assert r.json()["access_token"]
