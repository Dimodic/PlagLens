"""Email transport (stub).

For local/dev runs we just log the message. In production this is replaced by
a Mailgun / Notification-Service integration. Identity Service does not own the
canonical delivery layer — it merely *requests* an email be sent.
"""
from __future__ import annotations

import logging

logger = logging.getLogger(__name__)


class EmailService:
    """Pluggable email service. The default implementation only logs the link.

    Replace via DI for production: see ``deps.get_email_service``.
    """

    def __init__(self, default_from: str = "no-reply@plaglens.local") -> None:
        self.default_from = default_from

    async def send_password_reset(self, *, to: str, reset_url: str) -> None:
        # TODO: integrate with Mailgun / Notification Service.
        logger.info("[email] password-reset to=%s url=%s", to, reset_url)

    async def send_email_verification(self, *, to: str, verify_url: str) -> None:
        # TODO: integrate with Mailgun / Notification Service.
        logger.info("[email] email-verify to=%s url=%s", to, verify_url)

    async def send_email_change_confirmation(
        self, *, to: str, confirm_url: str
    ) -> None:
        # TODO: integrate with Mailgun / Notification Service.
        logger.info("[email] email-change to=%s url=%s", to, confirm_url)

    async def send_invitation(
        self, *, to: str, invite_url: str, tenant_name: str
    ) -> None:
        # TODO: integrate with Mailgun / Notification Service.
        logger.info(
            "[email] invitation to=%s tenant=%s url=%s", to, tenant_name, invite_url
        )
