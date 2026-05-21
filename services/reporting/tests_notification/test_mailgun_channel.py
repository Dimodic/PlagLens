"""Tests for the Mailgun HTTP-API email channel using respx."""
from __future__ import annotations

import httpx
import pytest
import respx

from notification_service.channels.base import DeliveryRequest
from notification_service.channels.email import MailgunEmailChannel


def _req() -> DeliveryRequest:
    return DeliveryRequest(
        notification_id="ntf_abc",
        user_id="usr_1",
        tenant_id="tnt_1",
        title="Hello",
        body="<p>Hi</p>",
        recipient_email="user@example.com",
    )


@pytest.mark.asyncio
async def test_mailgun_success_2xx():
    async with httpx.AsyncClient() as cl, respx.mock(assert_all_called=False) as rx:
        route = rx.post("https://api.mailgun.net/v3/mg.example.com/messages").mock(
            return_value=httpx.Response(200, json={"id": "<abc>", "message": "Queued"})
        )
        chan = MailgunEmailChannel(client=cl, domain="mg.example.com")
        result = await chan.send(_req())
        assert result.status == "sent"
        assert route.called
        sent = route.calls.last.request
        # form-encoded body should mention recipient and headers.
        body = sent.content.decode()
        assert "user%40example.com" in body or "user@example.com" in body
        assert "v%3Anotification_id" in body or "v:notification_id" in body


@pytest.mark.asyncio
async def test_mailgun_retries_on_5xx_then_fails():
    async with httpx.AsyncClient() as cl, respx.mock(assert_all_called=False) as rx:
        rx.post("https://api.mailgun.net/v3/mg.example.com/messages").mock(
            return_value=httpx.Response(503, text="upstream down")
        )
        chan = MailgunEmailChannel(client=cl, domain="mg.example.com", max_attempts=3)
        result = await chan.send(_req())
        assert result.status == "failed"
        assert "503" in (result.error or "")


@pytest.mark.asyncio
async def test_mailgun_4xx_no_retry():
    async with httpx.AsyncClient() as cl, respx.mock(assert_all_called=False) as rx:
        route = rx.post("https://api.mailgun.net/v3/mg.example.com/messages").mock(
            return_value=httpx.Response(400, text="bad domain")
        )
        chan = MailgunEmailChannel(client=cl, domain="mg.example.com", max_attempts=3)
        result = await chan.send(_req())
        assert result.status == "failed"
        # Should not retry on hard 4xx (except 408/429); we sent only once.
        assert route.call_count == 1


@pytest.mark.asyncio
async def test_mailgun_skipped_no_recipient():
    chan = MailgunEmailChannel(domain="mg.example.com")
    bad = _req()
    bad.recipient_email = None
    result = await chan.send(bad)
    assert result.status == "skipped"
