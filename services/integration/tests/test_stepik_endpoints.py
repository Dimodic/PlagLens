import respx
from httpx import Response


async def _make(client):
    r = await client.post(
        "/api/v1/integrations",
        json={
            "kind": "stepik",
            "display_name": "S",
            "settings": {"static_token": "tok", "stepik_course_ids": [123]},
        },
        headers={"X-User-Id": "u", "X-Tenant-Id": "t", "X-Global-Role": "admin"},
    )
    assert r.status_code == 201
    return r.json()["config"]["id"]


async def test_stepik_courses(client, settings):
    cid = await _make(client)
    with respx.mock(assert_all_called=False) as m:
        m.get(settings.stepik_api_base_url.rstrip("/") + "/courses").mock(
            return_value=Response(200, json={"courses": [{"id": 1}], "meta": {"page": 1}})
        )
        r = await client.get(
            f"/api/v1/integrations/stepik/{cid}/courses",
            headers={"X-User-Id": "u", "X-Tenant-Id": "t", "X-Global-Role": "admin"},
        )
    assert r.status_code == 200
    assert r.json()["data"][0]["id"] == 1


async def test_stepik_lessons(client, settings):
    cid = await _make(client)
    with respx.mock(assert_all_called=False) as m:
        m.get(settings.stepik_api_base_url.rstrip("/") + "/lessons").mock(
            return_value=Response(200, json={"lessons": [{"id": 9}], "meta": {}})
        )
        r = await client.get(
            f"/api/v1/integrations/stepik/{cid}/courses/123/lessons",
            headers={"X-User-Id": "u", "X-Tenant-Id": "t", "X-Global-Role": "admin"},
        )
    assert r.status_code == 200
    assert r.json()["data"][0]["id"] == 9


async def test_stepik_steps_and_preview(client, settings):
    cid = await _make(client)
    with respx.mock(assert_all_called=False) as m:
        m.get(settings.stepik_api_base_url.rstrip("/") + "/steps").mock(
            return_value=Response(200, json={"steps": [{"id": 5}], "meta": {}})
        )
        m.get(settings.stepik_api_base_url.rstrip("/") + "/steps/5").mock(
            return_value=Response(200, json={"steps": [{"id": 5, "title": "x"}]})
        )
        r1 = await client.get(
            f"/api/v1/integrations/stepik/{cid}/courses/123/steps",
            headers={"X-User-Id": "u", "X-Tenant-Id": "t", "X-Global-Role": "admin"},
        )
        r2 = await client.get(
            f"/api/v1/integrations/stepik/{cid}/steps/5/preview",
            headers={"X-User-Id": "u", "X-Tenant-Id": "t", "X-Global-Role": "admin"},
        )
    assert r1.status_code == 200
    assert r2.status_code == 200
    assert r2.json()["id"] == 5


async def test_stepik_sync_structure(client, settings):
    cid = await _make(client)
    with respx.mock(assert_all_called=False) as m:
        m.get(settings.stepik_api_base_url.rstrip("/") + "/courses/123").mock(
            return_value=Response(200, json={"courses": [{"id": 123, "title": "T"}]})
        )
        r = await client.post(
            f"/api/v1/integrations/stepik/{cid}/sync-course-structure",
            headers={"X-User-Id": "u", "X-Tenant-Id": "t", "X-Global-Role": "admin"},
        )
    assert r.status_code == 200
    assert r.json()["ok"] is True
