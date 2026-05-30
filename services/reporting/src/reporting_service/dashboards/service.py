"""DashboardService — single entry point for all dashboard endpoints.

Reads only from read-models; falls back to defaults if the model is empty.
Cache TTLs: 5min for overviews, 1min for details (per 11-REPORTING.md §3).
"""
from __future__ import annotations

from datetime import timedelta
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from ..common.cache import JsonCache
from ..common.time import utcnow
from ..repositories.read_models import ReadModelRepo


class DashboardService:
    def __init__(self, session: AsyncSession, cache: JsonCache, overview_ttl: int = 300, detail_ttl: int = 60):
        self.repo = ReadModelRepo(session)
        self.cache = cache
        self.overview_ttl = overview_ttl
        self.detail_ttl = detail_ttl

    async def _cached(self, key: str, fn, ttl: int) -> tuple[dict[str, Any], bool]:
        hit = await self.cache.get(key)
        if hit is not None:
            return hit, True
        data = await fn()
        await self.cache.set(key, data, ttl)
        return data, False

    # --- Course --------------------------------------------------------

    async def course_overview(self, tenant_id: str, course_id: str) -> dict[str, Any]:
        key = f"{tenant_id}:course:overview:{course_id}"

        async def gen():
            cs = await self.repo.course(course_id)
            if cs is None or cs.tenant_id != tenant_id:
                return {
                    "course_id": course_id,
                    "enrolled_students": 0,
                    "assignments_count": 0,
                    "submissions_total": 0,
                    "average_score": 0.0,
                    "plagiarism_alerts_count": 0,
                    "ai_runs_count": 0,
                    "ai_tokens_used": 0,
                    "last_activity_at": None,
                }
            return {
                "course_id": cs.course_id,
                "enrolled_students": cs.enrolled_students,
                "assignments_count": cs.assignments_count,
                "submissions_total": cs.submissions_total,
                "average_score": round(cs.average_score, 2),
                "plagiarism_alerts_count": cs.plagiarism_alerts_count,
                "ai_runs_count": cs.ai_runs_count,
                "ai_tokens_used": cs.ai_tokens_used,
                "last_activity_at": cs.last_activity_at.isoformat() if cs.last_activity_at else None,
            }

        data, cached = await self._cached(key, gen, self.overview_ttl)
        data["cached"] = cached
        return data

    async def course_grades_distribution(self, tenant_id: str, course_id: str) -> dict[str, Any]:
        async def gen():
            assignments = await self.repo.assignments_for_course(course_id)
            buckets = [
                {"range": "0-49", "count": 0},
                {"range": "50-69", "count": 0},
                {"range": "70-84", "count": 0},
                {"range": "85-100", "count": 0},
            ]
            for a in assignments:
                avg = a.average_score
                if avg < 50:
                    buckets[0]["count"] += a.score_count
                elif avg < 70:
                    buckets[1]["count"] += a.score_count
                elif avg < 85:
                    buckets[2]["count"] += a.score_count
                else:
                    buckets[3]["count"] += a.score_count
            return {"course_id": course_id, "buckets": buckets}

        data, _ = await self._cached(
            f"{tenant_id}:course:grades:{course_id}", gen, self.detail_ttl
        )
        return data

    async def course_grades_by_assignment(self, tenant_id: str, course_id: str) -> dict[str, Any]:
        async def gen():
            assignments = await self.repo.assignments_for_course(course_id)
            return {
                "course_id": course_id,
                "assignments": [
                    {
                        "assignment_id": a.assignment_id,
                        "average": round(a.average_score, 2),
                        "submissions": a.submissions_count,
                        "score_count": a.score_count,
                    }
                    for a in assignments
                ],
            }

        data, _ = await self._cached(
            f"{tenant_id}:course:gradesbya:{course_id}", gen, self.detail_ttl
        )
        return data

    async def course_plagiarism_stats(self, tenant_id: str, course_id: str) -> dict[str, Any]:
        async def gen():
            assignments = await self.repo.assignments_for_course(course_id)
            total_subs = sum(a.submissions_count for a in assignments) or 1
            total_susp = sum(a.suspicious_count for a in assignments)
            max_sim = max((a.max_similarity for a in assignments), default=0.0)
            return {
                "course_id": course_id,
                "suspicious_rate": round(total_susp / total_subs, 3),
                "max_similarity": round(max_sim, 2),
                "runs_total": sum(a.ai_completed_count for a in assignments),
                "runs_over_time": [],
            }

        data, _ = await self._cached(
            f"{tenant_id}:course:plag:{course_id}", gen, self.detail_ttl
        )
        return data

    async def course_ai_usage(self, tenant_id: str, course_id: str) -> dict[str, Any]:
        async def gen():
            cs = await self.repo.course(course_id)
            return {
                "course_id": course_id,
                "runs": cs.ai_runs_count if cs else 0,
                "tokens": cs.ai_tokens_used if cs else 0,
                "cost_usd": 0.0,
                "cache_hits": 0,
                "budget_status": "ok",
            }

        data, _ = await self._cached(
            f"{tenant_id}:course:ai:{course_id}", gen, self.detail_ttl
        )
        return data

    async def course_timeline(self, tenant_id: str, course_id: str) -> dict[str, Any]:
        async def gen():
            cs = await self.repo.course(course_id)
            return {
                "course_id": course_id,
                "weeks": [
                    {
                        "week": (utcnow() - timedelta(days=i * 7)).date().isoformat(),
                        "submissions": cs.submissions_total // 8 if cs else 0,
                    }
                    for i in range(8)
                ],
            }

        data, _ = await self._cached(
            f"{tenant_id}:course:tl:{course_id}", gen, self.detail_ttl
        )
        return data

    async def course_active_students(self, tenant_id: str, course_id: str) -> dict[str, Any]:
        async def gen():
            return {
                "course_id": course_id,
                "students": [],
                "active_count": 0,
            }

        data, _ = await self._cached(
            f"{tenant_id}:course:active:{course_id}", gen, self.detail_ttl
        )
        return data

    async def course_stragglers(self, tenant_id: str, course_id: str) -> dict[str, Any]:
        async def gen():
            return {"course_id": course_id, "stragglers": []}

        data, _ = await self._cached(
            f"{tenant_id}:course:strag:{course_id}", gen, self.detail_ttl
        )
        return data

    async def course_late_submissions(self, tenant_id: str, course_id: str) -> dict[str, Any]:
        async def gen():
            assignments = await self.repo.assignments_for_course(course_id)
            return {
                "course_id": course_id,
                "late_soft": sum(a.late_soft_count for a in assignments),
                "late_hard": sum(a.late_hard_count for a in assignments),
                "on_time": sum(a.on_time_count for a in assignments),
            }

        data, _ = await self._cached(
            f"{tenant_id}:course:late:{course_id}", gen, self.detail_ttl
        )
        return data

    async def course_language_breakdown(self, tenant_id: str, course_id: str) -> dict[str, Any]:
        async def gen():
            return {"course_id": course_id, "languages": []}

        data, _ = await self._cached(
            f"{tenant_id}:course:lang:{course_id}", gen, self.detail_ttl
        )
        return data

    # --- Tenant -------------------------------------------------------

    async def _scalar(self, sql: str, **params: Any) -> int:
        """Run a one-cell aggregate against the shared Postgres and coerce
        to int. Returns 0 on any error (missing grant / schema) so a single
        unreachable source never 500s the whole dashboard."""
        from sqlalchemy import text

        try:
            res = await self.repo.session.execute(text(sql), params)
            return int(res.scalar() or 0)
        except Exception:  # noqa: BLE001 — defensive; see docstring
            return 0

    async def tenant_overview(self, tenant_id: str) -> dict[str, Any]:
        # Live aggregation from the authoritative schemas (course /
        # submission / plagiarism / identity) rather than the Kafka-fed
        # TenantStats read-model. The read-model is only populated by
        # event projections, so anything that arrived via bulk import or
        # direct SQL (the Yandex.Contest path, the migrations) left it at
        # zero — which read as a dead dashboard. All services share one
        # Postgres, so a cross-schema read here is cheap and always
        # reflects reality. Field names mirror what the SPA reads.
        async def gen():
            active_courses = await self._scalar(
                "SELECT count(*) FROM course.courses "
                "WHERE tenant_id = :t AND deleted_at IS NULL "
                "AND status <> 'archived'",
                t=tenant_id,
            )
            submissions_total = await self._scalar(
                "SELECT count(*) FROM submission.submissions "
                "WHERE tenant_id = :t AND deleted_at IS NULL",
                t=tenant_id,
            )
            plagiarism_runs_total = await self._scalar(
                "SELECT count(*) FROM plagiarism.plagiarism_runs "
                "WHERE tenant_id = :t",
                t=tenant_id,
            )
            dau = await self._scalar(
                "SELECT count(*) FROM identity.users "
                "WHERE tenant_id = :t AND deleted_at IS NULL "
                "AND last_login_at >= now() - interval '1 day'",
                t=tenant_id,
            )
            mau = await self._scalar(
                "SELECT count(*) FROM identity.users "
                "WHERE tenant_id = :t AND deleted_at IS NULL "
                "AND last_login_at >= now() - interval '30 days'",
                t=tenant_id,
            )
            storage = await self._scalar(
                "SELECT coalesce(sum(total_size_bytes), 0) "
                "FROM submission.submissions "
                "WHERE tenant_id = :t AND deleted_at IS NULL",
                t=tenant_id,
            )
            return {
                "tenant_id": tenant_id,
                "active_courses": active_courses,
                "submissions_total": submissions_total,
                "plagiarism_runs_total": plagiarism_runs_total,
                "active_users_dau": dau,
                "active_users_mau": mau,
                "storage_used_bytes": storage,
            }

        data, cached = await self._cached(f"{tenant_id}:tenant:overview", gen, self.overview_ttl)
        data["cached"] = cached
        return data

    async def tenant_active_courses(self, tenant_id: str) -> dict[str, Any]:
        async def gen():
            courses = await self.repo.courses_for_tenant(tenant_id)
            return {
                "tenant_id": tenant_id,
                "courses": [
                    {
                        "course_id": c.course_id,
                        "submissions": c.submissions_total,
                        "average_score": round(c.average_score, 2),
                        "archived": c.archived,
                    }
                    for c in courses
                ],
                "count": len(courses),
            }

        data, _ = await self._cached(
            f"{tenant_id}:tenant:active-courses", gen, self.detail_ttl
        )
        return data

    async def tenant_active_users(self, tenant_id: str) -> dict[str, Any]:
        async def gen():
            dau = await self._scalar(
                "SELECT count(*) FROM identity.users "
                "WHERE tenant_id = :t AND deleted_at IS NULL "
                "AND last_login_at >= now() - interval '1 day'",
                t=tenant_id,
            )
            mau = await self._scalar(
                "SELECT count(*) FROM identity.users "
                "WHERE tenant_id = :t AND deleted_at IS NULL "
                "AND last_login_at >= now() - interval '30 days'",
                t=tenant_id,
            )
            total = await self._scalar(
                "SELECT count(*) FROM identity.users "
                "WHERE tenant_id = :t AND deleted_at IS NULL",
                t=tenant_id,
            )
            return {
                "tenant_id": tenant_id,
                "active_users": total,
                "dau": dau,
                "mau": mau,
            }

        data, _ = await self._cached(
            f"{tenant_id}:tenant:active-users", gen, self.detail_ttl
        )
        return data

    async def tenant_integrations_health(self, tenant_id: str) -> dict[str, Any]:
        # Live from integration.integration_configs. Maps the config
        # ``status`` enum to the dashboard's health tone vocabulary.
        async def gen():
            from sqlalchemy import text

            _STATUS_MAP = {
                "active": "healthy",
                "pending_auth": "degraded",
                "disabled": "degraded",
                "error": "down",
                "failed": "down",
            }
            try:
                # One row per integration *kind* — the latest config's
                # status. A tenant can accumulate several configs of the
                # same kind (re-auth, tests); a health table wants the
                # current state per integration, not every historical row.
                rows = (
                    await self.repo.session.execute(
                        text(
                            "SELECT DISTINCT ON (kind) "
                            "coalesce(display_name, kind) AS name, "
                            "kind, status, updated_at "
                            "FROM integration.integration_configs "
                            "WHERE tenant_id = :t "
                            "ORDER BY kind, updated_at DESC"
                        ),
                        {"t": tenant_id},
                    )
                ).mappings().all()
            except Exception:  # noqa: BLE001
                rows = []
            items = [
                {
                    "integration": r["name"] or r["kind"],
                    "status": _STATUS_MAP.get(str(r["status"]), "degraded"),
                    "last_check_at": (
                        r["updated_at"].isoformat() if r["updated_at"] else None
                    ),
                }
                for r in rows
            ]
            return {"tenant_id": tenant_id, "integrations": items}

        data, _ = await self._cached(
            f"{tenant_id}:tenant:integ-health", gen, self.detail_ttl
        )
        return data

    async def tenant_ai_usage(self, tenant_id: str) -> dict[str, Any]:
        async def gen():
            t = await self.repo.tenant(tenant_id)
            return {
                "tenant_id": tenant_id,
                "tokens": t.ai_tokens_total_30d if t else 0,
                "cost_usd": round(t.ai_cost_total_30d, 4) if t else 0.0,
                "budget_status": "ok",
            }

        data, _ = await self._cached(
            f"{tenant_id}:tenant:ai", gen, self.detail_ttl
        )
        return data

    async def tenant_storage_usage(self, tenant_id: str) -> dict[str, Any]:
        async def gen():
            total = await self._scalar(
                "SELECT coalesce(sum(total_size_bytes), 0) "
                "FROM submission.submissions "
                "WHERE tenant_id = :t AND deleted_at IS NULL",
                t=tenant_id,
            )
            return {"tenant_id": tenant_id, "courses": [], "total_bytes": total}

        data, _ = await self._cached(
            f"{tenant_id}:tenant:storage", gen, self.detail_ttl
        )
        return data

    # --- Global -------------------------------------------------------

    async def global_overview(self) -> dict[str, Any]:
        async def gen():
            from sqlalchemy import select

            from ..models.reporting import TenantStats

            stmt = select(TenantStats)
            tenants = list((await self.repo.session.execute(stmt)).scalars().all())
            return {
                "tenants": len(tenants),
                "active_users": sum(t.active_users for t in tenants),
                "submissions_30d": sum(t.submissions_30d for t in tenants),
                "plagiarism_runs_30d": sum(t.plagiarism_runs_30d for t in tenants),
                "ai_tokens_total_30d": sum(t.ai_tokens_total_30d for t in tenants),
            }

        data, _ = await self._cached("global:overview", gen, self.overview_ttl)
        return data

    async def system_health(self) -> dict[str, Any]:
        async def gen():
            healths = await self.repo.health()
            return {
                "services": [
                    {"name": h.name, "lag_seconds": h.lag_seconds}
                    for h in healths
                ]
            }

        data, _ = await self._cached("global:sys-health", gen, self.detail_ttl)
        return data

    async def operations_overview(self) -> dict[str, Any]:
        async def gen():
            from sqlalchemy import func, select

            from ..models.reporting import ExportJob

            stmt = select(ExportJob.status, func.count()).group_by(ExportJob.status)
            results = list((await self.repo.session.execute(stmt)).all())
            return {"exports_by_status": {r[0]: r[1] for r in results}}

        data, _ = await self._cached("global:ops", gen, self.detail_ttl)
        return data

    async def errors_overview(self) -> dict[str, Any]:
        async def gen():
            from sqlalchemy import select

            from ..models.reporting import ExportJob

            stmt = select(ExportJob).where(ExportJob.status == "failed").limit(50)
            failed = list((await self.repo.session.execute(stmt)).scalars().all())
            return {
                "errors": [
                    {"export_id": j.id, "kind": j.kind, "error": j.error}
                    for j in failed
                ]
            }

        data, _ = await self._cached("global:errors", gen, self.detail_ttl)
        return data

    # --- Student self -----------------------------------------------

    async def student_overview(self, tenant_id: str, user_id: str) -> dict[str, Any]:
        async def gen():
            entries = await self.repo.courses_for_user(user_id)
            scores = [e.average_score for e in entries if e.score_count]
            return {
                "user_id": user_id,
                "courses": [
                    {
                        "course_id": e.course_id,
                        "average_score": round(e.average_score, 2),
                        "submissions": e.submissions_total,
                    }
                    for e in entries
                ],
                "average_score": round(sum(scores) / len(scores), 2) if scores else 0.0,
                "upcoming_deadlines": [],
            }

        data, _ = await self._cached(
            f"{tenant_id}:user:{user_id}:overview", gen, self.detail_ttl
        )
        return data

    async def student_grades_summary(self, tenant_id: str, user_id: str, course_id: str) -> dict[str, Any]:
        async def gen():
            ug = await self.repo.user_grades(user_id, course_id)
            if ug is None:
                return {
                    "user_id": user_id,
                    "course_id": course_id,
                    "assignments_total": 0,
                    "submissions_total": 0,
                    "average_score": 0.0,
                    "on_time_rate": 0.0,
                    "suspicious_count": 0,
                }
            on_time_rate = (ug.on_time_count / ug.on_time_total) if ug.on_time_total else 0.0
            return {
                "user_id": user_id,
                "course_id": course_id,
                "assignments_total": ug.assignments_total,
                "submissions_total": ug.submissions_total,
                "average_score": round(ug.average_score, 2),
                "on_time_rate": round(on_time_rate, 3),
                "suspicious_count": ug.suspicious_count,
            }

        data, _ = await self._cached(
            f"{tenant_id}:user:{user_id}:grades:{course_id}", gen, self.detail_ttl
        )
        return data

    async def student_progress(self, tenant_id: str, user_id: str) -> dict[str, Any]:
        async def gen():
            entries = await self.repo.courses_for_user(user_id)
            return {
                "user_id": user_id,
                "courses": len(entries),
                "submissions": sum(e.submissions_total for e in entries),
                "average_score": (
                    round(sum(e.average_score for e in entries) / len(entries), 2)
                    if entries
                    else 0.0
                ),
            }

        data, _ = await self._cached(
            f"{tenant_id}:user:{user_id}:progress", gen, self.detail_ttl
        )
        return data
