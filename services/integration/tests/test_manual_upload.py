import io
import zipfile


def _zip_bytes() -> bytes:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as zf:
        zf.writestr("hw-01/alice@example.com/main.py", "print('hi')\n")
        zf.writestr("hw-01/bob@example.com/main.py", "x=1\n")
    return buf.getvalue()


async def test_manual_zip_upload(client):
    files = {"file": ("upload.zip", _zip_bytes(), "application/zip")}
    r = await client.post(
        "/api/v1/integrations/manual/upload",
        files=files,
        data={"course_id": "crs_1"},
        headers={"X-User-Id": "u", "X-Tenant-Id": "t", "X-Global-Role": "teacher"},
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["summary"]["students"] == 2
    assert body["summary"]["with_assignment"] == 2


async def test_manual_csv_upload(client):
    csv_data = (
        "student_email,assignment_slug,language,file_url,inline_code\n"
        "alice@example.com,hw-01,python,,print('hi')\n"
        "bob@example.com,hw-01,python,https://x.com/code.py,\n"
    )
    files = {"file": ("upload.csv", csv_data.encode("utf-8"), "text/csv")}
    r = await client.post(
        "/api/v1/integrations/manual/upload-csv",
        files=files,
        headers={"X-User-Id": "u", "X-Tenant-Id": "t", "X-Global-Role": "teacher"},
    )
    assert r.status_code == 200
    assert r.json()["summary"]["items"] == 2


async def test_manual_template_csv(client):
    r = await client.get(
        "/api/v1/integrations/manual/templates",
        headers={"X-User-Id": "u", "X-Tenant-Id": "t", "X-Global-Role": "teacher"},
    )
    assert r.status_code == 200
    assert "student_email" in r.text


async def test_csv_schema(client):
    r = await client.get(
        "/api/v1/integrations/manual/templates/csv-schema.json",
        headers={"X-User-Id": "u", "X-Tenant-Id": "t", "X-Global-Role": "teacher"},
    )
    assert r.status_code == 200
    body = r.json()
    assert body["title"]
