"""Pydantic DTOs."""
from integration_service.schemas.common import (
    OperationOut,
    Page,
    Pagination,
    Problem,
)
from integration_service.schemas.configs import (
    ConfigKind,
    ConfigStatus,
    IntegrationConfigCreate,
    IntegrationConfigCreateResponse,
    IntegrationConfigOut,
    IntegrationConfigUpdate,
    TestConnectionResult,
)
from integration_service.schemas.imports import (
    ImportJobOut,
    SyncRequest,
)
from integration_service.schemas.schedules import (
    ScheduleCreate,
    ScheduleOut,
    ScheduleUpdate,
)
from integration_service.schemas.sheets import (
    GoogleSheetsLinkCreate,
    GoogleSheetsLinkOut,
    GoogleSheetsLinkUpdate,
)
from integration_service.schemas.telegram import (
    TelegramBindingOut,
    TelegramBindingStartResponse,
)
from integration_service.schemas.webhooks import (
    WebhookEventOut,
)

__all__ = [
    "ConfigKind",
    "ConfigStatus",
    "IntegrationConfigCreate",
    "IntegrationConfigOut",
    "IntegrationConfigUpdate",
    "IntegrationConfigCreateResponse",
    "TestConnectionResult",
    "ImportJobOut",
    "SyncRequest",
    "ScheduleCreate",
    "ScheduleOut",
    "ScheduleUpdate",
    "TelegramBindingOut",
    "TelegramBindingStartResponse",
    "GoogleSheetsLinkCreate",
    "GoogleSheetsLinkOut",
    "GoogleSheetsLinkUpdate",
    "WebhookEventOut",
    "Page",
    "Pagination",
    "OperationOut",
    "Problem",
]
