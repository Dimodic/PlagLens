async def test_healthz(client):
    r = await client.get("/healthz")
    assert r.status_code == 200
    assert r.json()["status"] == "ok"


async def test_readyz(client):
    r = await client.get("/readyz")
    assert r.status_code == 200


async def test_version(client):
    r = await client.get("/api/v1/version")
    assert r.status_code == 200
    body = r.json()
    assert "version" in body and body["version"]
