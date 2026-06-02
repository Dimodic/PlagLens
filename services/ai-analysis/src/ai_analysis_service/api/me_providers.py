"""Per-user AI provider connections — "bring your own key".

A teacher / assistant connects their own LLM provider + key here (surfaced in
course Integrations). The orchestrator resolves the provider by the *actor*
running an analysis, so each person uses their own key/account. Tenant-level
configs (``owner_user_id IS NULL``, managed by admins) remain the fallback and
the source for the column-matcher assist.
"""
from __future__ import annotations

import logging
from datetime import UTC, datetime

import httpx
from fastapi import APIRouter, status
from pydantic import BaseModel
from sqlalchemy import select, update

from ..common.ids import gen_id
from ..common.problem import bad_request, forbidden, not_found, upstream_failed
from ..deps import PrincipalDep, SessionDep
from ..models import ProviderConfig
from ..prompts import DEFAULT_PROMPT_VERSION, get_builtin

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/v1/me/ai")

_STAFF_GLOBAL = ("admin", "teacher", "assistant")
_STAFF_COURSE = ("owner", "co_owner", "assistant")

# OpenAI-compatible defaults so the teacher only needs to pick a provider + key.
_BASE_URL = {
    "openrouter": "https://openrouter.ai/api/v1",
    "openai": "https://api.openai.com/v1",
}


def _require_staff(principal) -> None:
    if principal.global_role in _STAFF_GLOBAL:
        return
    if any(r in _STAFF_COURSE for r in (principal.course_roles or {}).values()):
        return
    raise forbidden("Only teachers/assistants can manage AI providers")


def _resolve_base_url(provider: str, base_url: str | None) -> str:
    if base_url and base_url.strip():
        return base_url.strip()
    return _BASE_URL.get((provider or "").lower(), "")


class MeProviderOut(BaseModel):
    id: str
    provider: str
    model: str
    base_url: str
    active: bool
    has_key: bool
    # The connector's own system-prompt override (None = standard prompt).
    system_prompt: str | None = None


class MeProviderCreate(BaseModel):
    provider: str
    model: str
    api_key: str
    base_url: str | None = None
    activate: bool = True
    system_prompt: str | None = None


class MeProviderUpdate(BaseModel):
    model: str | None = None
    base_url: str | None = None
    api_key: str | None = None
    # "" clears the override (back to standard); None = leave unchanged.
    system_prompt: str | None = None


class MeModelOut(BaseModel):
    id: str
    name: str


class MeListModelsIn(BaseModel):
    provider: str
    api_key: str | None = None
    base_url: str | None = None


class MePromptDefaultOut(BaseModel):
    system_prompt: str


def _read_system_prompt(row: ProviderConfig) -> str | None:
    s = row.settings
    if isinstance(s, dict):
        value = s.get("system_prompt")
        if isinstance(value, str) and value.strip():
            return value
    return None


def _settings_with_prompt(
    existing: dict | None, system_prompt: str | None
) -> dict | None:
    """Merge a system-prompt override into the settings JSON. A blank value
    drops the override (→ standard prompt). Reassigned (not mutated in place)
    so SQLAlchemy detects the change."""
    merged = dict(existing or {})
    sp = (system_prompt or "").strip()
    if sp:
        merged["system_prompt"] = sp
    else:
        merged.pop("system_prompt", None)
    return merged or None


def _to_out(row: ProviderConfig) -> MeProviderOut:
    return MeProviderOut(
        id=row.id,
        provider=row.provider,
        model=row.model,
        base_url=row.base_url,
        active=bool(row.default_for_tenant),
        has_key=bool(row.api_key_secret_ref or row.api_key_env_var),
        system_prompt=_read_system_prompt(row),
    )


async def _set_active(session, principal, active_id: str) -> None:
    """Mark one of the user's providers active (default flag), the rest not."""
    await session.execute(
        update(ProviderConfig)
        .where(
            ProviderConfig.tenant_id == principal.tenant_id,
            ProviderConfig.owner_user_id == principal.user_id,
            ProviderConfig.deleted_at.is_(None),
        )
        .values(default_for_tenant=(ProviderConfig.id == active_id))
        .execution_options(synchronize_session=False)
    )


async def _get_mine(session, principal, provider_id: str) -> ProviderConfig:
    row = await session.get(ProviderConfig, provider_id)
    if (
        row is None
        or row.deleted_at is not None
        or row.tenant_id != principal.tenant_id
        or row.owner_user_id != principal.user_id
    ):
        raise not_found("provider")
    return row


@router.get("/providers", response_model=list[MeProviderOut])
async def list_my_providers(principal: PrincipalDep, session: SessionDep):
    _require_staff(principal)
    stmt = (
        select(ProviderConfig)
        .where(
            ProviderConfig.tenant_id == principal.tenant_id,
            ProviderConfig.owner_user_id == principal.user_id,
            ProviderConfig.deleted_at.is_(None),
        )
        .order_by(
            ProviderConfig.default_for_tenant.desc(),
            ProviderConfig.created_at.asc(),
        )
    )
    return [_to_out(r) for r in (await session.execute(stmt)).scalars()]


@router.post(
    "/providers", response_model=MeProviderOut, status_code=status.HTTP_201_CREATED
)
async def create_my_provider(
    body: MeProviderCreate, principal: PrincipalDep, session: SessionDep
):
    _require_staff(principal)
    base_url = _resolve_base_url(body.provider, body.base_url)
    if not base_url:
        raise not_found("base_url is required for this provider")
    row = ProviderConfig(
        id=gen_id("pcf"),
        tenant_id=principal.tenant_id,
        owner_user_id=principal.user_id,
        provider=body.provider,
        base_url=base_url,
        model=body.model,
        api_key_secret_ref=(body.api_key or "").strip() or None,
        api_key_env_var=None,
        enabled=True,
        default_for_tenant=False,
        priority=100,
        settings=_settings_with_prompt(None, body.system_prompt),
    )
    session.add(row)
    await session.flush()
    if body.activate:
        await _set_active(session, principal, row.id)
        row.default_for_tenant = True
    await session.commit()
    return _to_out(row)


@router.patch("/providers/{provider_id}", response_model=MeProviderOut)
async def update_my_provider(
    provider_id: str,
    body: MeProviderUpdate,
    principal: PrincipalDep,
    session: SessionDep,
):
    _require_staff(principal)
    row = await _get_mine(session, principal, provider_id)
    if body.model is not None:
        row.model = body.model
    if body.base_url is not None:
        row.base_url = _resolve_base_url(row.provider, body.base_url) or row.base_url
    if body.api_key is not None and body.api_key.strip():
        row.api_key_secret_ref = body.api_key.strip()
        row.api_key_env_var = None
    if body.system_prompt is not None:
        row.settings = _settings_with_prompt(row.settings, body.system_prompt)
    await session.commit()
    return _to_out(row)


@router.post("/providers/{provider_id}:activate", response_model=MeProviderOut)
async def activate_my_provider(
    provider_id: str, principal: PrincipalDep, session: SessionDep
):
    _require_staff(principal)
    row = await _get_mine(session, principal, provider_id)
    await _set_active(session, principal, provider_id)
    row.default_for_tenant = True
    await session.commit()
    return _to_out(row)


@router.delete("/providers/{provider_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_my_provider(
    provider_id: str, principal: PrincipalDep, session: SessionDep
):
    _require_staff(principal)
    row = await _get_mine(session, principal, provider_id)
    row.deleted_at = datetime.now(UTC)
    await session.commit()


@router.post("/providers:listModels", response_model=list[MeModelOut])
async def list_provider_models(body: MeListModelsIn, principal: PrincipalDep):
    """Fetch the catalogue of models the provider offers, so the teacher
    picks from a searchable list instead of typing a model id by hand.

    Both OpenRouter and OpenAI expose an OpenAI-style ``GET {base}/models``.
    OpenRouter's listing is public; OpenAI's needs the key — so we forward
    the entered key when present. Nothing is persisted here; this is a
    read-only proxy used while filling the connect form.
    """
    _require_staff(principal)
    base_url = _resolve_base_url(body.provider, body.base_url)
    if not base_url:
        raise bad_request("Неизвестный провайдер")

    headers = {"Accept": "application/json"}
    key = (body.api_key or "").strip()
    if key:
        headers["Authorization"] = f"Bearer {key}"

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.get(f"{base_url.rstrip('/')}/models", headers=headers)
    except httpx.RequestError as exc:
        raise upstream_failed("Не удалось связаться с провайдером") from exc

    if resp.status_code in (401, 403):
        raise bad_request(
            "Провайдер отклонил ключ — проверьте API-ключ или права доступа"
        )
    if resp.status_code >= 400:
        raise upstream_failed(f"Провайдер вернул ошибку {resp.status_code}")

    try:
        payload = resp.json()
    except ValueError as exc:
        raise upstream_failed("Некорректный ответ провайдера") from exc

    data = payload.get("data") if isinstance(payload, dict) else None
    if not isinstance(data, list):
        return []

    out: list[MeModelOut] = []
    seen: set[str] = set()
    for item in data:
        if not isinstance(item, dict):
            continue
        model_id = str(item.get("id") or "").strip()
        if not model_id or model_id in seen:
            continue
        seen.add(model_id)
        name = str(item.get("name") or model_id).strip()
        out.append(MeModelOut(id=model_id, name=name))
    out.sort(key=lambda m: m.id.lower())
    return out


@router.get("/prompt-default", response_model=MePromptDefaultOut)
async def get_default_prompt(principal: PrincipalDep):
    """The standard system prompt the teacher can start from / fall back to.

    It already instructs the model to return the structured JSON PlagLens uses
    for per-line comments — so a custom prompt should keep that contract.
    """
    _require_staff(principal)
    builtin = get_builtin(DEFAULT_PROMPT_VERSION) or {}
    return MePromptDefaultOut(system_prompt=str(builtin.get("system_prompt", "")))


__all__ = ["router"]
