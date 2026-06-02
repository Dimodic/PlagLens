"""Telegram account-linking lifecycle (moved here from integration-service).

Exercises the verification-token flow now hosted by identity:
``start`` → ``confirm`` (service/admin) → state read → unlink.
"""
from __future__ import annotations

import pytest_asyncio

from identity_service.common.security import hash_password, issue_access_token
from identity_service.models import User


def _auth(user_id: str, tenant_id: str, role: str = "student") -> dict[str, str]:
    token = issue_access_token(user_id=user_id, tenant_id=tenant_id, global_role=role)
    return {"Authorization": f"Bearer {token}"}


@pytest_asyncio.fixture(scope="function")
async def seed_student(session_factory, seed_tenant) -> User:
    async with session_factory() as s:
        u = User(
            id="usr_student",
            tenant_id=seed_tenant.id,
            email="student@hse.ru",
            password_hash=hash_password("p4ssword!"),
            display_name="Student",
            global_role="student",
        )
        s.add(u)
        await s.commit()
        await s.refresh(u)
        return u


async def test_binding_lifecycle(client, seed_student):
    headers = _auth(seed_student.id, seed_student.tenant_id, "student")

    r = await client.post("/api/v1/users/me/telegram-binding:start", headers=headers)
    assert r.status_code == 200
    token = r.json()["verification_token"]
    assert token

    me = await client.get("/api/v1/users/me/telegram-binding", headers=headers)
    assert me.status_code == 200
    assert me.json()["bound"] is False

    # confirm is service-to-service (admin / service JWT).
    confirm = await client.post(
        "/api/v1/users/me/telegram-binding:confirm",
        json={"verification_token": token, "chat_id": 555, "username": "alice"},
        headers=_auth("svc_bot", seed_student.tenant_id, "admin"),
    )
    assert confirm.status_code == 200
    assert confirm.json()["ok"] is True
    assert confirm.json()["user_id"] == seed_student.id

    me2 = await client.get("/api/v1/users/me/telegram-binding", headers=headers)
    assert me2.json()["bound"] is True
    assert me2.json()["chat_id"] == 555
    assert me2.json()["username"] == "alice"

    rm = await client.delete("/api/v1/users/me/telegram-binding", headers=headers)
    assert rm.status_code == 204

    me3 = await client.get("/api/v1/users/me/telegram-binding", headers=headers)
    assert me3.json()["bound"] is False


async def test_confirm_requires_admin(client, seed_student):
    """A non-admin token must not be able to confirm a binding."""
    headers = _auth(seed_student.id, seed_student.tenant_id, "student")
    r = await client.post("/api/v1/users/me/telegram-binding:start", headers=headers)
    token = r.json()["verification_token"]

    forbidden = await client.post(
        "/api/v1/users/me/telegram-binding:confirm",
        json={"verification_token": token, "chat_id": 1, "username": "x"},
        headers=headers,  # student role
    )
    assert forbidden.status_code == 403


async def test_confirm_unknown_token_404(client):
    r = await client.post(
        "/api/v1/users/me/telegram-binding:confirm",
        json={"verification_token": "nope", "chat_id": 1},
        headers=_auth("svc_bot", "tnt_test", "admin"),
    )
    assert r.status_code == 404
