"""Pluggable integration adapters."""
from integration_service.adapters.base import (
    ConnectionStatus,
    DomainEvent,
    ImportResult,
    IntegrationAdapter,
    RemoteCourse,
)
from integration_service.adapters.ejudge import EjudgeAdapter
from integration_service.adapters.google_sheets import GoogleSheetsAdapter
from integration_service.adapters.manual import ManualAdapter
from integration_service.adapters.stepik import StepikAdapter
from integration_service.adapters.telegram import TelegramAdapter
from integration_service.adapters.yandex_contest import YandexContestAdapter

ADAPTERS: dict[str, type[IntegrationAdapter]] = {
    "stepik": StepikAdapter,
    "yandex_contest": YandexContestAdapter,
    "ejudge": EjudgeAdapter,
    "manual": ManualAdapter,
    "telegram": TelegramAdapter,
    "google_sheets": GoogleSheetsAdapter,
}


def get_adapter(kind: str) -> IntegrationAdapter:
    cls = ADAPTERS.get(kind)
    if cls is None:
        raise KeyError(f"Unknown adapter kind: {kind}")
    return cls()


__all__ = [
    "IntegrationAdapter",
    "ConnectionStatus",
    "ImportResult",
    "RemoteCourse",
    "DomainEvent",
    "ADAPTERS",
    "get_adapter",
    "StepikAdapter",
    "YandexContestAdapter",
    "ManualAdapter",
    "TelegramAdapter",
    "GoogleSheetsAdapter",
]
