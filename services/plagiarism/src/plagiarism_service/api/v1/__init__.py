"""v1 routers (mounted under ``/api/v1``)."""
from fastapi import APIRouter

from .assignment_config import router as assignment_config_router
from .corpus import router as corpus_router
from .health import router as health_router
from .provider_admin import router as provider_admin_router
from .reports import router as reports_router
from .runs import router as runs_router
from .submission_view import router as submission_view_router
from .suspicious import router as suspicious_router
from .webhooks import router as webhooks_router

api_router = APIRouter(prefix="/api/v1")
api_router.include_router(runs_router)
api_router.include_router(reports_router)
api_router.include_router(submission_view_router)
api_router.include_router(corpus_router)
api_router.include_router(suspicious_router)
api_router.include_router(provider_admin_router)
api_router.include_router(assignment_config_router)
api_router.include_router(webhooks_router)

__all__ = ["api_router", "health_router"]
