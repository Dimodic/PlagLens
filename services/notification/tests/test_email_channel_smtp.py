"""Unit tests for the SMTP email channel.

We mock the underlying ``aiosmtplib.SMTP`` client by injecting a
``client_factory`` into :class:`SmtpEmailChannel`. No real network calls.
"""
from __future__ import annotations

from email.message import EmailMessage

import pytest

from notification_service.channels.base import DeliveryRequest
from notification_service.channels.email import SmtpEmailChannel


class _FakeSmtpClient:
    """Records calls and lets tests force errors via class-level flags."""

    def __init__(self, **kwargs):
        self.kwargs = kwargs
        self.connected = False
        self.logged_in = False
        self.sent_messages: list[EmailMessage] = []
        self.quit_called = False

    async def connect(self):
        if _FakeSmtpClient.fail_connect_times > 0:
            _FakeSmtpClient.fail_connect_times -= 1
            raise OSError("simulated transient connect failure")
        self.connected = True

    async def login(self, username, password):
        self.logged_in = True

    async def send_message(self, msg: EmailMessage):
        if _FakeSmtpClient.permanent_send_5xx:
            err = Exception("550 user unknown")
            err.code = 550  # type: ignore[attr-defined]
            raise err
        self.sent_messages.append(msg)
        _FakeSmtpClient.last_sent = msg

    async def quit(self):
        self.quit_called = True

    def close(self):
        pass


_FakeSmtpClient.fail_connect_times = 0
_FakeSmtpClient.permanent_send_5xx = False
_FakeSmtpClient.last_sent = None


@pytest.fixture(autouse=True)
def _reset_fake():
    _FakeSmtpClient.fail_connect_times = 0
    _FakeSmtpClient.permanent_send_5xx = False
    _FakeSmtpClient.last_sent = None
    yield


def _make_channel(**overrides) -> SmtpEmailChannel:
    return SmtpEmailChannel(
        host="mailhog",
        port=1025,
        use_tls=False,
        from_email="noreply@plaglens.local",
        from_name="PlagLens",
        client_factory=lambda **kw: _FakeSmtpClient(**kw),
        **overrides,
    )


def _req() -> DeliveryRequest:
    return DeliveryRequest(
        notification_id="ntf_abc",
        user_id="usr_1",
        tenant_id="tnt_1",
        title="Hello world",
        body="<html><body><p>Hi <strong>there</strong></p></body></html>",
        recipient_email="user@example.com",
    )


@pytest.mark.asyncio
async def test_smtp_send_success_builds_proper_message():
    chan = _make_channel()
    result = await chan.send(_req())

    assert result.status == "sent"
    msg = _FakeSmtpClient.last_sent
    assert msg is not None
    assert msg["To"] == "user@example.com"
    assert msg["Subject"] == "Hello world"
    assert "PlagLens" in msg["From"]
    assert msg["X-Plaglens-Notification-Id"] == "ntf_abc"
    assert msg["X-Plaglens-Tenant-Id"] == "tnt_1"
    assert msg["Message-Id"] is not None
    # html alternative attached
    parts = list(msg.iter_parts())
    types = sorted({p.get_content_type() for p in parts})
    assert "text/html" in types


@pytest.mark.asyncio
async def test_smtp_skipped_when_no_recipient():
    chan = _make_channel()
    bad = _req()
    bad.recipient_email = None
    result = await chan.send(bad)
    assert result.status == "skipped"


@pytest.mark.asyncio
async def test_smtp_retries_then_succeeds_on_transient_error():
    _FakeSmtpClient.fail_connect_times = 2
    chan = _make_channel(max_attempts=3)
    result = await chan.send(_req())
    assert result.status == "sent"


@pytest.mark.asyncio
async def test_smtp_retries_exhaust_returns_failed():
    _FakeSmtpClient.fail_connect_times = 5  # always fail
    chan = _make_channel(max_attempts=3)
    result = await chan.send(_req())
    assert result.status == "failed"
    assert result.error is not None


@pytest.mark.asyncio
async def test_smtp_5xx_treated_as_permanent_no_retry():
    _FakeSmtpClient.permanent_send_5xx = True
    chan = _make_channel(max_attempts=3)
    result = await chan.send(_req())
    assert result.status == "failed"
    assert "5xx" in (result.error or "").lower() or "550" in (result.error or "")


@pytest.mark.asyncio
async def test_build_message_plain_body_only():
    chan = _make_channel()
    req = _req()
    req.body = "Just plain text"
    msg = chan.build_message(req)
    # No html alternative when body is plain
    parts = list(msg.iter_parts())
    types = {p.get_content_type() for p in parts}
    assert "text/html" not in types


@pytest.mark.asyncio
async def test_smtp_with_credentials_calls_login():
    chan = _make_channel(username="user", password="pass")
    captured: list[_FakeSmtpClient] = []

    def factory(**kw):
        c = _FakeSmtpClient(**kw)
        captured.append(c)
        return c

    chan._client_factory = factory  # type: ignore[attr-defined]
    result = await chan.send(_req())
    assert result.status == "sent"
    assert captured and captured[0].logged_in is True
