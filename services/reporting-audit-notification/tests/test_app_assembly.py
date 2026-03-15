"""The merged app mounts all three services' routers behind one app + one
shared health surface, with no route collisions."""

from __future__ import annotations

from collections import Counter

from reporting_audit_notification_service.main import create_app


def _routes(app):
    return sorted({r.path for r in app.routes})


def test_one_shared_health_surface():
    app = create_app()
    paths = _routes(app)
    assert "/healthz" in paths
    assert "/readyz" in paths
    # No per-service health duplicates leaked in (each service's own health
    # router was intentionally dropped in favour of the shared one).
    assert "/api/v1/healthz" not in paths


def test_all_three_router_sets_mounted():
    app = create_app()
    paths = _routes(app)
    # reporting
    assert any("/exports" in p for p in paths)
    assert any("/dashboard" in p for p in paths)
    # audit
    assert any(p.startswith("/api/v1/audit") for p in paths)
    # notification
    assert any("/notifications" in p for p in paths)


def test_no_route_method_collisions():
    app = create_app()
    pm: Counter = Counter()
    for r in app.routes:
        for m in getattr(r, "methods", None) or []:
            pm[(r.path, m)] += 1
    dups = {k: v for k, v in pm.items() if v > 1}
    assert not dups, f"duplicate routes: {dups}"
