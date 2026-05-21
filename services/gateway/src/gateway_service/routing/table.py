"""Static routing table — path prefix -> backend service name.

The table is *ordered*: more-specific prefixes MUST come before less-specific
ones (e.g. `/api/v1/courses/{id}/submissions` before `/api/v1/courses`).

Endpoint classes drive rate-limit policies (auth_sensitive / write / run).
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class Route:
    prefix: str
    backend: str
    # endpoint class for rate-limit policy (default | auth_sensitive | write | run)
    endpoint_class: str = "default"


# Order matters: longer/more-specific prefixes first.
ROUTING_TABLE: tuple[Route, ...] = (
    # Course-scoped sub-resources hosted by reporting / plagiarism / submission
    # MUST come before the generic /api/v1/courses → course rule, otherwise
    # the course service receives requests it cannot handle and 404s.
    Route("/api/v1/courses/{id}/submissions", "submission", "default"),
    Route("/api/v1/courses/{id}/dashboard", "reporting", "default"),
    Route("/api/v1/courses/{id}/recent-activity", "reporting", "default"),
    Route("/api/v1/courses/{id}/scheduled-exports", "reporting", "default"),
    Route("/api/v1/courses/{id}/google-sheets-link", "reporting", "default"),
    Route("/api/v1/courses/{id}/exports", "reporting", "run"),
    Route("/api/v1/courses/{id}/suspicious-submissions", "plagiarism", "default"),
    Route("/api/v1/courses/{id}/ai", "ai-analysis", "default"),
    # Auth & sensitive identity flows
    Route("/api/v1/auth/login", "identity", "auth_sensitive"),
    Route("/api/v1/auth/register", "identity", "auth_sensitive"),
    Route("/api/v1/auth/refresh", "identity", "auth_sensitive"),
    Route("/api/v1/auth/service-token", "identity", "auth_sensitive"),
    Route("/api/v1/auth/password", "identity", "auth_sensitive"),
    Route("/api/v1/auth", "identity", "default"),
    # Self-service submission/assignment endpoints live in submission/course
    # services even though the path starts with /users.
    Route("/api/v1/users/me/submissions", "submission", "default"),
    Route("/api/v1/users/me/assignments/{id}/submissions", "submission", "default"),
    # Self-service course/assignment discovery is hosted by course service.
    Route("/api/v1/users/me/courses", "course", "default"),
    Route("/api/v1/users/me/assignments", "course", "default"),
    # Self-service dashboard / activity proxy live in reporting service.
    Route("/api/v1/users/me/dashboard", "reporting", "default"),
    Route("/api/v1/users/me/recent-activity", "reporting", "default"),
    Route("/api/v1/users/me/progress", "reporting", "default"),
    # Notification preferences (self-service) live in notification service.
    Route("/api/v1/users/me/notification-preferences", "notification", "default"),
    Route("/api/v1/users/me/notifications", "notification", "default"),
    Route("/api/v1/users/me/web-push", "notification", "default"),
    Route("/api/v1/users", "identity", "default"),
    # Tenant-scoped admin dashboards live in reporting; AI budgets/usage in
    # ai-analysis. Both are mounted under /api/v1/tenants/{id}/... .
    Route("/api/v1/tenants/{id}/dashboard", "reporting", "default"),
    Route("/api/v1/tenants/{id}/ai", "ai-analysis", "default"),
    Route("/api/v1/tenants", "identity", "default"),
    Route("/api/v1/roles", "identity", "default"),
    Route("/api/v1/permissions", "identity", "default"),
    Route("/api/v1/invitations", "identity", "default"),
    Route("/api/v1/.well-known", "identity", "default"),
    # Homework — Course → Homework → Assignment hierarchy.
    # Sub-resources first, then generic, then course-scoped collection.
    Route("/api/v1/homeworks/{id}/assignments", "course", "default"),
    Route("/api/v1/homeworks", "course", "default"),
    Route("/api/v1/courses/{id}/homeworks", "course", "default"),
    # Course
    Route("/api/v1/courses", "course", "default"),
    # Assignments-scoped sub-resources go to submission/plagiarism/ai BEFORE generic /assignments
    Route("/api/v1/assignments/{id}/submissions", "submission", "default"),
    # Grades + the aggregate-stats rollup are owned by submission_service
    # (it holds the submission + grade tables). Without these explicit
    # routes they fall through to the generic /assignments → course rule
    # and 404, so the submissions-list grade chip and the Stats tab read
    # as empty.
    Route("/api/v1/assignments/{id}/grades", "submission", "default"),
    Route("/api/v1/assignments/{id}/aggregate-stats", "submission", "default"),
    Route("/api/v1/assignments/{id}/plagiarism-runs", "plagiarism", "run"),
    Route("/api/v1/assignments/{id}/ai-analyses", "ai-analysis", "run"),
    Route("/api/v1/assignments/{id}/exports", "reporting", "run"),
    Route("/api/v1/assignments", "course", "default"),
    # Submission — sub-resources hosted by ai-analysis / plagiarism must
    # come before the generic /submissions rule, otherwise the submission
    # service receives requests it cannot handle and 404s.
    Route("/api/v1/submissions/{id}/ai-analyses", "ai-analysis", "run"),
    Route("/api/v1/submissions/{id}/suspicious-flags", "plagiarism", "default"),
    # Collection-level ``:action`` endpoints (no /{id} segment) need an
    # explicit rule — the generic /api/v1/submissions prefix only matches
    # ``/submissions`` or ``/submissions/...``, not ``/submissions:foo``.
    Route("/api/v1/submissions:distribute", "submission", "default"),
    Route("/api/v1/submissions", "submission", "default"),
    # Integration
    Route("/api/v1/integrations", "integration", "default"),
    Route("/api/v1/webhooks", "integration", "default"),
    # Plagiarism
    Route("/api/v1/plagiarism-runs", "plagiarism", "run"),
    Route("/api/v1/plagiarism-corpus", "plagiarism", "default"),
    # AI Analysis
    Route("/api/v1/ai-analyses", "ai-analysis", "run"),
    # Notification
    Route("/api/v1/notifications", "notification", "default"),
    # Reporting
    Route("/api/v1/exports", "reporting", "run"),
    Route("/api/v1/scheduled-exports", "reporting", "default"),
    # Interactive Google Sheets picker — fetches a spreadsheet's contents
    # so the export page can render its tabs and let the teacher
    # drag-select a destination region.
    Route("/api/v1/sheets", "reporting", "default"),
    # Audit
    Route("/api/v1/audit", "audit", "default"),
    # Per-resource audit shortcuts live in the Audit service. These are more
    # specific than the /api/v1/users → identity and /api/v1/courses → course
    # prefixes, so longest-prefix matching routes just the `/audit` suffix here.
    Route("/api/v1/users/{id}/audit", "audit", "default"),
    Route("/api/v1/courses/{id}/audit", "audit", "default"),
    # Admin (delegated by sub-path) — fall-through to identity by default
    Route("/api/v1/admin/users", "identity", "default"),
    Route("/api/v1/admin/tenants", "identity", "default"),
    Route("/api/v1/admin/templates", "notification", "default"),
    # Notification admin: templates / dlq / deliveries / email-config /
    # telegram-config / web-push live in notification service.
    Route("/api/v1/admin/notifications", "notification", "default"),
    Route("/api/v1/admin/reporting", "reporting", "default"),
    Route("/api/v1/admin/dashboard", "reporting", "default"),
    Route("/api/v1/admin/plagiarism", "plagiarism", "default"),
    Route("/api/v1/admin/ai-analysis", "ai-analysis", "default"),
    Route("/api/v1/admin/ai", "ai-analysis", "default"),
    # Both singular and plural admin/integration(s) routes go to integration.
    Route("/api/v1/admin/integration", "integration", "default"),
    Route("/api/v1/admin/integrations", "integration", "default"),
    Route("/api/v1/admin/audit", "audit", "default"),
)


def _prefix_matches(path: str, prefix: str) -> bool:
    """Match a request path against a route prefix.

    Templated segments (e.g. `{id}`) match a single non-empty path segment
    that does not contain `/`.
    """
    if "{" not in prefix:
        return (
            path == prefix
            or path.startswith(prefix + "/")
            or path.startswith(prefix + "?")
            # Google-style action suffix (e.g. ``/invitations:redeem``,
            # ``/invitations:accept``). Matches the prefix's last segment.
            or path.startswith(prefix + ":")
        )
    p_parts = prefix.strip("/").split("/")
    a_parts = path.strip("/").split("/")
    if len(a_parts) < len(p_parts):
        return False
    for pp, ap in zip(p_parts, a_parts, strict=False):
        if pp.startswith("{") and pp.endswith("}"):
            if not ap or "/" in ap:
                return False
            continue
        if pp != ap:
            return False
    return True


def match(path: str) -> Route | None:
    """Find the best (most specific) route for a given URL path."""
    best: Route | None = None
    best_len = -1
    for r in ROUTING_TABLE:
        if _prefix_matches(path, r.prefix):
            score = len(r.prefix)
            if score > best_len:
                best = r
                best_len = score
    return best


__all__ = ["Route", "ROUTING_TABLE", "match"]
