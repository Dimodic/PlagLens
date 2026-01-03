"""HTTP API routers."""
from fastapi import APIRouter

from . import (
    admin_cache,
    admin_prompts,
    admin_providers,
    analyses,
    batch,
    budgets,
    curate,
    health,
    operations,
    reports,
)


def build_router() -> APIRouter:
    """Aggregate router mounted under ``/api/v1``."""
    router = APIRouter()
    router.include_router(analyses.router, tags=["analyses"])
    router.include_router(reports.router, tags=["reports"])
    router.include_router(curate.router, tags=["curate"])
    router.include_router(batch.router, tags=["batch"])
    router.include_router(admin_prompts.router, tags=["admin-prompts"])
    router.include_router(admin_providers.router, tags=["admin-providers"])
    router.include_router(admin_cache.router, tags=["admin-cache"])
    router.include_router(budgets.router, tags=["budgets"])
    router.include_router(operations.router, tags=["operations"])
    router.include_router(health.router, tags=["health"])
    return router
