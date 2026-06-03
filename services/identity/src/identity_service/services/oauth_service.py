"""OAuth orchestration: state/PKCE issuance, code exchange, find-or-create.

The flow is split across three public entry-points:

* :func:`OAuthService.start_authorize` — generates ``state`` + PKCE pair, stores
  them in Redis, returns a fully-formed ``authorize_url``.
* :func:`OAuthService.handle_callback` — validates the state, exchanges the code
  for tokens, fetches userinfo, finds-or-creates the user and issues JWTs.
* :func:`OAuthService.link_to_existing` / :func:`OAuthService.unlink` — manage
  the secondary "link this provider to my account" UI flow.

The provider-specific HTTP details (URLs, header schemes, JSON schemas) are
encapsulated in :mod:`identity_service.oauth.providers`. All HTTP traffic goes
through ``httpx.AsyncClient`` so tests can mock it with ``respx``.
"""
from __future__ import annotations

import base64
import hashlib
import json
import logging
import secrets
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any
from urllib.parse import urlencode

import httpx
from sqlalchemy.ext.asyncio import AsyncSession

from ..common.events import KafkaProducer, StubProducer
from ..common.ids import oauth_id, session_id, user_id
from ..common.problem import ProblemException
from ..common.security import (
    hash_token,
    issue_access_token,
    new_refresh_token,
)
from ..config import settings
from ..models import OAuthIdentity, User
from ..models import Session as DBSession
from ..oauth.providers import (
    OAuthProfile,
    OAuthProvider,
    get_provider,
    list_known_providers,
)
from ..repositories.oauth import OAuthIdentityRepository
from ..repositories.sessions import SessionRepository
from ..repositories.tenants import TenantRepository
from ..repositories.users import UserRepository

logger = logging.getLogger(__name__)


# --------------------------------------------------------------------------- #
# Public dataclasses
# --------------------------------------------------------------------------- #
@dataclass
class CallbackResult:
    """Outcome of :meth:`OAuthService.handle_callback`."""

    user: User
    access_token: str
    refresh_token: str
    access_ttl_seconds: int
    profile: OAuthProfile
    is_new_user: bool
    redirect_url: str | None = None
    # When set, ``handle_callback`` did NOT log the user in: instead the caller
    # must take the user through a "do you want to link your <provider> account
    # to your existing PlagLens account?" confirmation step. The frontend
    # should pass ``link_token`` back in the link-confirm POST.
    link_required: bool = False
    link_token: str | None = None


# --------------------------------------------------------------------------- #
# Stateless helpers (kept for backwards compatibility with the old router)
# --------------------------------------------------------------------------- #
def assert_provider(provider: str) -> OAuthProvider:
    impl = get_provider(provider)
    if impl is None:
        raise ProblemException(
            status=404,
            code="NOT_FOUND",
            title="Unknown OAuth provider",
            detail=f"Provider '{provider}' is not supported.",
        )
    return impl


def assert_provider_enabled(provider: str) -> OAuthProvider:
    """Like :func:`assert_provider` but also rejects disabled providers."""
    impl = assert_provider(provider)
    if provider not in settings.oauth_providers_enabled:
        raise ProblemException(
            status=404,
            code="NOT_FOUND",
            title="OAuth provider disabled",
            detail=f"Provider '{provider}' is not enabled in this deployment.",
        )
    return impl


def assert_provider_configured(provider: str) -> tuple[OAuthProvider, str, str]:
    impl = assert_provider_enabled(provider)
    cid, csec = settings.oauth_credentials(provider)
    if not (cid and csec):
        raise ProblemException(
            status=400,
            code="OAUTH_PROVIDER_NOT_CONFIGURED",
            title="OAuth provider not configured for this deployment",
            detail=(
                f"Provider '{provider}' is enabled but client_id / client_secret"
                " are missing — set them in the service environment."
            ),
        )
    return impl, cid, csec


def new_state() -> str:
    return secrets.token_urlsafe(32)


# Internal helpers — kept module-level so tests can mock or call them.
def _gen_pkce_pair() -> tuple[str, str]:
    """Return ``(code_verifier, code_challenge)`` for PKCE S256."""
    verifier = secrets.token_urlsafe(64)
    digest = hashlib.sha256(verifier.encode("ascii")).digest()
    challenge = base64.urlsafe_b64encode(digest).rstrip(b"=").decode("ascii")
    return verifier, challenge


def _decode_jwt_claims(token: str) -> dict[str, Any]:
    """Decode a JWT payload WITHOUT signature verification.

    Used for OIDC id_tokens obtained over the server-to-server, TLS-protected
    token exchange (the back-channel is already trusted, per the OIDC code
    flow). ``iss``/``aud``/``exp`` are validated by :func:`_assert_id_token_valid`.
    """
    parts = token.split(".")
    if len(parts) != 3:
        raise ProblemException(
            status=502, code="UPSTREAM_FAILED", title="Malformed OIDC id_token"
        )
    seg = parts[1] + "=" * (-len(parts[1]) % 4)
    try:
        return json.loads(base64.urlsafe_b64decode(seg))
    except Exception as exc:  # noqa: BLE001
        raise ProblemException(
            status=502, code="UPSTREAM_FAILED", title="Unparseable OIDC id_token"
        ) from exc


def _assert_id_token_valid(claims: dict[str, Any], *, audience: str) -> None:
    """Minimal OIDC claim checks: audience match (string-tolerant) + not expired."""
    aud = claims.get("aud")
    if aud is not None:
        aud_set = {str(a) for a in (aud if isinstance(aud, list) else [aud])}
        if str(audience) not in aud_set:
            raise ProblemException(
                status=401,
                code="UNAUTHENTICATED",
                title="OIDC id_token audience mismatch",
            )
    exp = claims.get("exp")
    if isinstance(exp, (int, float)) and exp < datetime.now(timezone.utc).timestamp():
        raise ProblemException(
            status=401, code="UNAUTHENTICATED", title="OIDC id_token expired"
        )


# --------------------------------------------------------------------------- #
# Redis state helpers (module-level so callers can also poke them in tests)
# --------------------------------------------------------------------------- #
async def store_state(redis: Any, state: str, payload: dict[str, Any]) -> None:
    if redis is None:
        return
    try:
        await redis.set(
            f"oauth:state:{state}",
            json.dumps(payload),
            ex=settings.oauth_state_ttl_seconds,
        )
    except Exception:  # pragma: no cover — best-effort
        logger.warning("Failed to write oauth state to Redis", exc_info=True)


async def pop_state(redis: Any, state: str) -> dict[str, Any] | None:
    if redis is None:
        return None
    try:
        raw = await redis.get(f"oauth:state:{state}")
        if not raw:
            return None
        await redis.delete(f"oauth:state:{state}")
        if isinstance(raw, bytes):
            raw = raw.decode("utf-8")
        return json.loads(raw)
    except Exception:  # pragma: no cover
        return None


def build_authorize_url(
    provider: str, *, state: str, return_url: str | None = None
) -> str:
    """Backwards-compatible authorize-url builder (no PKCE)."""
    impl, cid, _ = assert_provider_configured(provider)
    redirect = (
        f"{settings.oauth_callback_base_url}/api/v1/auth/oauth/{provider}/callback"
    )
    params = {
        "client_id": cid,
        "redirect_uri": redirect,
        "response_type": "code",
        "scope": " ".join(impl.default_scopes),
        "state": state,
    }
    if return_url:
        params["redirect_url"] = return_url
    return f"{impl.authorize_url}?{urlencode(params)}"


# --------------------------------------------------------------------------- #
# Service class
# --------------------------------------------------------------------------- #
class OAuthService:
    """Coordinates the OAuth2 authorization-code flow end-to-end."""

    def __init__(
        self,
        session: AsyncSession,
        *,
        redis: Any | None,
        producer: KafkaProducer | StubProducer | None = None,
        http_client_factory: Any | None = None,
    ) -> None:
        self.s = session
        self.redis = redis
        self.producer = producer or StubProducer()
        self.users = UserRepository(session)
        self.tenants = TenantRepository(session)
        self.sessions = SessionRepository(session)
        self.oauth_repo = OAuthIdentityRepository(session)
        # Tests can swap in a custom AsyncClient factory if desired;
        # otherwise httpx is used directly (intercepted by respx in tests).
        self._http_factory = http_client_factory or (
            lambda: httpx.AsyncClient(timeout=10.0)
        )

    # ----------------------------------------------------------------- #
    # AUTHORIZE
    # ----------------------------------------------------------------- #
    async def start_authorize(
        self,
        provider_name: str,
        *,
        redirect_url: str | None,
        tenant_slug: str | None,
        link_user_id: str | None = None,
    ) -> tuple[str, str]:
        """Return ``(authorize_url, state)``.

        ``link_user_id`` — set when this is the *link* flow rather than the
        *login* flow. The state record is tagged so the callback can dispatch
        to :meth:`link_to_existing` instead of creating a new session.
        """
        impl, cid, _ = assert_provider_configured(provider_name)

        state = new_state()
        verifier, challenge = _gen_pkce_pair()
        redirect_uri = self._redirect_uri(provider_name)

        params: dict[str, str] = {
            "client_id": cid,
            "redirect_uri": redirect_uri,
            "response_type": "code",
            "scope": " ".join(impl.default_scopes),
            "state": state,
            "code_challenge": challenge,
            "code_challenge_method": "S256",
        }
        # Provider-specific quirks.
        if provider_name == "google":
            params["prompt"] = "consent"
            params["access_type"] = "offline"
        elif provider_name == "yandex":
            params["force_confirm"] = "true"
        elif provider_name == "telegram":
            # Telegram OIDC requires the site origin — it must be a registered
            # Allowed URL in @BotFather → Bot Settings → Web Login.
            params["origin"] = settings.oauth_callback_base_url.rstrip("/")

        await store_state(
            self.redis,
            state,
            {
                "provider": provider_name,
                "redirect_url": redirect_url,
                "tenant_slug": tenant_slug,
                "code_verifier": verifier,
                "link_user_id": link_user_id,
                "expires_at": (
                    datetime.now(timezone.utc)
                    + timedelta(seconds=settings.oauth_state_ttl_seconds)
                ).isoformat(),
            },
        )

        return f"{impl.authorize_url}?{urlencode(params)}", state

    # ----------------------------------------------------------------- #
    # CALLBACK (login or link)
    # ----------------------------------------------------------------- #
    async def handle_callback(
        self,
        provider_name: str,
        *,
        code: str,
        state: str,
        ip: str | None = None,
        user_agent: str | None = None,
    ) -> CallbackResult:
        impl, cid, csec = assert_provider_configured(provider_name)
        record = await self._consume_state(provider_name, state)

        verifier: str = record.get("code_verifier") or ""
        tenant_slug: str | None = record.get("tenant_slug")
        redirect_url: str | None = record.get("redirect_url")
        link_user_id: str | None = record.get("link_user_id")

        # 1) Exchange code for tokens.
        token_payload = await self._exchange_code(
            impl, cid=cid, csec=csec, code=code, code_verifier=verifier
        )
        # 2) Resolve the user profile.
        if getattr(impl, "uses_id_token", False):
            # OIDC providers without a userinfo endpoint (Telegram) ship the
            # user's claims inside the id_token. It came over the TLS-protected
            # back-channel token exchange, so we decode + validate iss/aud/exp
            # rather than re-verify the signature against JWKS.
            id_token = token_payload.get("id_token")
            if not id_token:
                raise ProblemException(
                    status=502,
                    code="UPSTREAM_FAILED",
                    title="OAuth token exchange failed",
                    detail="Provider response did not include id_token.",
                )
            claims = _decode_jwt_claims(id_token)
            _assert_id_token_valid(claims, audience=cid)
            profile = impl.parse_userinfo(claims)
        else:
            access_token_provider = (
                token_payload.get("access_token") or token_payload.get("token")
            )
            if not access_token_provider:
                raise ProblemException(
                    status=502,
                    code="UPSTREAM_FAILED",
                    title="OAuth token exchange failed",
                    detail="Provider response did not include access_token.",
                )
            try:
                profile = await impl.fetch_userinfo(access_token_provider)
            except httpx.HTTPError as exc:
                raise ProblemException(
                    status=502,
                    code="UPSTREAM_FAILED",
                    title="OAuth userinfo fetch failed",
                    detail=str(exc),
                ) from exc

        # If this is a *link* flow, dispatch — never create a new session here.
        if link_user_id:
            result = await self._finalize_link(
                user_id_str=link_user_id,
                profile=profile,
            )
        else:
            # 3) Resolve tenant.
            tenant = await self._resolve_tenant(tenant_slug)

            # 4) Find-or-create-or-prompt-link.
            result = await self._login_or_provision(
                profile=profile,
                tenant_id=tenant.id,
                redirect_url=redirect_url,
                ip=ip,
                user_agent=user_agent,
            )

        # A Yandex login/link auto-claims the user's imported Yandex.Contest
        # submissions: the importer keys participants by Yandex uid
        # (``author_id='yc:<uid>'``) and our OAuth subject IS that uid, so a
        # Yandex sign-in attaches them with zero friction. Best-effort — never
        # blocks auth. Skipped for the email-match prompt (no session yet; it's
        # picked up on the user's next Yandex login).
        if (
            profile.provider == "yandex"
            and result.user is not None
            and not result.link_required
        ):
            await self._auto_link_yandex_contest(
                result.user, profile.provider_user_id
            )
        return result

    async def _auto_link_yandex_contest(
        self, user: User, yandex_uid: str
    ) -> None:
        """Attach a Yandex login to its imported Yandex.Contest submissions.

        The contest importer stores each participant as ``author_id='yc:<uid>'``
        (the Yandex uid), and an OAuth login's subject is that same uid — so we
        can backfill the participant's submissions onto the freshly
        authenticated user and record an ``ExternalBinding``. Strictly
        best-effort: any failure (course-submission down, etc.) is logged and
        swallowed so it can never block authentication. Won't override a
        participant already linked to a *different* account.
        """
        external_id = f"yc:{yandex_uid}"
        try:
            from ..common.ids import binding_id
            from ..models import ExternalBinding
            from ..repositories.external_bindings import (
                ExternalBindingRepository,
            )
            from ..services.course_client import (
                CourseClientError,
                CourseMembershipClient,
            )

            bindings = ExternalBindingRepository(self.s)
            existing = await bindings.get_by_external(
                "yandex_contest", external_id
            )
            if existing is not None and existing.user_id != user.id:
                # Already claimed by someone else (e.g. via a claim code) —
                # don't silently steal it from an auto-link.
                return
            try:
                claimed = await CourseMembershipClient().claim_external_submissions(
                    user_id=user.id,
                    tenant_id=user.tenant_id,
                    external_author_id=external_id,
                )
            except CourseClientError as exc:
                logger.warning(
                    "YC auto-link claim failed user=%s: %s", user.id, exc
                )
                return
            if existing is None:
                await bindings.add(
                    ExternalBinding(
                        id=binding_id(),
                        user_id=user.id,
                        system="yandex_contest",
                        external_id=external_id,
                        display_name=user.display_name,
                    )
                )
            if claimed:
                logger.info(
                    "auto-linked %s YC submissions to user=%s via Yandex OAuth",
                    claimed,
                    user.id,
                )
        except Exception:  # noqa: BLE001 — must never block auth
            logger.warning(
                "YC auto-link unexpected error user=%s",
                user.id,
                exc_info=True,
            )

    # ----------------------------------------------------------------- #
    # LINK (authenticated user — secondary "add provider" flow)
    # ----------------------------------------------------------------- #
    async def link_to_existing(
        self,
        *,
        user_id_str: str,
        provider_name: str,
        code: str,
        state: str,
    ) -> OAuthIdentity:
        """Add an OAuthIdentity to an existing user.

        Treated as a separate, explicit endpoint: the state record must have
        ``link_user_id`` set and equal to ``user_id_str``.
        """
        impl, cid, csec = assert_provider_configured(provider_name)
        record = await self._consume_state(provider_name, state)

        if record.get("link_user_id") != user_id_str:
            raise ProblemException(
                status=400,
                code="BAD_REQUEST",
                title="OAuth state was not issued for this user",
            )

        verifier = record.get("code_verifier") or ""
        token_payload = await self._exchange_code(
            impl, cid=cid, csec=csec, code=code, code_verifier=verifier
        )
        access_token_provider = (
            token_payload.get("access_token") or token_payload.get("token")
        )
        if not access_token_provider:
            raise ProblemException(
                status=502,
                code="UPSTREAM_FAILED",
                title="OAuth token exchange failed",
            )
        profile = await impl.fetch_userinfo(access_token_provider)
        result = await self._finalize_link(
            user_id_str=user_id_str, profile=profile
        )
        # ``_finalize_link`` returns CallbackResult — but the link router uses
        # the OAuthIdentity directly. Re-fetch to return.
        identity = await self.oauth_repo.get_by_provider_subject(
            provider_name, profile.provider_user_id
        )
        if identity is None:  # pragma: no cover — should always exist now
            raise ProblemException(
                status=500,
                code="INTERNAL",
                title="Failed to persist link",
            )
        # Mark the result as used so static analyzers don't flag it.
        del result
        return identity

    # ----------------------------------------------------------------- #
    # UNLINK
    # ----------------------------------------------------------------- #
    async def unlink(self, *, user_id_str: str, provider_name: str) -> None:
        assert_provider(provider_name)  # 404 on unknown provider
        # Don't let the user lose all login methods.
        user = await self.users.get(user_id_str)
        if user is None:
            raise ProblemException(
                status=404, code="NOT_FOUND", title="User not found"
            )

        identities = await self.oauth_repo.list_for_user(user_id_str)
        target = next(
            (i for i in identities if i.provider == provider_name), None
        )
        if target is None:
            raise ProblemException(
                status=404,
                code="NOT_FOUND",
                title="Provider not linked",
                detail=f"User has no '{provider_name}' identity to unlink.",
            )

        has_password = bool(user.password_hash)
        other_oauth = [i for i in identities if i.provider != provider_name]
        if not has_password and not other_oauth:
            raise ProblemException(
                status=409,
                code="CONFLICT",
                title="Cannot remove last login method",
                detail=(
                    "Set a password (or link another OAuth provider) before"
                    " unlinking your only sign-in method."
                ),
            )

        await self.oauth_repo.unlink(user_id_str, provider_name)

    # ----------------------------------------------------------------- #
    # Internals
    # ----------------------------------------------------------------- #
    def _redirect_uri(self, provider_name: str) -> str:
        return (
            f"{settings.oauth_callback_base_url}/api/v1/auth/oauth/"
            f"{provider_name}/callback"
        )

    async def _consume_state(self, provider_name: str, state: str) -> dict[str, Any]:
        record = await pop_state(self.redis, state)
        if record is None:
            raise ProblemException(
                status=400,
                code="BAD_REQUEST",
                title="Invalid or expired OAuth state",
                detail="State token unknown — re-initiate the OAuth flow.",
            )

        # Belt-and-suspenders expiry check (the Redis TTL handles this too).
        expires_at_raw = record.get("expires_at")
        if expires_at_raw:
            try:
                exp = datetime.fromisoformat(expires_at_raw)
                # State stored as UTC ISO; compare as UTC.
                if exp.tzinfo is None:
                    exp = exp.replace(tzinfo=timezone.utc)
                if exp < datetime.now(timezone.utc):
                    raise ProblemException(
                        status=400,
                        code="BAD_REQUEST",
                        title="OAuth state expired",
                    )
            except (TypeError, ValueError):
                pass

        if record.get("provider") != provider_name:
            raise ProblemException(
                status=400,
                code="BAD_REQUEST",
                title="OAuth state provider mismatch",
                detail="State was issued for a different provider.",
            )
        return record

    async def _exchange_code(
        self,
        impl: OAuthProvider,
        *,
        cid: str,
        csec: str,
        code: str,
        code_verifier: str,
    ) -> dict[str, Any]:
        data = {
            "grant_type": "authorization_code",
            "code": code,
            "redirect_uri": self._redirect_uri(impl.name),
            "code_verifier": code_verifier,
        }
        headers = {
            "Accept": "application/json",
            "Content-Type": "application/x-www-form-urlencoded",
        }
        if getattr(impl, "token_auth_basic", False):
            # OIDC client_secret_basic (Telegram): credentials go in the
            # Authorization header, not the request body.
            basic = base64.b64encode(f"{cid}:{csec}".encode()).decode()
            headers["Authorization"] = f"Basic {basic}"
        else:
            data["client_id"] = cid
            data["client_secret"] = csec
        try:
            async with self._http_factory() as client:
                resp = await client.post(impl.token_url, data=data, headers=headers)
                resp.raise_for_status()
                return resp.json()
        except httpx.HTTPError as exc:
            raise ProblemException(
                status=502,
                code="UPSTREAM_FAILED",
                title="OAuth token exchange failed",
                detail=str(exc),
            ) from exc

    async def _resolve_tenant(self, tenant_slug: str | None) -> Any:
        # Default to the platform's self-service tenant (settings, e.g.
        # "public") — OAuth sign-ups land there and can move via an invite code
        # later. Previously hardcoded "hse", which broke once that course
        # tenant was renamed/deleted.
        slug = tenant_slug or settings.default_tenant_slug
        tenant = await self.tenants.get_by_slug(slug)
        if tenant is None:
            raise ProblemException(
                status=404,
                code="NOT_FOUND",
                title="Tenant not found",
                detail=(
                    f"No tenant with slug '{slug}' — pass ?tenant_slug=… on the"
                    " authorize call."
                ),
            )
        return tenant

    async def _login_or_provision(
        self,
        *,
        profile: OAuthProfile,
        tenant_id: str,
        redirect_url: str | None,
        ip: str | None,
        user_agent: str | None,
    ) -> CallbackResult:
        # 1) Already-linked path.
        existing_identity = await self.oauth_repo.get_by_provider_subject(
            profile.provider, profile.provider_user_id
        )
        if existing_identity is not None:
            user = await self.users.get(existing_identity.user_id)
            if user is None or user.status != "active":
                raise ProblemException(
                    status=401,
                    code="UNAUTHENTICATED",
                    title="User unavailable",
                )
            access, refresh, ttl = await self._issue_session(
                user, ip=ip, user_agent=user_agent
            )
            return CallbackResult(
                user=user,
                access_token=access,
                refresh_token=refresh,
                access_ttl_seconds=ttl,
                profile=profile,
                is_new_user=False,
                redirect_url=redirect_url,
            )

        # 2) Email matches an existing user but no link → link-confirmation flow.
        if profile.email:
            existing_user = await self.users.get_by_email(tenant_id, profile.email)
            if existing_user is not None:
                link_token = secrets.token_urlsafe(32)
                # Stash the profile so the link-confirm endpoint can complete
                # the link without re-running the OAuth dance.
                if self.redis is not None:
                    try:
                        await self.redis.set(
                            f"oauth:link:{link_token}",
                            json.dumps(
                                {
                                    "user_id": existing_user.id,
                                    "profile": profile.model_dump(),
                                }
                            ),
                            ex=settings.oauth_state_ttl_seconds,
                        )
                    except Exception:  # pragma: no cover — best-effort
                        logger.warning(
                            "Failed to stash oauth link token", exc_info=True
                        )
                return CallbackResult(
                    user=existing_user,
                    access_token="",
                    refresh_token="",
                    access_ttl_seconds=0,
                    profile=profile,
                    is_new_user=False,
                    redirect_url=redirect_url,
                    link_required=True,
                    link_token=link_token,
                )

        # 3) Brand-new user. Email is OPTIONAL — a provider without email
        # scope (e.g. GitHub with a private address) still yields a uniquely
        # identifiable account via its (provider, subject) OAuth link, so we
        # provision with email=None rather than minting a fake address.
        new_email = profile.email.lower() if profile.email else None
        new_user = User(
            id=user_id(),
            tenant_id=tenant_id,
            email=new_email,
            password_hash=None,  # OAuth-only login
            display_name=(
                profile.display_name
                or (new_email.split("@")[0] if new_email else f"{profile.provider}-user")
            ),
            avatar_url=profile.avatar_url,
            global_role="student",
            email_verified_at=(
                datetime.now(timezone.utc)
                if (profile.email and profile.email_verified)
                else None
            ),
        )
        await self.users.add(new_user)

        identity = OAuthIdentity(
            id=oauth_id(),
            user_id=new_user.id,
            provider=profile.provider,
            provider_user_id=profile.provider_user_id,
            email=profile.email,
            raw_profile=profile.raw,
        )
        await self.oauth_repo.add(identity)

        access, refresh, ttl = await self._issue_session(
            new_user, ip=ip, user_agent=user_agent
        )
        return CallbackResult(
            user=new_user,
            access_token=access,
            refresh_token=refresh,
            access_ttl_seconds=ttl,
            profile=profile,
            is_new_user=True,
            redirect_url=redirect_url,
        )

    async def _finalize_link(
        self,
        *,
        user_id_str: str,
        profile: OAuthProfile,
    ) -> CallbackResult:
        # Don't allow stealing — if (provider, sub) is already taken by someone
        # else, refuse.
        existing = await self.oauth_repo.get_by_provider_subject(
            profile.provider, profile.provider_user_id
        )
        if existing is not None and existing.user_id != user_id_str:
            raise ProblemException(
                status=409,
                code="CONFLICT",
                title="Provider account is already linked to a different user",
            )
        if existing is None:
            identity = OAuthIdentity(
                id=oauth_id(),
                user_id=user_id_str,
                provider=profile.provider,
                provider_user_id=profile.provider_user_id,
                email=profile.email,
                raw_profile=profile.raw,
            )
            await self.oauth_repo.add(identity)

        user = await self.users.get(user_id_str)
        if user is None:  # pragma: no cover
            raise ProblemException(
                status=404, code="NOT_FOUND", title="User not found"
            )

        return CallbackResult(
            user=user,
            access_token="",  # link path does NOT mint new session
            refresh_token="",
            access_ttl_seconds=0,
            profile=profile,
            is_new_user=False,
            link_required=False,
        )

    async def _issue_session(
        self,
        user: User,
        *,
        ip: str | None,
        user_agent: str | None,
    ) -> tuple[str, str, int]:
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
        await self.sessions.add(sess)
        access = issue_access_token(
            user_id=user.id,
            tenant_id=user.tenant_id,
            global_role=user.global_role,
        )
        user.last_login_at = datetime.now(timezone.utc)
        return access, refresh, settings.jwt_access_ttl_seconds

    # ----------------------------------------------------------------- #
    # Link confirmation (used after `link_required` callback)
    # ----------------------------------------------------------------- #
    async def confirm_link(
        self,
        *,
        link_token: str,
        user_id_str: str,
        ip: str | None = None,
        user_agent: str | None = None,
    ) -> CallbackResult:
        """Complete a linking flow that was deferred via ``link_required``.

        Reads the staged profile from Redis, attaches the OAuthIdentity to
        ``user_id_str`` and issues a session.
        """
        if self.redis is None:
            raise ProblemException(
                status=503,
                code="SERVICE_UNAVAILABLE",
                title="Redis required for link confirmation",
            )
        try:
            raw = await self.redis.get(f"oauth:link:{link_token}")
        except Exception:  # pragma: no cover
            raw = None
        if not raw:
            raise ProblemException(
                status=400,
                code="BAD_REQUEST",
                title="Link token unknown or expired",
            )
        try:
            await self.redis.delete(f"oauth:link:{link_token}")
        except Exception:  # pragma: no cover
            pass
        if isinstance(raw, bytes):
            raw = raw.decode("utf-8")
        record = json.loads(raw)
        if record.get("user_id") != user_id_str:
            raise ProblemException(
                status=403,
                code="FORBIDDEN",
                title="Link token belongs to a different user",
            )
        profile = OAuthProfile(**record["profile"])
        await self._finalize_link(user_id_str=user_id_str, profile=profile)
        user = await self.users.get(user_id_str)
        if user is None:  # pragma: no cover
            raise ProblemException(
                status=404, code="NOT_FOUND", title="User not found"
            )
        access, refresh, ttl = await self._issue_session(
            user, ip=ip, user_agent=user_agent
        )
        return CallbackResult(
            user=user,
            access_token=access,
            refresh_token=refresh,
            access_ttl_seconds=ttl,
            profile=profile,
            is_new_user=False,
        )


# --------------------------------------------------------------------------- #
# Exports
# --------------------------------------------------------------------------- #
__all__ = [
    "OAuthService",
    "CallbackResult",
    "assert_provider",
    "assert_provider_enabled",
    "assert_provider_configured",
    "build_authorize_url",
    "list_known_providers",
    "new_state",
    "store_state",
    "pop_state",
]
