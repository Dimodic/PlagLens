"""Section E: notification templates (admin)."""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from notification_service.db import get_db
from notification_service.errors import Problem
from notification_service.ids import template_id
from notification_service.models import NotificationTemplate
from notification_service.pagination import decode_cursor, encode_cursor
from notification_service.schemas import (
    Page,
    Pagination,
    TemplateIn,
    TemplateOut,
    TemplatePatch,
    TemplatePreviewBody,
    TemplatePreviewOut,
)
from notification_service.security import Principal, require_admin
from notification_service.templates_engine import render_string

router = APIRouter(tags=["admin-templates"])


def _to_out(t: NotificationTemplate) -> TemplateOut:
    return TemplateOut.model_validate(t)


@router.get("/admin/notifications/templates", response_model=Page)
async def list_templates(
    event_type: str | None = Query(default=None),
    locale: str | None = Query(default=None),
    channel: str | None = Query(default=None),
    cursor: str | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=200),
    _: Principal = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> Any:
    stmt = select(NotificationTemplate)
    if event_type:
        stmt = stmt.where(NotificationTemplate.event_type == event_type)
    if locale:
        stmt = stmt.where(NotificationTemplate.locale == locale)
    if channel:
        stmt = stmt.where(NotificationTemplate.channel == channel)
    cur = decode_cursor(cursor)
    if cur:
        stmt = stmt.where(NotificationTemplate.id > cur.get("id", ""))
    stmt = stmt.order_by(NotificationTemplate.id.asc()).limit(limit + 1)
    res = await db.execute(stmt)
    rows = list(res.scalars().all())
    has_more = len(rows) > limit
    page_rows = rows[:limit]
    next_cursor = (
        encode_cursor(page_rows[-1].id, page_rows[-1].id) if has_more and page_rows else None
    )
    return {
        "data": [_to_out(t).model_dump() for t in page_rows],
        "pagination": Pagination(next_cursor=next_cursor, has_more=has_more, limit=limit).model_dump(),
    }


@router.get("/admin/notifications/templates/{tid}", response_model=TemplateOut)
async def get_template(
    tid: str,
    _: Principal = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> TemplateOut:
    t = await db.get(NotificationTemplate, tid)
    if t is None:
        raise Problem(404, "NOT_FOUND", "Template not found")
    return _to_out(t)


@router.post("/admin/notifications/templates", response_model=TemplateOut, status_code=201)
async def create_template(
    body: TemplateIn,
    _: Principal = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> TemplateOut:
    t = NotificationTemplate(
        id=template_id(),
        event_type=body.event_type,
        locale=body.locale,
        channel=body.channel,
        subject_template=body.subject_template,
        body_template=body.body_template,
        active=body.active,
        version=body.version,
    )
    db.add(t)
    await db.flush()
    return _to_out(t)


@router.patch("/admin/notifications/templates/{tid}", response_model=TemplateOut)
async def patch_template(
    tid: str,
    body: TemplatePatch,
    _: Principal = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> TemplateOut:
    t = await db.get(NotificationTemplate, tid)
    if t is None:
        raise Problem(404, "NOT_FOUND", "Template not found")
    if body.subject_template is not None:
        t.subject_template = body.subject_template
    if body.body_template is not None:
        t.body_template = body.body_template
    if body.active is not None:
        t.active = body.active
    if body.version is not None:
        t.version = body.version
    return _to_out(t)


@router.post("/admin/notifications/templates/{tid}:activate", response_model=TemplateOut)
async def activate_template(
    tid: str,
    _: Principal = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> TemplateOut:
    t = await db.get(NotificationTemplate, tid)
    if t is None:
        raise Problem(404, "NOT_FOUND", "Template not found")
    # deactivate previous versions of same (event_type, locale, channel)
    stmt = select(NotificationTemplate).where(
        NotificationTemplate.event_type == t.event_type,
        NotificationTemplate.locale == t.locale,
        NotificationTemplate.channel == t.channel,
        NotificationTemplate.id != t.id,
    )
    res = await db.execute(stmt)
    for other in res.scalars().all():
        other.active = False
    t.active = True
    return _to_out(t)


@router.post(
    "/admin/notifications/templates/{tid}:preview", response_model=TemplatePreviewOut
)
async def preview_template(
    tid: str,
    body: TemplatePreviewBody,
    _: Principal = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> TemplatePreviewOut:
    t = await db.get(NotificationTemplate, tid)
    if t is None:
        raise Problem(404, "NOT_FOUND", "Template not found")
    subject = render_string(t.subject_template, body.data)
    rendered = render_string(t.body_template, body.data)
    return TemplatePreviewOut(subject=subject, body=rendered)


# Mark unused-import to satisfy ruff but keep symmetric with other modules
_ = datetime  # noqa: F841
_ = timezone  # noqa: F841
