async def test_binding_lifecycle(client):
    headers = {"X-User-Id": "usr_a", "X-Tenant-Id": "tnt_x", "X-Global-Role": "student"}
    r = await client.post("/api/v1/integrations/telegram/binding/start", headers=headers)
    assert r.status_code == 200
    token = r.json()["verification_token"]
    assert token

    me = await client.get("/api/v1/users/me/telegram-binding", headers=headers)
    assert me.status_code == 200
    assert me.json()["bound"] is False

    confirm = await client.post(
        "/api/v1/integrations/telegram/binding/confirm",
        json={"verification_token": token, "chat_id": 555, "username": "alice"},
        headers={"X-User-Id": "svc", "X-Tenant-Id": "tnt_x", "X-Global-Role": "admin"},
    )
    assert confirm.status_code == 200
    assert confirm.json()["ok"] is True

    me2 = await client.get("/api/v1/users/me/telegram-binding", headers=headers)
    assert me2.json()["bound"] is True
    assert me2.json()["chat_id"] == 555

    rm = await client.delete("/api/v1/users/me/telegram-binding", headers=headers)
    assert rm.status_code == 204


async def test_admin_bot_settings(client):
    r = await client.get(
        "/api/v1/admin/integrations/telegram/bot-settings",
        headers={"X-User-Id": "admin", "X-Tenant-Id": "tnt_x", "X-Global-Role": "admin"},
    )
    assert r.status_code == 200


async def test_admin_bot_token_requires_super_admin(client):
    r = await client.patch(
        "/api/v1/admin/integrations/telegram/bot-settings",
        json={"bot_token": "secret"},
        headers={"X-User-Id": "a", "X-Tenant-Id": "tnt_x", "X-Global-Role": "admin"},
    )
    assert r.status_code == 403
