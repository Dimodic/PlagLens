"""Telegram channel: aiogram bot.send_message with retry on 429."""
from __future__ import annotations

import asyncio

from notification_service.channels.base import Channel, DeliveryRequest, DeliveryResult
from notification_service.config import get_settings


class TelegramChannel(Channel):
    name = "telegram"

    def __init__(self, bot: object | None = None) -> None:
        # bot may be aiogram.Bot or a duck-typed mock with `send_message(chat_id, text)`.
        self._bot = bot
        self._owns = bot is None
        self._initialized = False

    def _ensure_bot(self) -> object | None:
        if self._initialized:
            return self._bot
        self._initialized = True
        settings = get_settings()
        if settings.TELEGRAM_DISABLED:
            return None
        token = settings.TELEGRAM_BOT_TOKEN
        if token is None and settings.TELEGRAM_BOT_TOKEN_PATH:
            try:
                with open(settings.TELEGRAM_BOT_TOKEN_PATH, encoding="utf-8") as f:
                    token = f.read().strip()
            except OSError:
                token = None
        if not token:
            return None
        try:
            from aiogram import Bot  # type: ignore[import-not-found]

            self._bot = Bot(token=token)
        except Exception:
            self._bot = None
        return self._bot

    async def send(self, req: DeliveryRequest) -> DeliveryResult:
        if not req.recipient_telegram_chat_id:
            return DeliveryResult(status="skipped", error="no telegram chat id")
        bot = self._bot or self._ensure_bot()
        if bot is None:
            return DeliveryResult(status="skipped", error="telegram disabled")
        text = f"<b>{_escape(req.title)}</b>\n\n{_escape(req.body)}"
        if req.action_url:
            text += f"\n\n{_escape(req.action_url)}"
        for attempt in range(3):
            try:
                send = bot.send_message
                await send(chat_id=req.recipient_telegram_chat_id, text=text)
                return DeliveryResult(status="sent")
            except Exception as e:  # noqa: BLE001
                err = str(e)
                retry_after = _parse_retry_after(e)
                lower = err.lower()
                if "forbidden" in lower or "blocked" in lower:
                    return DeliveryResult(status="failed", error="forbidden")
                if retry_after is not None and attempt < 2:
                    await asyncio.sleep(retry_after)
                    continue
                if attempt < 2:
                    await asyncio.sleep(1.0 * (attempt + 1))
                    continue
                return DeliveryResult(status="failed", error=err)
        return DeliveryResult(status="failed", error="unknown")

    async def close(self) -> None:
        if not self._owns or self._bot is None:
            return
        session = getattr(self._bot, "session", None)
        if session is not None:
            try:
                close = getattr(session, "close", None)
                if close is not None:
                    res = close()
                    if asyncio.iscoroutine(res):
                        await res
            except Exception:
                pass


def _escape(s: str) -> str:
    return (
        s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
        if s
        else ""
    )


def _parse_retry_after(exc: Exception) -> float | None:
    """Try to read Telegram TooManyRequests retry_after from aiogram exception."""
    val = getattr(exc, "retry_after", None)
    if isinstance(val, int | float):
        return float(val)
    msg = str(exc)
    if "retry after" in msg.lower():
        for token in msg.split():
            try:
                v = float(token)
                if v > 0:
                    return v
            except ValueError:
                continue
    return None
