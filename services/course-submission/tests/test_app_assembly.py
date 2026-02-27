"""The combined app mounts both course and submission router sets."""

from __future__ import annotations

from course_submission_service.main import create_app


def test_combined_app_mounts_both_router_sets():
    app = create_app()
    paths = {getattr(r, "path", "") for r in app.routes}

    # Course side
    assert any("/courses" in p for p in paths), "course routes missing"
    assert any("/assignments" in p for p in paths), "assignment routes missing"
    # Submission side
    assert any("/submissions" in p for p in paths), "submission routes missing"
    # Shared health surface
    assert "/healthz" in paths
    assert "/readyz" in paths
