"""Email channel.

Two transports are supported:

* :class:`SmtpEmailChannel` (default for dev → Mailhog at ``mailhog:1025``;
  production → Mailgun SMTP creds). Uses ``aiosmtplib`` and builds RFC 5322
  messages with text/plain + text/html alternatives.
* :class:`MailgunEmailChannel` — HTTP fallback that POSTs to
  ``https://api.mailgun.net/v3/{domain}/messages`` if the operator supplies
  Mailgun creds.

Selection is driven by ``EMAIL_TRANSPORT`` setting (``smtp`` | ``mailgun``)
and/or the per-tenant ``EmailTransportConfig`` DB row, which can be patched
hot via the admin endpoints.

The historical name ``EmailChannel`` is preserved as an alias for
:class:`SmtpEmailChannel` so legacy imports keep working.
"""
from __future__ import annotations

import asyncio
import logging
from email.message import EmailMessage
from typing import Any

import httpx

from notification_service.channels.base import Channel, DeliveryRequest, DeliveryResult
from notification_service.config import get_settings

log = logging.getLogger(__name__)

# Status codes considered transient (retryable). 4xx-style temp failures from
# SMTP and HTTP API are mapped to this set.
_TRANSIENT_HTTP = {408, 425, 429, 500, 502, 503, 504}


# ---------------------------------------------------------------------------
# SMTP (Mailhog / Mailgun-SMTP)
# ---------------------------------------------------------------------------


def _split_html(body: str) -> tuple[str, str | None]:
    """Return (plain, html_or_None). Body may already be HTML."""
    stripped = body.lstrip()
    if stripped.startswith("<") and ("<html" in stripped.lower() or "<body" in stripped.lower()):
        # crude plain fallback: strip tags
        import re

        plain = re.sub(r"<[^>]+>", "", body).strip()
        return plain or body, body
    return body, None


class SmtpEmailChannel(Channel):
    """Async SMTP channel via ``aiosmtplib`` with retries."""

    name = "email"

    def __init__(
        self,
        *,
        host: str | None = None,
        port: int | None = None,
        username: str | None = None,
        password: str | None = None,
        use_tls: bool | None = None,
        use_starttls: bool | None = None,
        from_email: str | None = None,
        from_name: str | None = None,
        reply_to: str | None = None,
        timeout: float | None = None,
        max_attempts: int = 3,
        client_factory: Any | None = None,
    ) -> None:
        s = get_settings()
        self._host = host or s.SMTP_HOST
        self._port = port if port is not None else s.SMTP_PORT
        self._username = username if username is not None else s.SMTP_USERNAME
        self._password = password if password is not None else s.SMTP_PASSWORD
        self._use_tls = use_tls if use_tls is not None else s.SMTP_USE_TLS
        self._use_starttls = (
            use_starttls if use_starttls is not None else s.SMTP_USE_STARTTLS
        )
        self._from_email = from_email or s.FROM_EMAIL
        self._from_name = from_name or s.FROM_NAME
        self._reply_to = reply_to if reply_to is not None else s.REPLY_TO
        self._timeout = timeout if timeout is not None else s.SMTP_TIMEOUT_SECONDS
        self._max_attempts = max_attempts
        self._client_factory = client_factory

    # -- public hot-reload helper, used by admin PATCH email-config -----------
    def update(
        self,
        *,
        host: str | None = None,
        port: int | None = None,
        username: str | None = None,
        password: str | None = None,
        use_tls: bool | None = None,
        from_email: str | None = None,
        from_name: str | None = None,
        reply_to: str | None = None,
    ) -> None:
        if host is not None:
            self._host = host
        if port is not None:
            self._port = port
        if username is not None:
            self._username = username
        if password is not None:
            self._password = password
        if use_tls is not None:
            self._use_tls = use_tls
        if from_email is not None:
            self._from_email = from_email
        if from_name is not None:
            self._from_name = from_name
        if reply_to is not None:
            self._reply_to = reply_to

    def build_message(self, req: DeliveryRequest) -> EmailMessage:
        msg = EmailMessage()
        msg["From"] = f"{self._from_name} <{self._from_email}>"
        msg["To"] = req.recipient_email or ""
        msg["Subject"] = req.title or "(no subject)"
        if self._reply_to:
            msg["Reply-To"] = self._reply_to
        # Tag for downstream tracking (Mailgun / Mailhog headers carry it back).
        msg["X-Plaglens-Notification-Id"] = req.notification_id
        msg["X-Plaglens-Tenant-Id"] = req.tenant_id
        # Use notification_id as Message-Id so bounce webhooks can correlate.
        host_part = self._from_email.split("@", 1)[-1] or "plaglens.local"
        msg["Message-Id"] = f"<{req.notification_id}@{host_part}>"

        plain, html = _split_html(req.body or "")
        msg.set_content(plain or " ")
        if html:
            msg.add_alternative(html, subtype="html")
        return msg

    async def send(self, req: DeliveryRequest) -> DeliveryResult:
        if not req.recipient_email:
            return DeliveryResult(status="skipped", error="no recipient email")

        message = self.build_message(req)
        delay = 1.0
        last_err: str | None = None

        for attempt in range(1, self._max_attempts + 1):
            try:
                await self._send_once(message)
                return DeliveryResult(status="sent")
            except _PermanentSmtpError as e:
                log.warning("smtp_permanent_failure", extra={"err": str(e)})
                return DeliveryResult(status="failed", error=str(e))
            except _TransientSmtpError as e:
                last_err = str(e)
                if attempt < self._max_attempts:
                    await asyncio.sleep(delay)
                    delay *= 3
                    continue
                return DeliveryResult(status="failed", error=last_err)
            except Exception as e:  # noqa: BLE001
                # Unknown error → treat as transient (retry).
                last_err = str(e)
                if attempt < self._max_attempts:
                    await asyncio.sleep(delay)
                    delay *= 3
                    continue
                return DeliveryResult(status="failed", error=last_err)

        return DeliveryResult(status="failed", error=last_err or "unknown")

    async def _send_once(self, message: EmailMessage) -> None:
        # Lazy-import aiosmtplib so non-email tests don't require it.
        if self._client_factory is not None:
            client = self._client_factory(
                hostname=self._host,
                port=self._port,
                use_tls=self._use_tls,
                start_tls=self._use_starttls,
                timeout=self._timeout,
            )
        else:
            try:
                import aiosmtplib
            except ImportError as e:
                raise _PermanentSmtpError(f"aiosmtplib not installed: {e}")
            client = aiosmtplib.SMTP(
                hostname=self._host,
                port=self._port,
                use_tls=self._use_tls,
                start_tls=self._use_starttls,
                timeout=self._timeout,
            )

        try:
            try:
                await client.connect()
            except Exception as e:  # noqa: BLE001
                raise _TransientSmtpError(f"connect failed: {e}")
            try:
                if self._username and self._password:
                    try:
                        await client.login(self._username, self._password)
                    except Exception as e:  # noqa: BLE001
                        # Auth failures are permanent.
                        raise _PermanentSmtpError(f"smtp auth failed: {e}")
                try:
                    await client.send_message(message)
                except Exception as e:  # noqa: BLE001
                    code = getattr(e, "code", None)
                    if isinstance(code, int) and 500 <= code < 600:
                        raise _PermanentSmtpError(f"smtp 5xx: {e}")
                    raise _TransientSmtpError(f"smtp send failed: {e}")
            finally:
                try:
                    await client.quit()
                except Exception:
                    pass
        finally:
            close = getattr(client, "close", None)
            if callable(close):
                try:
                    res = close()
                    if asyncio.iscoroutine(res):
                        await res
                except Exception:
                    pass


class _TransientSmtpError(Exception):
    pass


class _PermanentSmtpError(Exception):
    pass


# ---------------------------------------------------------------------------
# Mailgun HTTP API (production fallback)
# ---------------------------------------------------------------------------


class MailgunEmailChannel(Channel):
    """Sends mail through Mailgun's HTTP API."""

    name = "email"

    def __init__(
        self,
        client: httpx.AsyncClient | None = None,
        max_attempts: int = 3,
        domain: str | None = None,
        api_key: str | None = None,
        base_url: str | None = None,
        from_email: str | None = None,
        from_name: str | None = None,
        reply_to: str | None = None,
    ) -> None:
        s = get_settings()
        self._client = client
        self._max_attempts = max_attempts
        self._owns_client = client is None
        self._domain = domain or s.MAILGUN_DOMAIN
        self._api_key = api_key
        self._base_url = base_url or s.MAILGUN_BASE_URL
        self._from_email = from_email or s.FROM_EMAIL
        self._from_name = from_name or s.FROM_NAME
        self._reply_to = reply_to if reply_to is not None else s.REPLY_TO

    def _get_client(self) -> httpx.AsyncClient:
        if self._client is None:
            settings = get_settings()
            self._client = httpx.AsyncClient(timeout=settings.MAILGUN_TIMEOUT_SECONDS)
        return self._client

    def _resolve_api_key(self) -> str | None:
        if self._api_key:
            return self._api_key
        s = get_settings()
        if s.MAILGUN_API_KEY:
            return s.MAILGUN_API_KEY
        if s.MAILGUN_API_KEY_PATH:
            try:
                with open(s.MAILGUN_API_KEY_PATH, encoding="utf-8") as f:
                    return f.read().strip()
            except OSError:
                return None
        return None

    async def send(self, req: DeliveryRequest) -> DeliveryResult:
        if not req.recipient_email:
            return DeliveryResult(status="skipped", error="no recipient email")

        api_key = self._resolve_api_key() or "test-key"
        url = f"{self._base_url}/{self._domain}/messages"
        from_field = f"{self._from_name} <{self._from_email}>"

        plain, html = _split_html(req.body or "")
        data: dict[str, str] = {
            "from": from_field,
            "to": req.recipient_email,
            "subject": req.title or "(no subject)",
            "text": plain,
            "v:notification_id": req.notification_id,
            "v:tenant_id": req.tenant_id,
            "h:X-Plaglens-Notification-Id": req.notification_id,
        }
        if html:
            data["html"] = html
        if self._reply_to:
            data["h:Reply-To"] = self._reply_to

        client = self._get_client()
        delay = 1.0
        last_err: str | None = None
        for attempt in range(1, self._max_attempts + 1):
            try:
                resp = await client.post(url, auth=("api", api_key), data=data)
                if 200 <= resp.status_code < 300:
                    return DeliveryResult(status="sent")
                if resp.status_code in _TRANSIENT_HTTP:
                    last_err = f"http {resp.status_code}"
                    if attempt < self._max_attempts:
                        await asyncio.sleep(delay)
                        delay *= 3
                        continue
                return DeliveryResult(
                    status="failed",
                    error=f"http {resp.status_code}: {resp.text[:200]}",
                )
            except httpx.HTTPError as e:
                last_err = str(e)
                if attempt < self._max_attempts:
                    await asyncio.sleep(delay)
                    delay *= 3
                    continue
        return DeliveryResult(status="failed", error=last_err or "unknown")

    async def close(self) -> None:
        if self._owns_client and self._client is not None:
            await self._client.aclose()
            self._client = None


# ---------------------------------------------------------------------------
# Resend (resend.com HTTP API)
# ---------------------------------------------------------------------------


class ResendEmailChannel(Channel):
    """Sends mail through Resend's HTTP API (https://resend.com/docs/api).

    Resend is the simpler HTTP-API alternative to Mailgun for transactional
    mail: one endpoint (``POST /emails``), bearer-token auth, accepts any
    ``from`` address whose domain the Resend account has verified.

    No domain / region knobs — those live entirely on Resend's side. The
    only per-tenant field is the API key (stored Fernet-encrypted).
    """

    name = "email"

    def __init__(
        self,
        client: httpx.AsyncClient | None = None,
        max_attempts: int = 3,
        api_key: str | None = None,
        base_url: str = "https://api.resend.com",
        from_email: str | None = None,
        from_name: str | None = None,
        reply_to: str | None = None,
    ) -> None:
        s = get_settings()
        self._client = client
        self._owns_client = client is None
        self._max_attempts = max_attempts
        self._api_key = api_key
        self._base_url = base_url
        self._from_email = from_email or s.FROM_EMAIL
        self._from_name = from_name or s.FROM_NAME
        self._reply_to = reply_to if reply_to is not None else s.REPLY_TO

    def _get_client(self) -> httpx.AsyncClient:
        if self._client is None:
            s = get_settings()
            self._client = httpx.AsyncClient(timeout=s.MAILGUN_TIMEOUT_SECONDS)
        return self._client

    async def send(self, req: DeliveryRequest) -> DeliveryResult:
        if not req.recipient_email:
            return DeliveryResult(status="skipped", error="no recipient email")
        if not self._api_key:
            return DeliveryResult(
                status="failed", error="resend api key is not configured"
            )

        url = f"{self._base_url}/emails"
        from_field = f"{self._from_name} <{self._from_email}>"
        plain, html = _split_html(req.body or "")
        payload: dict[str, Any] = {
            "from": from_field,
            "to": [req.recipient_email],
            "subject": req.title or "(no subject)",
            "headers": {
                "X-Plaglens-Notification-Id": req.notification_id,
                "X-Plaglens-Tenant-Id": req.tenant_id,
            },
        }
        if html:
            payload["html"] = html
            payload["text"] = plain
        else:
            payload["text"] = plain
        if self._reply_to:
            payload["reply_to"] = self._reply_to

        client = self._get_client()
        delay = 1.0
        last_err: str | None = None
        for attempt in range(1, self._max_attempts + 1):
            try:
                resp = await client.post(
                    url,
                    json=payload,
                    headers={"Authorization": f"Bearer {self._api_key}"},
                )
                if 200 <= resp.status_code < 300:
                    return DeliveryResult(status="sent")
                if resp.status_code in _TRANSIENT_HTTP:
                    last_err = f"http {resp.status_code}"
                    if attempt < self._max_attempts:
                        await asyncio.sleep(delay)
                        delay *= 3
                        continue
                return DeliveryResult(
                    status="failed",
                    error=f"http {resp.status_code}: {resp.text[:200]}",
                )
            except httpx.HTTPError as e:
                last_err = str(e)
                if attempt < self._max_attempts:
                    await asyncio.sleep(delay)
                    delay *= 3
                    continue
        return DeliveryResult(status="failed", error=last_err or "unknown")

    async def close(self) -> None:
        if self._owns_client and self._client is not None:
            await self._client.aclose()
            self._client = None


# ---------------------------------------------------------------------------
# Selector + back-compat alias
# ---------------------------------------------------------------------------


def build_email_channel() -> Channel:
    """Pick channel implementation based on ``EMAIL_TRANSPORT`` setting."""
    s = get_settings()
    transport = s.EMAIL_TRANSPORT.lower()
    if transport == "mailgun":
        return MailgunEmailChannel()
    if transport == "resend":
        return ResendEmailChannel()
    return SmtpEmailChannel()


# Legacy alias kept so older imports (e.g. ``EmailChannel``) keep working.
EmailChannel = SmtpEmailChannel
