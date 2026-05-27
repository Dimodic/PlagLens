"""Internal s2s endpoint: map homeworks → spreadsheet columns with the
tenant's configured LLM.

Reporting's grade-export matcher calls this for the homeworks its
deterministic ДЗ-number heuristic couldn't place. It's best-effort: any
problem (no provider configured, no key, bad/again non-JSON answer)
returns an empty mapping, so the caller falls back to the heuristic and
the teacher's manual override.

Auth is the shared ``X-Service-Secret`` — reporting calls this
off-request (no user JWT), exactly like the other internal s2s hops.
The "model in the admin cabinet" is just the tenant's default
``ProviderConfig`` (managed at /admin/ai/providers).
"""
from __future__ import annotations

import json
import logging
import os
from typing import Any

from fastapi import APIRouter, Header
from openai import AsyncOpenAI
from sqlalchemy import select

from ..config import Settings, get_settings
from ..deps import SessionDep
from ..models import ProviderConfig

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/internal")

_SYSTEM = (
    "Ты сопоставляешь домашние задания (ДЗ) со столбцами таблицы оценок. "
    "Тебе дают список ДЗ (id + название) и список столбцов таблицы "
    "(index + текст заголовка). Верни ТОЛЬКО JSON-объект вида "
    '{"<homework_id>": <column_index>} — column_index это 0-индекс столбца '
    "ИЗ ПРЕДЛОЖЕННЫХ. Сопоставляй по номеру ДЗ и смыслу заголовка. "
    "Если для какого-то ДЗ подходящего столбца нет — пропусти его. "
    "Никакого текста кроме JSON."
)


def _resolve_key(row: ProviderConfig, settings: Settings) -> str | None:
    """env-var → secret_ref → global fallback (mirrors admin_providers)."""
    if getattr(row, "api_key_env_var", None):
        from_env = os.environ.get(row.api_key_env_var) or getattr(
            settings, row.api_key_env_var, None
        )
        if from_env:
            return str(from_env)
    if row.api_key_secret_ref:
        return row.api_key_secret_ref
    return settings.resolve_api_key()


def _extract_json(text: str) -> dict[str, Any]:
    try:
        data = json.loads(text)
    except json.JSONDecodeError:
        start, end = text.find("{"), text.rfind("}")
        if start == -1 or end <= start:
            return {}
        try:
            data = json.loads(text[start : end + 1])
        except json.JSONDecodeError:
            return {}
    return data if isinstance(data, dict) else {}


@router.post("/match-columns")
async def match_columns(
    body: dict[str, Any],
    session: SessionDep,
    x_service_secret: str | None = Header(default=None, alias="X-Service-Secret"),
) -> dict[str, Any]:
    settings = get_settings()
    # Bad/absent secret → silent no-op (don't reveal the endpoint shape).
    if not x_service_secret or x_service_secret != settings.SERVICE_AUTH_SECRET:
        return {"mapping": {}}

    tenant_id = str(body.get("tenant_id") or "")
    homeworks = body.get("homeworks") or []
    headers = body.get("headers") or []
    valid_cols = {
        int(h["index"]) for h in headers if h.get("index") is not None
    }
    hw_ids = {str(h.get("id")) for h in homeworks if h.get("id") is not None}
    if not tenant_id or not hw_ids or not valid_cols:
        return {"mapping": {}}

    row = (
        await session.execute(
            select(ProviderConfig)
            .where(
                ProviderConfig.tenant_id == tenant_id,
                ProviderConfig.enabled.is_(True),
                ProviderConfig.deleted_at.is_(None),
            )
            .order_by(
                ProviderConfig.default_for_tenant.desc(),
                ProviderConfig.priority.asc(),
            )
        )
    ).scalars().first()
    if row is None:
        return {"mapping": {}}
    api_key = _resolve_key(row, settings)
    if not api_key:
        return {"mapping": {}}

    user = json.dumps(
        {"homeworks": homeworks, "columns": headers}, ensure_ascii=False
    )
    try:
        client = AsyncOpenAI(
            base_url=row.base_url, api_key=api_key, timeout=20, max_retries=0
        )
        resp = await client.chat.completions.create(
            model=row.model,
            messages=[
                {"role": "system", "content": _SYSTEM},
                {"role": "user", "content": user},
            ],
            max_tokens=400,
            temperature=0,
        )
        text = resp.choices[0].message.content or "{}"
    except Exception as exc:  # noqa: BLE001 - best-effort, never fatal
        logger.info("match-columns LLM call failed: %s", str(exc)[:200])
        return {"mapping": {}}

    raw = _extract_json(text)
    mapping: dict[str, int] = {}
    for k, v in raw.items():
        try:
            col = int(v)
        except (TypeError, ValueError):
            continue
        if str(k) in hw_ids and col in valid_cols:
            mapping[str(k)] = col
    return {"mapping": mapping}
