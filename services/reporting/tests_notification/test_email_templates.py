"""Render the bundled file-based Jinja templates and check XSS escaping."""
from __future__ import annotations

import pytest

from notification_service.db import session_scope
from notification_service.templates_engine import render

EVENTS = [
    "submission.grade.assigned",
    "plagiarism.run.completed",
    "ai.analysis.completed",
    "course.member.added",
    "auth.email.verify",
]


@pytest.mark.asyncio
@pytest.mark.parametrize("event_type", EVENTS)
@pytest.mark.parametrize("locale", ["ru", "en"])
async def test_email_template_renders(event_type, locale):
    data = {
        "course_name": "Алгоритмы",
        "assignment_title": "Лабораторная #1",
        "score": 85,
        "max_score": 100,
        "similarity_score": 42,
        "suspicious_pairs": 3,
        "model": "gpt-4o-mini",
        "tokens_used": 1234,
        "user_name": "Bob",
        "verify_url": "https://plaglens.local/verify/abc123",
        "expires_in_hours": 24,
        "role": "student",
        "action_url": "https://plaglens.local/x",
    }
    if event_type == "auth.email.verify":
        # No inapp variant for auth flow — verify only the email channel.
        channels = ["email"]
    else:
        channels = ["email", "inapp"]
    async with session_scope() as session:
        for channel in channels:
            subject, body = await render(
                session,
                event_type=event_type,
                channel=channel,
                locale=locale,
                data=data,
            )
            assert subject, f"empty subject {event_type}/{channel}/{locale}"
            assert body, f"empty body {event_type}/{channel}/{locale}"


@pytest.mark.asyncio
async def test_email_template_xss_is_escaped():
    """Make sure the html rendering autoescapes user-supplied data."""
    payload = {
        "course_name": '<script>alert("xss")</script>',
        "assignment_title": "<img src=x onerror=alert(1)>",
    }
    async with session_scope() as session:
        subject, html = await render(
            session,
            event_type="course.member.added",
            channel="email",
            locale="ru",
            data=payload,
        )
    # Original tags must NOT survive verbatim.
    assert "<script>" not in html
    assert "onerror=alert" not in html
    # Escape entities should appear instead.
    assert "&lt;script&gt;" in html or "&lt;img" in html


@pytest.mark.asyncio
async def test_unknown_event_falls_back_to_default_subject():
    async with session_scope() as session:
        subject, body = await render(
            session,
            event_type="totally.unknown.event.v1",
            channel="email",
            locale="ru",
            data={},
        )
    assert subject  # default placeholder
    assert body
