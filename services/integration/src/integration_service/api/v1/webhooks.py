"""Incoming webhooks (§J). Public endpoints — auth via HMAC."""
from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, Header, Request, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from integration_service.common.kafka_bus import KafkaBus
from integration_service.deps import bus_dep, session_dep
from integration_service.services.webhooks import receive_webhook

router = APIRouter(prefix="/webhooks", tags=["webhooks"])


@router.post("/stepik/{tenant_id}", status_code=status.HTTP_200_OK)
async def stepik_webhook(
    tenant_id: str,
    request: Request,
    session: AsyncSession = Depends(session_dep),
    bus: KafkaBus = Depends(bus_dep),
    x_signature: str | None = Header(default=None, alias="X-Signature"),
) -> dict[str, Any]:
    body = await request.body()
    headers = dict(request.headers.items())
    if x_signature:
        headers["X-Signature"] = x_signature
    evt, dup = await receive_webhook(
        session, "stepik", body, headers, tenant_id=tenant_id, bus=bus
    )
    await session.commit()
    return {"ok": True, "event_id": evt.id, "duplicate": dup}


@router.post("/yandex-contest/{tenant_id}")
async def yandex_contest_webhook(
    tenant_id: str,
    request: Request,
    session: AsyncSession = Depends(session_dep),
    bus: KafkaBus = Depends(bus_dep),
) -> dict[str, Any]:
    body = await request.body()
    headers = dict(request.headers.items())
    evt, dup = await receive_webhook(
        session, "yandex_contest", body, headers, tenant_id=tenant_id, bus=bus
    )
    await session.commit()
    return {"ok": True, "event_id": evt.id, "duplicate": dup}


@router.post("/telegram")
async def telegram_webhook(
    request: Request,
    session: AsyncSession = Depends(session_dep),
    bus: KafkaBus = Depends(bus_dep),
    x_telegram_bot_api_secret_token: str | None = Header(
        default=None, alias="X-Telegram-Bot-Api-Secret-Token"
    ),
) -> dict[str, Any]:
    body = await request.body()
    headers = dict(request.headers.items())
    if x_telegram_bot_api_secret_token:
        headers["X-Telegram-Bot-Api-Secret-Token"] = x_telegram_bot_api_secret_token
    evt, dup = await receive_webhook(session, "telegram", body, headers, bus=bus)
    await session.commit()
    return {"ok": True, "event_id": evt.id, "duplicate": dup}


@router.post("/plagiarism/{provider}/{run_id}")
async def plagiarism_webhook(
    provider: str,
    run_id: str,
    request: Request,
    session: AsyncSession = Depends(session_dep),
    bus: KafkaBus = Depends(bus_dep),
) -> dict[str, Any]:
    body = await request.body()
    headers = dict(request.headers.items())
    headers["X-Provider"] = provider
    headers["X-Run-Id"] = run_id
    evt, dup = await receive_webhook(session, "plagiarism", body, headers, bus=bus)
    await session.commit()
    return {"ok": True, "event_id": evt.id, "duplicate": dup}


@router.post("/llm/{provider}")
async def llm_webhook(
    provider: str,
    request: Request,
    session: AsyncSession = Depends(session_dep),
    bus: KafkaBus = Depends(bus_dep),
) -> dict[str, Any]:
    body = await request.body()
    headers = dict(request.headers.items())
    headers["X-Provider"] = provider
    evt, dup = await receive_webhook(session, "llm", body, headers, bus=bus)
    await session.commit()
    return {"ok": True, "event_id": evt.id, "duplicate": dup}


_ = Response
