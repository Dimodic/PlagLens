"""Telegram Login Widget — sign-in via the Telegram bot.

Telegram doesn't speak OAuth2. Instead ``t.me/<bot>`` issues an in-app
confirmation dialog and redirects the browser back to our callback with
query parameters::

    id, first_name, last_name, username, photo_url, auth_date, hash

The ``hash`` field is an HMAC-SHA256 of the rest of the payload, keyed by
the bot's API token (the very same one returned by @BotFather). Our job
here is:

1. Recover the bot token from the OAuth provider override (the admin set
   it in /admin/oauth/providers → Telegram, with client_id =
   bot_username and client_secret = bot_token).
2. Re-compute the HMAC and reject anything that doesn't match —
   otherwise anyone could forge a Telegram callback.
3. Reject callbacks older than 60 s — replay protection.
4. Find-or-provision a user, link the Telegram identity, and finish like
   any other OAuth callback (set refresh cookie, redirect to the SPA).

The created user has NO email — Telegram accounts authenticate by their
``(provider="telegram", telegram_id)`` OAuth link, not by an address.
``users.email`` is nullable; the user can add a real address from
/me/profile later if they want email notifications.
"""
from __future__ import annotations

import hashlib
import hmac
import logging
import time
from datetime import datetime, timedelta, timezone
from urllib.parse import urlencode

from fastapi import APIRouter, Depends, Request, Response, status
from fastapi.responses import RedirectResponse
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from ...common.ids import oauth_id, session_id, user_id
from ...common.problem import ProblemException
from ...common.security import (
    hash_token,
    issue_access_token,
    new_refresh_token,
)
from ...config import settings
from ...deps import get_session
from ...models import OAuthIdentity, User
from ...models import Session as DBSession
from ...repositories.oauth import OAuthIdentityRepository
from ...repositories.sessions import SessionRepository
from ...repositories.tenants import TenantRepository
from ...repositories.users import UserRepository
from .auth_oauth import _set_refresh_cookie

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/auth/oauth/telegram", tags=["auth", "oauth", "telegram"])

# Telegram replay window. The widget timestamps every callback; we refuse
# anything older than this. 60 s is what Telegram themselves recommend.
_TELEGRAM_MAX_AGE_S = 60


class TelegramBotInfo(BaseModel):
    """Public bits the SPA needs to render the Telegram Login Widget."""

    enabled: bool
    bot_username: str | None = None
    # Numeric bot id used by the in-page ``Telegram.Login.auth`` JS API
    # (``data-telegram-login`` widget mode also accepts it). It's the
    # integer prefix of the bot token — Telegram tokens are formatted as
    # ``<bot_id>:<hash>`` — so we don't need a network call to derive it.
    # Safe to expose: the bot id is public (visible in any t.me/<bot>
    # share link metadata).
    bot_id: int | None = None
    redirect_uri: str


def _get_bot_credentials() -> tuple[str, str] | None:
    """Return ``(bot_username, bot_token)`` if Telegram is configured.

    We piggy-back on the existing OAuth provider override storage
    (``settings.oauth_credentials``) — admins fill in client_id =
    bot_username and client_secret = bot_token from @BotFather.
    """
    cid, csec = settings.oauth_credentials("telegram")
    cid = (cid or "").strip().lstrip("@")
    csec = (csec or "").strip()
    if not cid or not csec:
        return None
    return cid, csec


def _verify_telegram_signature(payload: dict[str, str], bot_token: str) -> bool:
    """Validate the HMAC-SHA256 signature that Telegram appends to every
    Login Widget redirect.

    Telegram spec (https://core.telegram.org/widgets/login#checking-authorization):

      - secret_key = SHA-256(bot_token)
      - data_check_string = "\\n".join(sorted("k=v" for every field except hash))
      - hash = HMAC_SHA256(secret_key, data_check_string)

    A constant-time compare avoids timing leaks even though the cost here
    is dwarfed by the network RTT.
    """
    sent_hash = payload.get("hash", "")
    if not sent_hash:
        return False
    pairs = sorted(f"{k}={v}" for k, v in payload.items() if k != "hash")
    data_check_string = "\n".join(pairs)
    secret_key = hashlib.sha256(bot_token.encode("utf-8")).digest()
    computed = hmac.new(
        secret_key, data_check_string.encode("utf-8"), hashlib.sha256
    ).hexdigest()
    return hmac.compare_digest(computed, sent_hash)


def _build_display_name(payload: dict[str, str]) -> str:
    first = payload.get("first_name", "").strip()
    last = payload.get("last_name", "").strip()
    full = f"{first} {last}".strip()
    return full or payload.get("username", "").strip() or f"tg-{payload.get('id', '')}"


def _build_redirect(redirect_url: str | None, *, params: dict[str, str]) -> str:
    base = redirect_url or "/"
    qs = urlencode({k: v for k, v in params.items() if v != ""})
    if not qs:
        return base
    sep = "&" if "?" in base else "?"
    return f"{base}{sep}{qs}"


def _extract_bot_id(bot_token: str) -> int | None:
    """Telegram tokens are formatted ``<bot_id>:<hash>`` — pull the int.

    Returns ``None`` for malformed tokens; callers fall back to the
    widget mode (``data-telegram-login``) which only needs the username.
    """
    head, sep, _ = bot_token.partition(":")
    if not sep:
        return None
    try:
        return int(head)
    except ValueError:
        return None


@router.get("/info", response_model=TelegramBotInfo)
async def telegram_info() -> TelegramBotInfo:
    """Public endpoint — the SPA needs to know the bot username (and
    numeric id, for the JS ``Telegram.Login.auth`` API) to render the
    Login Widget. We don't leak the token; only its presence."""
    base = settings.oauth_callback_base_url.rstrip("/")
    redirect_uri = f"{base}/api/v1/auth/oauth/telegram/callback"
    creds = _get_bot_credentials()
    if not creds:
        return TelegramBotInfo(enabled=False, redirect_uri=redirect_uri)
    bot_username, bot_token = creds
    return TelegramBotInfo(
        enabled=True,
        bot_username=bot_username,
        bot_id=_extract_bot_id(bot_token),
        redirect_uri=redirect_uri,
    )


@router.get("/callback")
async def telegram_callback(
    request: Request,
    return_url: str | None = None,
    session: AsyncSession = Depends(get_session),
) -> Response:
    creds = _get_bot_credentials()
    if not creds:
        raise ProblemException(
            status=400,
            code="TELEGRAM_NOT_CONFIGURED",
            title="Telegram login is not configured for this deployment",
        )
    _, bot_token = creds

    # Telegram passes everything in the query string.
    payload: dict[str, str] = {
        k: v for k, v in request.query_params.items() if k != "return_url"
    }
    if "id" not in payload or "hash" not in payload:
        raise ProblemException(
            status=400, code="TELEGRAM_BAD_PAYLOAD", title="Missing fields"
        )

    if not _verify_telegram_signature(payload, bot_token):
        raise ProblemException(
            status=400,
            code="TELEGRAM_BAD_SIGNATURE",
            title="Telegram signature mismatch",
        )

    # Replay protection: reject ancient callbacks.
    try:
        auth_date = int(payload.get("auth_date", "0"))
    except ValueError:
        auth_date = 0
    now = int(time.time())
    if not auth_date or now - auth_date > _TELEGRAM_MAX_AGE_S:
        raise ProblemException(
            status=400, code="TELEGRAM_STALE", title="Login data is too old"
        )

    telegram_id = str(payload["id"])
    display_name = _build_display_name(payload)
    avatar_url = payload.get("photo_url") or None

    ip = request.client.host if request.client else None
    user_agent = request.headers.get("user-agent")

    oauth_repo = OAuthIdentityRepository(session)
    user_repo = UserRepository(session)
    tenant_repo = TenantRepository(session)

    # 1) Already linked → straight login.
    existing_link = await oauth_repo.get_by_provider_subject(
        "telegram", telegram_id
    )
    if existing_link is not None:
        user = await user_repo.get(existing_link.user_id)
        if user is None:
            raise ProblemException(
                status=500,
                code="DANGLING_OAUTH_LINK",
                title="Linked user not found",
            )
        return await _finish_login(
            session, user, ip=ip, user_agent=user_agent, return_url=return_url
        )

    # 2) No Telegram link yet → provision a fresh account. Telegram accounts
    # authenticate by their (provider, telegram_id) OAuth link, not by email,
    # so we create the user WITHOUT an email — no synthetic address. (Existing
    # Telegram users always carry their link, so they take the path above;
    # only genuinely new ones reach here.)
    #
    # Pick a tenant. Telegram sign-ups land in the canonical 'hse' tenant to
    # match the rest of the OAuth flow; if it doesn't exist we fall back to
    # the first tenant in the system (single-tenant deploys).
    tenant = await tenant_repo.get_by_slug("hse")
    if tenant is None:
        tenants = await tenant_repo.list()
        if not tenants:
            raise ProblemException(
                status=500,
                code="NO_TENANT",
                title="System has no tenants configured",
            )
        tenant = tenants[0]

    new_user = User(
        id=user_id(),
        tenant_id=tenant.id,
        email=None,
        email_verified_at=None,
        display_name=display_name or "Telegram user",
        global_role="student",
        locale="ru",
        status="active",
        avatar_url=avatar_url,
        password_hash=None,
    )
    session.add(new_user)
    await session.flush()

    session.add(
        OAuthIdentity(
            id=oauth_id(),
            user_id=new_user.id,
            provider="telegram",
            provider_user_id=telegram_id,
            email=None,
            raw_profile=payload,
        )
    )

    return await _finish_login(
        session,
        new_user,
        ip=ip,
        user_agent=user_agent,
        return_url=return_url,
    )


async def _finish_login(
    session: AsyncSession,
    user: User,
    *,
    ip: str | None,
    user_agent: str | None,
    return_url: str | None,
) -> Response:
    """Mint a session + access token, set refresh cookie, redirect to SPA.

    Mirrors :py:meth:`OAuthService._issue_session` — we don't go through
    AuthService because Telegram has no password to verify and we already
    completed our own integrity check above.
    """
    refresh = new_refresh_token()
    sess = DBSession(
        id=session_id(),
        user_id=user.id,
        refresh_token_hash=hash_token(refresh),
        ip=ip,
        user_agent=user_agent,
        expires_at=datetime.now(timezone.utc)
        + timedelta(seconds=settings.refresh_ttl_seconds),
    )
    await SessionRepository(session).add(sess)
    access = issue_access_token(
        user_id=user.id,
        tenant_id=user.tenant_id,
        global_role=user.global_role,
    )
    user.last_login_at = datetime.now(timezone.utc)
    await session.commit()

    # Send the user back to whatever the SPA asked for, defaulting to the
    # root with ?login=success so the layout reads it as a fresh sign-in.
    # The SPA's OAuthCallbackPage will call /auth/refresh next — the
    # refresh cookie we're about to set is enough to mint an access token.
    target = _build_redirect(return_url, params={"login": "success"})
    response = RedirectResponse(target, status_code=status.HTTP_302_FOUND)
    _set_refresh_cookie(response, refresh)
    # ``access`` is intentionally not surfaced here — the SPA pulls a fresh
    # one via /auth/refresh on landing. Keep the local for readability.
    _ = access
    return response
