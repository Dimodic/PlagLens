"""Section F: email transport config (admin) + Mailgun webhook.

DB-backed: a single ``EmailTransportConfig`` row per tenant. Created on first
read with sane Mailhog defaults. PATCH applies the change and hot-reloads the
runtime channel singleton (no restart required). Test-send uses the current
channel.
"""
from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

import httpx
from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy import desc, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from notification_service.channels import (
    DeliveryRequest,
    MailgunEmailChannel,
    SmtpEmailChannel,
)
from notification_service.config import get_settings
from notification_service.db import get_db
from notification_service.delivery import get_channels, reset_email_channel
from notification_service.errors import Problem
from notification_service.ids import transport_id
from notification_service.models import EmailBounce, EmailTransportConfig
from notification_service.pagination import decode_cursor, encode_cursor
from notification_service.schemas import (
    BounceOut,
    DnsStatusOut,
    EmailConfigOut,
    EmailConfigPatch,
    Page,
    Pagination,
)
from notification_service.security import Principal, require_admin

router = APIRouter(tags=["admin-email"])


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


async def _get_or_create_cfg(db: AsyncSession, tenant_id: str) -> EmailTransportConfig:
    stmt = select(EmailTransportConfig).where(EmailTransportConfig.tenant_id == tenant_id)
    res = await db.execute(stmt)
    cfg = res.scalars().first()
    if cfg is not None:
        return cfg
    s = get_settings()
    cfg = EmailTransportConfig(
        id=transport_id(),
        tenant_id=tenant_id,
        provider=("mailgun" if s.EMAIL_TRANSPORT == "mailgun" else "smtp"),
        from_email=s.FROM_EMAIL,
        from_name=s.FROM_NAME,
        reply_to=s.REPLY_TO,
        default_for_tenant=True,
    )
    db.add(cfg)
    await db.flush()
    return cfg


def _build_channel_from_cfg(cfg: EmailTransportConfig) -> Any:
    """Materialise a Channel instance from a stored ``EmailTransportConfig``."""
    s = get_settings()
    if (cfg.provider or "smtp").lower() == "mailgun":
        return MailgunEmailChannel(
            domain=s.MAILGUN_DOMAIN,
            from_email=cfg.from_email,
            from_name=cfg.from_name,
            reply_to=cfg.reply_to,
        )
    return SmtpEmailChannel(
        from_email=cfg.from_email,
        from_name=cfg.from_name,
        reply_to=cfg.reply_to,
    )


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


@router.get("/admin/notifications/email-config", response_model=EmailConfigOut)
async def get_email_config(
    principal: Principal = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> EmailConfigOut:
    cfg = await _get_or_create_cfg(db, principal.tenant_id)
    return EmailConfigOut.model_validate(cfg)


@router.patch("/admin/notifications/email-config", response_model=EmailConfigOut)
async def patch_email_config(
    body: EmailConfigPatch,
    principal: Principal = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> EmailConfigOut:
    cfg = await _get_or_create_cfg(db, principal.tenant_id)
    if body.provider is not None:
        if body.provider not in ("smtp", "mailgun"):
            raise Problem(400, "BAD_REQUEST", "provider must be smtp|mailgun")
        cfg.provider = body.provider
    if body.api_key_secret_ref is not None:
        cfg.api_key_secret_ref = body.api_key_secret_ref
    if body.from_email is not None:
        cfg.from_email = str(body.from_email)
    if body.from_name is not None:
        cfg.from_name = body.from_name
    if body.reply_to is not None:
        cfg.reply_to = str(body.reply_to)
    if body.default_for_tenant is not None:
        cfg.default_for_tenant = body.default_for_tenant
    cfg.updated_at = datetime.now(UTC)
    await db.flush()

    # Hot-reload the runtime channel.
    new_chan = _build_channel_from_cfg(cfg)
    await reset_email_channel(new_chan)
    return EmailConfigOut.model_validate(cfg)


@router.post("/admin/notifications/email-config:test")
async def test_email(
    principal: Principal = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    cfg = await _get_or_create_cfg(db, principal.tenant_id)
    channels = get_channels()
    # Recipient: prefer admin's stored email; for MVP use synthesised test address.
    recipient = f"admin+{principal.user_id}@example.com"
    req = DeliveryRequest(
        notification_id="cfg-test",
        user_id=principal.user_id,
        tenant_id=principal.tenant_id,
        title="PlagLens email config test",
        body=(
            "<p>If you received this, "
            f"<strong>{cfg.provider}</strong> transport is wired up.</p>"
        ),
        recipient_email=recipient,
    )
    result = await channels.email.send(req)
    return {
        "status": result.status,
        "error": result.error,
        "provider": cfg.provider,
        "recipient": recipient,
    }


@router.get("/admin/notifications/email-config/dns-status", response_model=DnsStatusOut)
async def email_dns_status(
    principal: Principal = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> DnsStatusOut:
    cfg = await _get_or_create_cfg(db, principal.tenant_id)
    s = get_settings()

    if (cfg.provider or "smtp").lower() == "smtp":
        # Dev / Mailhog mode — DNS validation is N/A.
        return DnsStatusOut(
            spf=False, dkim=False, dmarc=False, checked_at=datetime.now(UTC)
        )

    # Mailgun: GET /v3/domains/{domain} and inspect dns_records[].valid.
    api_key = s.MAILGUN_API_KEY or "test-key"
    url = f"{s.MAILGUN_BASE_URL}/domains/{s.MAILGUN_DOMAIN}"
    spf = dkim = dmarc = False
    try:
        async with httpx.AsyncClient(timeout=s.MAILGUN_TIMEOUT_SECONDS) as cl:
            r = await cl.get(url, auth=("api", api_key))
        if 200 <= r.status_code < 300:
            payload = r.json()
            for rec in (payload.get("sending_dns_records") or []) + (
                payload.get("receiving_dns_records") or []
            ):
                kind = (rec.get("record_type") or "").upper()
                value = (rec.get("value") or "").lower()
                valid = (rec.get("valid") or "").lower() == "valid"
                if kind == "TXT" and "v=spf1" in value:
                    spf = spf or valid
                if kind == "TXT" and "v=dkim" in value or "domainkey" in (rec.get("name") or ""):
                    dkim = dkim or valid
                if kind == "TXT" and "v=dmarc1" in value:
                    dmarc = dmarc or valid
    except Exception:  # noqa: BLE001
        # network/dns unreachable: report all-false but don't 500.
        pass

    return DnsStatusOut(spf=spf, dkim=dkim, dmarc=dmarc, checked_at=datetime.now(UTC))


@router.get("/admin/notifications/email-config/bounces", response_model=Page)
async def email_bounces(
    cursor: str | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=200),
    _: Principal = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> Any:
    stmt = select(EmailBounce).order_by(desc(EmailBounce.received_at), EmailBounce.id)
    cur = decode_cursor(cursor)
    if cur:
        stmt = stmt.where(EmailBounce.id > cur.get("id", ""))
    stmt = stmt.limit(limit + 1)
    res = await db.execute(stmt)
    rows = list(res.scalars().all())
    has_more = len(rows) > limit
    page_rows = rows[:limit]
    next_cursor = (
        encode_cursor(page_rows[-1].id, page_rows[-1].id) if has_more and page_rows else None
    )
    return {
        "data": [BounceOut.model_validate(b).model_dump() for b in page_rows],
        "pagination": Pagination(
            next_cursor=next_cursor, has_more=has_more, limit=limit
        ).model_dump(),
    }


# ---------------------------------------------------------------------------
# Mailgun webhook (public, signature-verified)
# ---------------------------------------------------------------------------


def _verify_mailgun_signature(payload: dict[str, Any], signing_key: str) -> bool:
    """Verify Mailgun webhook signature.

    Mailgun sends ``signature: { token, timestamp, signature }`` where
    ``signature == HMAC-SHA256(signing_key, timestamp+token)``.
    """
    import hashlib
    import hmac

    sig = payload.get("signature") or {}
    token = str(sig.get("token") or "")
    timestamp = str(sig.get("timestamp") or "")
    received = str(sig.get("signature") or "")
    if not token or not timestamp or not received:
        return False
    digest = hmac.new(
        signing_key.encode("utf-8"),
        f"{timestamp}{token}".encode(),
        hashlib.sha256,
    ).hexdigest()
    return hmac.compare_digest(digest, received)


_MAILGUN_HARD_BOUNCE_EVENTS = {"failed", "permanent_failure", "complaint", "rejected"}
_MAILGUN_SOFT_BOUNCE_EVENTS = {"temporary_failure"}
_MAILGUN_DELIVERED_EVENTS = {"delivered", "accepted"}


@router.post("/webhooks/mailgun/{tenant_id}")
async def mailgun_webhook(
    tenant_id: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    """Public Mailgun webhook endpoint.

    Authenticated via HMAC ``signature`` in the JSON body; no Bearer token.
    """
    s = get_settings()
    payload = await request.json()
    signing_key = s.MAILGUN_WEBHOOK_SIGNING_KEY
    if signing_key:
        if not _verify_mailgun_signature(payload, signing_key):
            raise Problem(401, "UNAUTHENTICATED", "Bad mailgun signature")

    event_data = payload.get("event-data") or {}
    event = str(event_data.get("event") or "").lower()
    severity = str(event_data.get("severity") or "").lower()
    recipient = str(
        event_data.get("recipient")
        or (event_data.get("envelope") or {}).get("targets")
        or ""
    )
    reason_obj = event_data.get("delivery-status") or {}
    reason = str(reason_obj.get("description") or reason_obj.get("message") or "")
    user_vars = event_data.get("user-variables") or {}
    user_id = str(user_vars.get("user_id") or "") or None

    if not recipient:
        return {"ok": True, "ignored": "no recipient"}

    is_hard = event in _MAILGUN_HARD_BOUNCE_EVENTS or severity == "permanent"
    is_soft = event in _MAILGUN_SOFT_BOUNCE_EVENTS or severity == "temporary"

    if event in _MAILGUN_DELIVERED_EVENTS:
        return {"ok": True, "stored": False, "event": event}

    if not (is_hard or is_soft):
        return {"ok": True, "stored": False, "event": event}

    # Persist bounce.
    from notification_service.ids import bounce_id

    b = EmailBounce(
        id=bounce_id(),
        user_id=user_id,
        email=recipient,
        kind="hard" if is_hard else "soft",
        reason=reason or event,
    )
    db.add(b)
    await db.flush()

    disabled_user = False
    if is_hard:
        threshold = s.EMAIL_HARD_BOUNCES_THRESHOLD
        cnt_q = (
            select(func.count())
            .select_from(EmailBounce)
            .where(EmailBounce.email == recipient, EmailBounce.kind == "hard")
        )
        cnt = (await db.execute(cnt_q)).scalar_one_or_none() or 0
        if int(cnt) >= int(threshold):
            # Disable email locally (NotificationPreference.email_disabled) AND
            # emit a Kafka event so Identity can flag the user globally.
            from notification_service.models import NotificationPreference

            if user_id:
                pref = await db.get(NotificationPreference, user_id)
                if pref is not None:
                    pref.email_disabled = True
            disabled_user = True
            try:
                from notification_service.consumers.dispatcher import publish_event

                await publish_event(
                    "plaglens.notification.email_disabled.v1",
                    {
                        "type": "notification.email_disabled.v1",
                        "data": {
                            "tenant_id": tenant_id,
                            "user_id": user_id,
                            "email": recipient,
                            "reason": reason or event,
                            "hard_bounce_count": int(cnt),
                        },
                    },
                )
            except Exception:  # noqa: BLE001
                # Kafka may be disabled in tests / dev — that's fine.
                pass

    return {
        "ok": True,
        "stored": True,
        "kind": "hard" if is_hard else "soft",
        "user_disabled": disabled_user,
    }


_ = Problem  # placate ruff if unused
