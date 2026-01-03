"""Telegram adapter (aiogram-based skeleton)."""
from __future__ import annotations

import asyncio
from datetime import datetime
from typing import Any, Awaitable, Callable, Dict, List, Optional

import structlog

from integration_service.adapters.base import (
    ConnectionStatus,
    DomainEvent,
    ImportResult,
    IntegrationAdapter,
    RemoteCourse,
)

logger = structlog.get_logger(__name__)

try:
    from aiogram import Bot, Dispatcher, F  # type: ignore
    from aiogram.filters import Command  # type: ignore
    from aiogram.types import Message  # type: ignore

    AIOGRAM_AVAILABLE = True
except Exception:  # pragma: no cover
    Bot = None  # type: ignore
    Dispatcher = None  # type: ignore
    F = None  # type: ignore
    Command = None  # type: ignore
    Message = None  # type: ignore
    AIOGRAM_AVAILABLE = False


class TelegramAdapter(IntegrationAdapter):
    kind = "telegram"

    async def test_connection(self, config: Any) -> ConnectionStatus:
        s = getattr(config, "settings", None) or {}
        token = s.get("bot_token") if isinstance(s, dict) else None
        if not token:
            return ConnectionStatus(ok=False, detail="bot_token missing")
        return ConnectionStatus(ok=True)

    async def list_remote_courses(self, config: Any) -> List[RemoteCourse]:  # noqa: ARG002
        return []

    async def import_submissions(
        self,
        config: Any,
        scope: Dict[str, Any],
        since: Optional[datetime],
    ) -> ImportResult:  # noqa: ARG002
        return ImportResult()

    async def handle_webhook(
        self,
        payload: bytes,
        headers: Dict[str, str],
        config: Optional[Any] = None,
    ) -> List[DomainEvent]:
        return []


class TelegramBotRunner:
    """Light wrapper around an aiogram bot.

    Wires three commands: `/start <token>`, `/unbind`, `/help`.
    The handlers call back into a `binding_service`-like callable for actual
    DB work, so the bot module stays thin.
    """

    def __init__(
        self,
        bot_token: str,
        on_start_token: Callable[[str, int, Optional[str]], Awaitable[bool]],
        on_unbind: Callable[[int], Awaitable[bool]],
    ) -> None:
        self.bot_token = bot_token
        self.on_start_token = on_start_token
        self.on_unbind = on_unbind
        self._task: Optional[asyncio.Task[Any]] = None
        self.bot: Any = None
        self.dp: Any = None

    def _build_dispatcher(self) -> Any:
        if not AIOGRAM_AVAILABLE:
            raise RuntimeError("aiogram not installed")
        dp = Dispatcher()  # type: ignore[misc]

        @dp.message(Command("start"))
        async def start(message: Message) -> None:  # type: ignore[no-redef]
            args = (message.text or "").split(maxsplit=1)
            token = args[1].strip() if len(args) > 1 else ""
            if not token:
                await message.answer(
                    "Hi! Use /start <token> with the binding token from PlagLens UI."
                )
                return
            ok = await self.on_start_token(
                token, message.chat.id, message.from_user.username if message.from_user else None
            )
            if ok:
                await message.answer("Telegram account bound to PlagLens.")
            else:
                await message.answer("Invalid or expired token.")

        @dp.message(Command("unbind"))
        async def unbind(message: Message) -> None:  # type: ignore[no-redef]
            ok = await self.on_unbind(message.chat.id)
            if ok:
                await message.answer("Unbound.")
            else:
                await message.answer("Nothing to unbind.")

        @dp.message(Command("help"))
        async def help_cmd(message: Message) -> None:  # type: ignore[no-redef]
            await message.answer(
                "/start <token>  bind PlagLens account\n"
                "/unbind  remove binding\n"
                "/help  this message"
            )

        return dp

    async def start(self) -> None:
        if not AIOGRAM_AVAILABLE:
            logger.warning("telegram.aiogram_unavailable")
            return
        self.bot = Bot(self.bot_token)  # type: ignore[misc]
        self.dp = self._build_dispatcher()
        self._task = asyncio.create_task(self.dp.start_polling(self.bot))

    async def stop(self) -> None:
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except (asyncio.CancelledError, Exception):
                pass
        if self.bot is not None:
            try:
                await self.bot.session.close()
            except Exception:
                pass
