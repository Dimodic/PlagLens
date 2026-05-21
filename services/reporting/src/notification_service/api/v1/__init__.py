"""v1 API routers."""
from fastapi import APIRouter

from notification_service.api.v1 import (
    admin_email,
    admin_observability,
    admin_telegram,
    admin_templates,
    digest,
    internal_email,
    notifications,
    preferences,
    stream,
    test_endpoints,
    web_push,
)

router = APIRouter(prefix="/api/v1")
# Stream router MUST be included before notifications, so /notifications/stream
# matches the SSE endpoint and not /notifications/{notif_id}.
router.include_router(stream.router)
router.include_router(notifications.router)
router.include_router(preferences.router)
router.include_router(test_endpoints.router)
router.include_router(admin_templates.router)
router.include_router(admin_email.router)
router.include_router(admin_telegram.router)
router.include_router(admin_observability.router)
router.include_router(digest.router)
router.include_router(web_push.router)
router.include_router(internal_email.router)
