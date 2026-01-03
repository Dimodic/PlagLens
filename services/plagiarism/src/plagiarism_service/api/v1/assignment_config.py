"""§G — per-assignment plagiarism config (in-memory placeholder).

Real config lives in the Course service; we store a local cache in Redis-like
in-memory dict so the endpoints behave correctly within tests. Persistence is
out-of-scope for this micro-service slice (the Course service owns the truth).
"""
from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, Query

from ...common.rbac import Principal, assert_course_role
from ...schemas.runs import PlagiarismConfig, PlagiarismConfigUpdate
from ..deps import get_principal_dep

router = APIRouter(tags=["assignment-config"])

_CONFIG_CACHE: dict[tuple[str, str], dict[str, Any]] = {}


def _key(tenant_id: str, assignment_id: str) -> tuple[str, str]:
    return (tenant_id, assignment_id)


@router.get(
    "/assignments/{assignment_id}/plagiarism-config",
    response_model=PlagiarismConfig,
)
async def get_assignment_config(
    assignment_id: str,
    course_id: str | None = Query(default=None),
    principal: Principal = Depends(get_principal_dep),
) -> PlagiarismConfig:
    assert_course_role(principal, course_id, ("owner", "co_owner", "assistant"))
    cfg = _CONFIG_CACHE.get(_key(principal.tenant_id, assignment_id), {})
    return PlagiarismConfig(
        assignment_id=assignment_id,
        provider=cfg.get("provider"),
        threshold=float(cfg.get("threshold", 0.6)),
        auto_run=bool(cfg.get("auto_run", False)),
        with_corpus=bool(cfg.get("with_corpus", False)),
        languages_filter=list(cfg.get("languages_filter", [])),
        options=dict(cfg.get("options", {})),
    )


@router.patch(
    "/assignments/{assignment_id}/plagiarism-config", response_model=PlagiarismConfig
)
async def update_assignment_config(
    assignment_id: str,
    body: PlagiarismConfigUpdate,
    course_id: str | None = Query(default=None),
    principal: Principal = Depends(get_principal_dep),
) -> PlagiarismConfig:
    assert_course_role(principal, course_id, ("owner", "co_owner"))
    cur = dict(_CONFIG_CACHE.get(_key(principal.tenant_id, assignment_id), {}))
    if body.provider is not None:
        cur["provider"] = body.provider
    if body.threshold is not None:
        cur["threshold"] = body.threshold
    if body.auto_run is not None:
        cur["auto_run"] = body.auto_run
    if body.with_corpus is not None:
        cur["with_corpus"] = body.with_corpus
    if body.languages_filter is not None:
        cur["languages_filter"] = body.languages_filter
    if body.options is not None:
        cur["options"] = body.options
    _CONFIG_CACHE[_key(principal.tenant_id, assignment_id)] = cur
    return PlagiarismConfig(
        assignment_id=assignment_id,
        provider=cur.get("provider"),
        threshold=float(cur.get("threshold", 0.6)),
        auto_run=bool(cur.get("auto_run", False)),
        with_corpus=bool(cur.get("with_corpus", False)),
        languages_filter=list(cur.get("languages_filter", [])),
        options=dict(cur.get("options", {})),
    )
