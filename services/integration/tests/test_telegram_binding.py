"""Admin Telegram bot-settings (read-only config view).

The per-user Telegram account *binding* moved to the identity service
(``identity.telegram_bindings`` + ``/users/me/telegram-binding*``). What
remains here is the deployment-level bot-settings surface used by the admin
integrations page — still served by integration-service (now from the
``/admin/integrations`` admin router rather than a dedicated telegram module).

Note: the test harness's principal override (see conftest) resolves role
headers as query params, so every request lands as the default ``admin``
principal. Bot-settings (incl. setting ``bot_token``) are admin-only — there
is no higher role to distinguish against (``admin`` is the top global role).
"""


async def test_admin_bot_settings(client):
    r = await client.get(
        "/api/v1/admin/integrations/telegram/bot-settings",
        headers={"X-User-Id": "admin", "X-Tenant-Id": "tnt_x", "X-Global-Role": "admin"},
    )
    assert r.status_code == 200
    body = r.json()
    assert "username" in body
    assert "token_configured" in body


async def test_admin_bot_settings_patch_echoes(client):
    r = await client.patch(
        "/api/v1/admin/integrations/telegram/bot-settings",
        json={"long_polling": False},
        headers={"X-User-Id": "a", "X-Tenant-Id": "tnt_x", "X-Global-Role": "admin"},
    )
    assert r.status_code == 200
    assert r.json()["ok"] is True
