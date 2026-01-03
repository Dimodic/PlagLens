"""Rule engine: Kafka event -> recipients + channels.

Algorithm:
1. From event metadata, decide candidate `user_id`s. For now we trust hints:
   - `event.data.recipient_user_id` (single)
   - `event.data.recipient_user_ids` (list)
   - `event.data.author_id` / `event.data.user_id` (best-effort default)
   - For broadcast event types like budget warnings the rule emits to all admins
     (handled at consumer-side by passing `include_admins=True`).
2. For each user load `NotificationPreference`, intersect with `channels_enabled`
   and `per_event[event_type]` overlay. If all channels off -> skip user.
3. Return list of (user_id, [channels]) tuples.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from notification_service.models import NotificationPreference
from notification_service.preferences_defaults import default_per_event


@dataclass
class Recipient:
    user_id: str
    tenant_id: str
    channels: list[str]
    pref: NotificationPreference | None


def _coerce_list(v: Any) -> list[str]:
    if v is None:
        return []
    if isinstance(v, list):
        return [str(x) for x in v if x]
    return [str(v)]


def extract_recipient_ids(event: dict[str, Any]) -> list[str]:
    data = event.get("data") or {}
    out: list[str] = []
    for key in ("recipient_user_ids",):
        out.extend(_coerce_list(data.get(key)))
    for key in ("recipient_user_id", "author_id", "user_id", "student_id"):
        v = data.get(key)
        if v:
            out.append(str(v))
    # Dedup keep order
    seen: set[str] = set()
    uniq: list[str] = []
    for x in out:
        if x not in seen:
            seen.add(x)
            uniq.append(x)
    return uniq


async def resolve_recipients(
    session: AsyncSession,
    event: dict[str, Any],
    *,
    extra_user_ids: list[str] | None = None,
) -> list[Recipient]:
    event_type = event.get("type", "")
    tenant_id = event.get("tenant_id") or (event.get("data") or {}).get("tenant_id") or ""
    user_ids = extract_recipient_ids(event)
    if extra_user_ids:
        for u in extra_user_ids:
            if u not in user_ids:
                user_ids.append(u)
    if not user_ids:
        return []

    stmt = select(NotificationPreference).where(NotificationPreference.user_id.in_(user_ids))
    res = await session.execute(stmt)
    prefs_by_user = {p.user_id: p for p in res.scalars().all()}

    recipients: list[Recipient] = []
    for uid in user_ids:
        pref = prefs_by_user.get(uid)
        # Default ch_enabled if no row
        ch_enabled = (
            dict(pref.channels_enabled)
            if pref is not None
            else {"inapp": True, "email": True, "telegram": False}
        )
        # Apply per-event overrides
        per_event_map: dict[str, dict[str, bool]] = (
            dict(pref.per_event) if pref is not None else default_per_event()
        )
        per_event_for_type = per_event_map.get(event_type, {})
        active = []
        for ch in ("inapp", "email", "telegram"):
            global_on = bool(ch_enabled.get(ch, False))
            event_on = per_event_for_type.get(ch, global_on)
            if global_on and event_on:
                # Email/telegram require recipient address
                if ch == "email" and pref is not None and pref.email_disabled:
                    continue
                if ch == "telegram" and pref is not None and pref.telegram_revoked:
                    continue
                if ch == "email" and (pref is None or not pref.email):
                    continue
                if ch == "telegram" and (pref is None or not pref.telegram_chat_id):
                    continue
                active.append(ch)
        if not active:
            continue
        rec_tenant = (
            pref.tenant_id if pref is not None and pref.tenant_id else tenant_id or "tnt_unknown"
        )
        recipients.append(
            Recipient(user_id=uid, tenant_id=rec_tenant, channels=active, pref=pref)
        )
    return recipients
