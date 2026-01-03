"""FastAPI routers for the Course Service.

All routers are mounted under ``/api/v1`` (except health endpoints, which the
spec carries at the root). Routers are split per resource family:

- :mod:`courses`        — A. Courses + B. Owners + course-level dashboard.
- :mod:`members`        — C. Members + D. Invitations.
- :mod:`groups`         — E. Groups + group members.
- :mod:`assignments`    — F. Assignments + G. Deadlines + H. Grading + I. Stats.
- :mod:`discovery`      — J. Course discovery (``/users/me/...``).
- :mod:`health`         — K. Health (``/healthz``, ``/readyz``, ``/metrics``,
  ``/v1/version``).
"""
