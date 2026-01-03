import respx
from httpx import Response


async def _make(client):
    r = await client.post(
        "/api/v1/integrations",
        json={
            "kind": "yandex_contest",
            "display_name": "Y",
            "settings": {"oauth_token": "tok", "contest_id": 100},
        },
        headers={"X-User-Id": "u", "X-Tenant-Id": "t", "X-Global-Role": "admin"},
    )
    assert r.status_code == 201
    return r.json()["config"]["id"]


async def test_yandex_endpoints(client, settings):
    cid = await _make(client)
    base = settings.yandex_contest_api_base_url.rstrip("/")
    with respx.mock(assert_all_called=False) as m:
        m.get(base + "/contests").mock(return_value=Response(200, json={"contests": [{"id": 1}]}))
        # list_remote_courses iterates cfg.settings.contest_id — needs a mock.
        m.get(base + "/contests/100").mock(
            return_value=Response(200, json={"id": 100, "name": "Test contest"})
        )
        m.get(base + "/contests/100/problems").mock(
            return_value=Response(
                200,
                json={"problems": [{"id": 1, "alias": "A", "name": "МКАД C++"}]},
            )
        )
        m.get(base + "/contests/100/participants").mock(
            return_value=Response(200, json={"participants": [{"id": 7}]})
        )
        r1 = await client.get(
            f"/api/v1/integrations/yandex-contest/{cid}/contests",
            headers={"X-User-Id": "u", "X-Tenant-Id": "t", "X-Global-Role": "admin"},
        )
        r2 = await client.get(
            f"/api/v1/integrations/yandex-contest/{cid}/contests/100/problems",
            headers={"X-User-Id": "u", "X-Tenant-Id": "t", "X-Global-Role": "admin"},
        )
        r3 = await client.get(
            f"/api/v1/integrations/yandex-contest/{cid}/contests/100/participants",
            headers={"X-User-Id": "u", "X-Tenant-Id": "t", "X-Global-Role": "admin"},
        )
        r4 = await client.post(
            f"/api/v1/integrations/yandex-contest/{cid}/sync-contest-structure",
            headers={"X-User-Id": "u", "X-Tenant-Id": "t", "X-Global-Role": "admin"},
        )
    assert r1.status_code == 200
    assert r2.status_code == 200, r2.text
    body = r2.json()
    # New: list_problems returns one problem with the friendly title.
    assert body["imported"] == 1
    assert body["data"][0]["title"] == "A. МКАД C++"
    assert body["data"][0]["alias"] == "A"
    assert r3.status_code == 200
    assert r4.status_code == 200
