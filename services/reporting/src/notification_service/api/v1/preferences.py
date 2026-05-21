"""Section C: notification preferences."""
from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from notification_service.db import get_db
from notification_service.models import NotificationPreference
from notification_service.preferences_defaults import (
    DEFAULT_CHANNELS,
    EVENT_DESCRIPTIONS,
    default_per_event,
    default_preferences_payload,
)
from notification_service.schemas import (
    AvailableEventOut,
    PerEventPatch,
    PreferencesOut,
    PreferencesPatch,
    QuietHours,
)
from notification_service.security import Principal, get_principal

router = APIRouter(tags=["preferences"])


async def _get_or_create_pref(
    db: AsyncSession, user_id: str, tenant_id: str
) -> NotificationPreference:
    pref = await db.get(NotificationPreference, user_id)
    if pref is not None:
        return pref
    payload = default_preferences_payload(user_id, tenant_id)
    pref = NotificationPreference(**payload)
    db.add(pref)
    await db.flush()
    return pref


def _to_out(pref: NotificationPreference) -> PreferencesOut:
    return PreferencesOut(
        user_id=pref.user_id,
        channels_enabled=dict(pref.channels_enabled or DEFAULT_CHANNELS),
        email_digest_frequency=pref.email_digest_frequency,  # type: ignore[arg-type]
        per_event=dict(pref.per_event or {}),
        quiet_hours=QuietHours(
            start=pref.quiet_hours_start,
            end=pref.quiet_hours_end,
            timezone=pref.timezone or "UTC",
        ),
        locale=pref.locale or "ru",
        email=pref.email,
        telegram_chat_id=pref.telegram_chat_id,
        email_disabled=pref.email_disabled,
        telegram_revoked=pref.telegram_revoked,
    )


@router.get("/users/me/notification-preferences", response_model=PreferencesOut)
async def get_prefs(
    principal: Principal = Depends(get_principal),
    db: AsyncSession = Depends(get_db),
) -> PreferencesOut:
    pref = await _get_or_create_pref(db, principal.user_id, principal.tenant_id)
    return _to_out(pref)


@router.patch("/users/me/notification-preferences", response_model=PreferencesOut)
async def patch_prefs(
    body: PreferencesPatch,
    principal: Principal = Depends(get_principal),
    db: AsyncSession = Depends(get_db),
) -> PreferencesOut:
    pref = await _get_or_create_pref(db, principal.user_id, principal.tenant_id)
    if body.channels_enabled is not None:
        merged = dict(pref.channels_enabled or {})
        merged.update(body.channels_enabled)
        pref.channels_enabled = merged
    if body.email_digest_frequency is not None:
        pref.email_digest_frequency = body.email_digest_frequency
    if body.quiet_hours is not None:
        pref.quiet_hours_start = body.quiet_hours.start
        pref.quiet_hours_end = body.quiet_hours.end
        pref.timezone = body.quiet_hours.timezone or "UTC"
    if body.locale is not None:
        pref.locale = body.locale
    if body.email is not None:
        pref.email = str(body.email)
    if body.telegram_chat_id is not None:
        pref.telegram_chat_id = body.telegram_chat_id
    return _to_out(pref)


@router.get("/users/me/notification-preferences/per-event")
async def get_per_event(
    principal: Principal = Depends(get_principal),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    pref = await _get_or_create_pref(db, principal.user_id, principal.tenant_id)
    return {"per_event": dict(pref.per_event or {})}


@router.patch("/users/me/notification-preferences/per-event")
async def patch_per_event(
    body: PerEventPatch,
    principal: Principal = Depends(get_principal),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    pref = await _get_or_create_pref(db, principal.user_id, principal.tenant_id)
    merged = dict(pref.per_event or {})
    for et, channels in body.per_event.items():
        merged[et] = {**merged.get(et, {}), **channels}
    pref.per_event = merged
    return {"per_event": dict(pref.per_event or {})}


@router.post("/users/me/notification-preferences:reset-to-defaults", response_model=PreferencesOut)
async def reset_prefs(
    principal: Principal = Depends(get_principal),
    db: AsyncSession = Depends(get_db),
) -> PreferencesOut:
    pref = await _get_or_create_pref(db, principal.user_id, principal.tenant_id)
    pref.channels_enabled = dict(DEFAULT_CHANNELS)
    pref.per_event = default_per_event()
    pref.quiet_hours_start = None
    pref.quiet_hours_end = None
    pref.email_digest_frequency = "instant"
    return _to_out(pref)


@router.get(
    "/users/me/notification-preferences/available-events",
    response_model=list[AvailableEventOut],
)
async def available_events(
    principal: Principal = Depends(get_principal),
) -> list[AvailableEventOut]:
    defaults = default_per_event()
    out: list[AvailableEventOut] = []
    for event_type, desc in EVENT_DESCRIPTIONS.items():
        out.append(
            AvailableEventOut(
                event_type=event_type,
                description=desc,
                default_channels=defaults.get(event_type, dict(DEFAULT_CHANNELS)),
            )
        )
    return out
