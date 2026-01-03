import respx
from httpx import Response


async def _make_stepik(client):
    r = await client.post(
        "/api/v1/integrations",
        json={"kind": "stepik", "display_name": "S"},
        headers={"X-User-Id": "u", "X-Tenant-Id": "t", "X-Global-Role": "admin"},
    )
    assert r.status_code == 201
    return r.json()["config"]["id"]


async def test_oauth_start_returns_url(client, settings):
    cid = await _make_stepik(client)
    r = await client.get(
        f"/api/v1/integrations/{cid}/oauth/start",
        headers={"X-User-Id": "u", "X-Tenant-Id": "t", "X-Global-Role": "admin"},
    )
    assert r.status_code == 200
    body = r.json()
    assert "authorize_url" in body and "state" in body


async def test_oauth_callback_exchanges_code(client, fake_redis, settings):
    cid = await _make_stepik(client)
    r = await client.get(
        f"/api/v1/integrations/{cid}/oauth/start",
        headers={"X-User-Id": "u", "X-Tenant-Id": "t", "X-Global-Role": "admin"},
    )
    state = r.json()["state"]

    with respx.mock(assert_all_called=False) as m:
        m.post(settings.stepik_oauth_token_url).mock(
            return_value=Response(
                200,
                json={
                    "access_token": "atk_123",
                    "refresh_token": "rtk_456",
                    "expires_in": 3600,
                },
            )
        )
        cb = await client.get(
            f"/api/v1/integrations/{cid}/oauth/callback",
            params={"code": "AUTH_CODE", "state": state},
        )
    assert cb.status_code == 200, cb.text
    body = cb.json()
    assert body["status"] == "ok"
    assert body["active"] is True

    stored = await fake_redis.get(f"oauth:token:{cid}:access")
    assert stored == "atk_123"


async def test_oauth_callback_rejects_unknown_state(client):
    cid = await _make_stepik(client)
    r = await client.get(
        f"/api/v1/integrations/{cid}/oauth/callback",
        params={"code": "x", "state": "bogus"},
    )
    assert r.status_code == 400
