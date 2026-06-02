"""HTTP API routers."""
from fastapi import APIRouter

from . import (
    analyses,
    batch,
    curate,
    health,
    internal_match,
    me_providers,
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
    router.include_router(me_providers.router, tags=["me-providers"])
    router.include_router(operations.router, tags=["operations"])
    router.include_router(internal_match.router, tags=["internal"])
    router.include_router(health.router, tags=["health"])
    return router
