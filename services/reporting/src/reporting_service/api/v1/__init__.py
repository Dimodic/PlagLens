"""v1 routers."""
from fastapi import APIRouter

from . import (
    audit_proxy,
    dashboards_course,
    dashboards_global,
    dashboards_self,
    dashboards_tenant,
    exports,
    google_sheets,
    health,
    operations,
    read_models,
    scheduled,
)


def build_v1_router() -> APIRouter:
    r = APIRouter(prefix="/api/v1")
    r.include_router(exports.router)
    r.include_router(operations.router)
    r.include_router(google_sheets.router)
    r.include_router(scheduled.router)
    r.include_router(dashboards_course.router)
    r.include_router(dashboards_tenant.router)
    r.include_router(dashboards_global.router)
    r.include_router(dashboards_self.router)
    r.include_router(read_models.router)
    r.include_router(audit_proxy.router)
    r.include_router(health.router)
    return r
