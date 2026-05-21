"""Transactional email service for Identity.

Identity does **not** own SMTP / Mailgun — those live in the notification
service. This file is a thin HTTP forwarder: each ``send_*`` method posts a
fully-rendered, locale-stamped email to
``POST {notification_base_url}/api/v1/internal/notifications/email-direct``.
The notification service writes one ``Notification`` row + dispatches via the
configured email channel (Mailhog in dev, SMTP/Mailgun in prod).

When ``notification_base_url`` is empty or the HTTP call fails the methods log
the message and return — Identity must never fail a user-facing request
because the mail bus is down.
"""
from __future__ import annotations

import logging
from typing import Any

import httpx

from ..config import get_settings

logger = logging.getLogger(__name__)

_SYSTEM_USER_ID = "system"
_SYSTEM_TENANT_ID = "system"


def build_frontend_url(path: str, token: str) -> str:
    """Build an absolute callback URL for transactional emails.

    Uses ``settings.frontend_base_url`` when set, falls back to a relative
    path so the consumer can resolve the host themselves. ``path`` must start
    with a slash, e.g. ``/reset``.
    """
    base = get_settings().frontend_base_url.rstrip("/")
    if base:
        return f"{base}{path}?t={token}"
    return f"{path}?t={token}"


def _wrap_html(*, heading: str, body_text: str, action_label: str, action_url: str) -> str:
    """Render a minimal Russian-friendly transactional template inline.

    Kept inside identity so we don't depend on notification's template store
    being seeded. notification renders the string through Jinja2, so the
    action_url survives even when it contains ``?token=...``.
    """
    return f"""<!doctype html>
<html lang="ru"><body style="font-family:Inter,Arial,sans-serif;color:#111;background:#fff;margin:0;padding:24px;">
  <div style="max-width:560px;margin:0 auto;">
    <h2 style="margin:0 0 16px;font-weight:600;">{heading}</h2>
    <p style="margin:0 0 20px;line-height:1.5;">{body_text}</p>
    <p style="margin:0 0 24px;">
      <a href="{action_url}" style="display:inline-block;background:#111;color:#fff;text-decoration:none;
                                    padding:10px 18px;border-radius:6px;">{action_label}</a>
    </p>
    <p style="margin:0;color:#888;font-size:13px;line-height:1.5;">
      Если кнопка не работает, скопируйте ссылку: <br>{action_url}
    </p>
    <hr style="border:0;border-top:1px solid #eee;margin:32px 0 16px;">
    <p style="margin:0;color:#999;font-size:12px;">PlagLens — антиплагиат-платформа для учебных курсов.</p>
  </div>
</body></html>"""


def _wrap_text(*, heading: str, body_text: str, action_label: str, action_url: str) -> str:
    return f"{heading}\n\n{body_text}\n\n{action_label}: {action_url}\n\n— PlagLens"


class EmailService:
    """HTTP forwarder to notification-service's email-direct endpoint."""

    def __init__(
        self,
        *,
        base_url: str | None = None,
        internal_token: str | None = None,
        default_from: str = "no-reply@plaglens.local",
        timeout_seconds: float = 5.0,
    ) -> None:
        settings = get_settings()
        self._base_url = (base_url if base_url is not None else settings.notification_base_url).rstrip("/")
        self._token = (
            internal_token
            if internal_token is not None
            else settings.notification_internal_token
        )
        self._timeout = timeout_seconds
        self.default_from = default_from

    async def _post(
        self,
        *,
        recipient: str,
        subject: str,
        heading: str,
        body_text: str,
        action_label: str,
        action_url: str,
        event_type: str,
    ) -> None:
        if not self._base_url:
            logger.info("[email-stub] to=%s subject=%s url=%s", recipient, subject, action_url)
            return
        html = _wrap_html(
            heading=heading, body_text=body_text, action_label=action_label, action_url=action_url
        )
        text = _wrap_text(
            heading=heading, body_text=body_text, action_label=action_label, action_url=action_url
        )
        payload: dict[str, Any] = {
            "user_id": _SYSTEM_USER_ID,
            "tenant_id": _SYSTEM_TENANT_ID,
            "recipient": recipient,
            "subject": subject,
            "body_html": html,
            "body_text": text,
            "event_type": event_type,
            "severity": "info",
        }
        headers = {"Content-Type": "application/json"}
        if self._token:
            headers["Authorization"] = f"Bearer {self._token}"
        url = f"{self._base_url}/api/v1/internal/notifications/email-direct"
        try:
            async with httpx.AsyncClient(timeout=self._timeout) as client:
                resp = await client.post(url, json=payload, headers=headers)
                if resp.status_code >= 400:
                    logger.warning(
                        "[email] notification rejected %s: %s",
                        resp.status_code,
                        resp.text[:300],
                    )
                else:
                    logger.info("[email] sent to=%s subject=%s", recipient, subject)
        except Exception as exc:  # network / dns / timeout
            logger.warning("[email] transport failed (%s): %s", url, exc)

    async def send_password_reset(self, *, to: str, reset_url: str) -> None:
        await self._post(
            recipient=to,
            subject="Сброс пароля в PlagLens",
            heading="Сброс пароля",
            body_text=(
                "Вы запросили сброс пароля. Перейдите по ссылке, чтобы задать новый пароль. "
                "Если вы этого не делали — просто проигнорируйте письмо, ссылка скоро истечёт."
            ),
            action_label="Задать новый пароль",
            action_url=reset_url,
            event_type="identity.email.password_reset.v1",
        )

    async def send_email_verification(self, *, to: str, verify_url: str) -> None:
        await self._post(
            recipient=to,
            subject="Подтверждение email в PlagLens",
            heading="Подтвердите email",
            body_text=(
                "Чтобы завершить регистрацию, подтвердите свой email. "
                "Ссылка действительна ограниченное время."
            ),
            action_label="Подтвердить email",
            action_url=verify_url,
            event_type="identity.email.verify.v1",
        )

    async def send_email_change_confirmation(self, *, to: str, confirm_url: str) -> None:
        await self._post(
            recipient=to,
            subject="Подтверждение смены email в PlagLens",
            heading="Подтвердите новый email",
            body_text=(
                "Вы запросили смену email в PlagLens. Подтвердите новый адрес — после этого "
                "вход будет работать только по новому email."
            ),
            action_label="Подтвердить новый email",
            action_url=confirm_url,
            event_type="identity.email.change.v1",
        )

    async def send_invitation(self, *, to: str, invite_url: str, tenant_name: str) -> None:
        await self._post(
            recipient=to,
            subject=f"Приглашение в {tenant_name} (PlagLens)",
            heading=f"Вас пригласили в {tenant_name}",
            body_text=(
                f"Вас пригласили присоединиться к учреждению «{tenant_name}» в PlagLens. "
                "Перейдите по ссылке, чтобы принять приглашение и завести аккаунт."
            ),
            action_label="Принять приглашение",
            action_url=invite_url,
            event_type="identity.email.invitation.v1",
        )

    async def send_invitation_with_code(
        self,
        *,
        to: str,
        invite_url: str,
        tenant_name: str,
        code: str,
        role: str,
    ) -> None:
        """Invitation email with both the short code (for in-app redeem after
        registration) and a fallback magic link to the accept page."""
        role_label = {
            "teacher": "преподавателя",
            "assistant": "ассистента",
            "student": "студента",
        }.get(role, role)
        body_text = (
            f"Вас пригласили в учреждение «{tenant_name}» в PlagLens с ролью {role_label}. "
            f"Зарегистрируйтесь обычным способом, затем зайдите в «Профиль» и введите код "
            f"<b>{code}</b>. Код активирует роль автоматически. "
            f"Если уже есть аккаунт в «{tenant_name}» — просто введите код в профиле."
        )
        await self._post(
            recipient=to,
            subject=f"Приглашение в {tenant_name} (PlagLens) — код {code}",
            heading=f"Вас пригласили в {tenant_name}",
            body_text=body_text,
            action_label="Открыть PlagLens",
            action_url=invite_url,
            event_type="identity.email.invitation.v1",
        )
