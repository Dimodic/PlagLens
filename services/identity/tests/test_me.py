"""Self-service ``/users/me`` session endpoints."""
from __future__ import annotations

import pytest


@pytest.mark.asyncio
async def test_revoke_all_my_sessions_emits_event(client, app, auth_admin):
    # Self-service "log out everywhere" must be auditable, like logout: it
    # publishes identity.session.revoked.v1 (which Audit consumes by pattern).
    r = await client.post("/api/v1/users/me/sessions:revokeAll", headers=auth_admin)
    assert r.status_code == 204, r.text

    revoked = [
        (topic, ev)
        for topic, ev in app.state.producer.events
        if ev.type == "identity.session.revoked.v1"
    ]
    assert revoked, "expected an identity.session.revoked.v1 event"
    topic, ev = revoked[0]
    assert topic == "plaglens.identity.user.v1"
    assert ev.data["scope"] == "all"
