"""v1 routers."""
from fastapi import APIRouter

from integration_service.api.v1 import (
    admin,
    configs,
    cursor,
    google_sheets,
    health,
    manual,
    oauth,
    schedules,
    stepik,
    sync,
    telegram,
    webhooks,
    yandex_contest,
)


def build_router() -> APIRouter:
    api = APIRouter()
    api.include_router(configs.router)
    api.include_router(oauth.router)
    api.include_router(stepik.router)
    api.include_router(yandex_contest.router)
    api.include_router(manual.router)
    api.include_router(sync.router)
    api.include_router(schedules.router)
    api.include_router(telegram.router)
    api.include_router(google_sheets.router)
    api.include_router(webhooks.router)
    api.include_router(cursor.router)
    api.include_router(admin.router)
    api.include_router(health.router)
    return api
