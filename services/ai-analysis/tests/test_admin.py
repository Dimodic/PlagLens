"""Admin endpoints: prompt versions, providers, cache, budgets."""
from __future__ import annotations

# ---------- Prompt versions ----------


async def test_create_and_activate_prompt_version(client) -> None:
    payload = {
        "id": "v2",
        "name": "Strict 2026",
        "system_prompt": "You are an academic-integrity assistant. <student_code>...</student_code>",
        "user_template": "Course: {course_name}\nLanguage: {language}\n{code}",
        "json_schema": {"type": "object", "properties": {}},
    }
    r = await client.post("/api/v1/admin/ai/prompt-versions", json=payload)
    assert r.status_code == 201, r.text

    r = await client.get("/api/v1/admin/ai/prompt-versions/v2")
    assert r.status_code == 200
    assert r.json()["active_for_tenant"] is False

    r = await client.post("/api/v1/admin/ai/prompt-versions/v2:activate")
    assert r.status_code == 200
    assert r.json()["active_for_tenant"] is True


async def test_list_prompt_versions(client) -> None:
    await client.post(
        "/api/v1/admin/ai/prompt-versions",
        json={
            "id": "v3",
            "name": "n",
            "system_prompt": "s",
            "user_template": "{code}",
            "json_schema": {"type": "object"},
        },
    )
    r = await client.get("/api/v1/admin/ai/prompt-versions")
    assert r.status_code == 200
    ids = [p["id"] for p in r.json()]
    assert "v3" in ids


async def test_prompt_version_test_endpoint(client) -> None:
    await client.post(
        "/api/v1/admin/ai/prompt-versions",
        json={
            "id": "vT",
            "name": "n",
            "system_prompt": "s",
            "user_template": "{code}",
            "json_schema": {"type": "object"},
        },
    )
    r = await client.post(
        "/api/v1/admin/ai/prompt-versions/vT:test",
        json={"submission_id": "sub_x"},
    )
    assert r.status_code == 200


async def test_prompt_version_usage(client) -> None:
    await client.post(
        "/api/v1/admin/ai/prompt-versions",
        json={
            "id": "vU",
            "name": "n",
            "system_prompt": "s",
            "user_template": "{code}",
            "json_schema": {"type": "object"},
        },
    )
    r = await client.get("/api/v1/admin/ai/prompt-versions/vU/usage")
    assert r.status_code == 200
    assert r.json()["total_uses"] == 0


# ---------- Providers ----------


async def test_provider_lifecycle(client) -> None:
    r = await client.post(
        "/api/v1/admin/ai/providers",
        json={
            "provider": "openai",
            "base_url": "https://api.openai.com/v1",
            "model": "gpt-4o-mini",
            "api_key": "sk-test",
            "priority": 1,
            "rate_limit_rpm": 60,
            "max_tokens": 4096,
            "supports_json_schema": True,
            "settings": {},
        },
    )
    assert r.status_code == 201
    pid = r.json()["id"]

    r = await client.get(f"/api/v1/admin/ai/providers/{pid}")
    assert r.status_code == 200

    r = await client.patch(
        f"/api/v1/admin/ai/providers/{pid}", json={"priority": 5, "enabled": True}
    )
    assert r.status_code == 200
    assert r.json()["priority"] == 5

    r = await client.post(f"/api/v1/admin/ai/providers/{pid}:set-default")
    assert r.status_code == 200
    assert r.json()["default_for_tenant"] is True

    r = await client.post(f"/api/v1/admin/ai/providers/{pid}:test")
    assert r.status_code == 200

    r = await client.get(f"/api/v1/admin/ai/providers/{pid}/health")
    assert r.status_code == 200

    r = await client.delete(f"/api/v1/admin/ai/providers/{pid}")
    assert r.status_code == 204


async def test_list_providers(client) -> None:
    r = await client.get("/api/v1/admin/ai/providers")
    assert r.status_code == 200


# ---------- Cache ----------


async def test_cache_stats_and_clear(client) -> None:
    r = await client.get("/api/v1/admin/ai/cache/stats")
    assert r.status_code == 200
    assert "hit_rate" in r.json()

    r = await client.delete("/api/v1/admin/ai/cache")
    assert r.status_code == 204

    r = await client.delete("/api/v1/admin/ai/cache/by-prompt-version/v1")
    assert r.status_code == 204


# ---------- Budgets ----------


async def test_tenant_budget_create_get_update(client) -> None:
    # Patch creates if missing.
    r = await client.patch(
        "/api/v1/tenants/tnt_t1/ai/budget",
        json={"period": "month", "max_tokens": 100000, "max_cost": "10.00"},
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["max_tokens"] == 100000

    r = await client.get("/api/v1/tenants/tnt_t1/ai/budget")
    assert r.status_code == 200

    r = await client.get("/api/v1/tenants/tnt_t1/ai/usage")
    assert r.status_code == 200


async def test_course_budget(client) -> None:
    r = await client.patch(
        "/api/v1/courses/crs_1/ai/budget",
        json={"period": "month", "max_tokens": 5000},
    )
    assert r.status_code == 200

    r = await client.get("/api/v1/courses/crs_1/ai/budget")
    assert r.status_code == 200

    r = await client.get("/api/v1/courses/crs_1/ai/usage")
    assert r.status_code == 200


async def test_user_usage(client) -> None:
    r = await client.get("/api/v1/users/me/ai/usage")
    assert r.status_code == 200
