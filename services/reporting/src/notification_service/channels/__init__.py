"""Delivery channels."""
from notification_service.channels.base import Channel, DeliveryRequest, DeliveryResult
from notification_service.channels.email import (
    EmailChannel,
    MailgunEmailChannel,
    SmtpEmailChannel,
    build_email_channel,
)
from notification_service.channels.inapp import InAppChannel
from notification_service.channels.telegram import TelegramChannel

__all__ = [
    "Channel",
    "DeliveryRequest",
    "DeliveryResult",
    "InAppChannel",
    "EmailChannel",
    "SmtpEmailChannel",
    "MailgunEmailChannel",
    "build_email_channel",
    "TelegramChannel",
]
