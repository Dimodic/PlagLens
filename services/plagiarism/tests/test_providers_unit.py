"""Provider tests with mocked subprocess (jplag/dolos) and respx (codequiry)."""
from __future__ import annotations

import asyncio
import zipfile
from io import BytesIO
from unittest.mock import patch

import httpx

from plagiarism_service.providers import (
    SubmissionFile,
    SubmissionItem,
    SubmissionSet,
)
from plagiarism_service.providers.codequiry import CodequiryProvider
from plagiarism_service.providers.dolos import DolosProvider, _DolosState
from plagiarism_service.providers.jplag import JPlagProvider, _JPlagState, map_language
from plagiarism_service.providers.moss import MossProvider


class _FakeJPlagProcess:
    """Async-process stand-in for JPlag tests.

    Mimics the surface of ``asyncio.subprocess.Process`` used by the provider:
    ``communicate()``, ``wait()``, ``terminate()``, ``kill()`` and
    ``returncode``. The constructor takes the bytes to write to
    ``<state.result_dir>/result.jplag`` once ``communicate`` is awaited.
    """

    def __init__(self, *, result_dir, zip_bytes: bytes, returncode: int = 0,
                 stderr: bytes = b""):
        self._result_dir = result_dir
        self._zip = zip_bytes
        self.returncode = None
        self._final_rc = returncode
        self._stderr = stderr

    async def communicate(self):
        # Simulate JPlag writing the result zip and exiting.
        from pathlib import Path
        rd = Path(self._result_dir)
        rd.mkdir(parents=True, exist_ok=True)
        (rd / "result.jplag").write_bytes(self._zip)
        self.returncode = self._final_rc
        return b"", self._stderr

    async def wait(self):
        if self.returncode is None:
            self.returncode = self._final_rc
        return self.returncode

    def terminate(self):
        self.returncode = -15

    def kill(self):
        self.returncode = -9


def _make_set(run_id: str = "plg_p1") -> SubmissionSet:
    return SubmissionSet(
        run_id=run_id,
        tenant_id="tnt_t",
        language="python",
        options={"min_tokens": 5},
        items=[
            SubmissionItem(
                submission_id="sub_a",
                author_id="usr_a",
                author_display_name="A",
                course_id="crs_a",
                assignment_id="asn_a",
                language="python",
                files=[SubmissionFile(path="m.py", content="def f(x): return x + 1")],
            ),
            SubmissionItem(
                submission_id="sub_b",
                author_id="usr_b",
                author_display_name="B",
                course_id="crs_a",
                assignment_id="asn_a",
                language="python",
                files=[SubmissionFile(path="m.py", content="def f(y): return y + 1")],
            ),
        ],
    )


async def test_moss_provider_skeleton_completes():
    p = MossProvider()
    rid = await p.submit(_make_set("plg_moss"))
    # Wait for the worker thread to finish.
    for _ in range(50):
        res = await p.poll(rid)
        if res.status == "completed":
            break
        await asyncio.sleep(0.05)
    assert res.status == "completed"
    art = await p.fetch_artifact(rid, "json")
    assert art.content


def _fake_jplag_zip() -> bytes:
    buf = BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.writestr(
            "submissionFileIndex.json",
            '{"submissions":{"sub_a":{"files":["m.py"]},"sub_b":{"files":["m.py"]}}}',
        )
        zf.writestr(
            "topComparisons.json",
            (
                '[{"first_submission":"sub_a","second_submission":"sub_b",'
                '"similarities":{"AVG":0.5,"MAX":0.6},"matchedTokens":40}]'
            ),
        )
        zf.writestr(
            "sub_a-sub_b.json",
            (
                '{"first_submission":"sub_a","second_submission":"sub_b",'
                '"similarities":{"AVG":0.5},"matched_tokens":40,'
                '"matches":[{"first_file_name":"m.py","second_file_name":"m.py",'
                '"start_in_first":1,"end_in_first":3,'
                '"start_in_second":1,"end_in_second":3,"length":15}]}'
            ),
        )
        zf.writestr("overview.json", '{"clusters":[]}')
    return buf.getvalue()


async def test_jplag_language_mapping():
    assert map_language("python") == "python3"
    assert map_language("Python") == "python3"
    assert map_language("py") == "python3"
    assert map_language("cpp") == "cpp"
    assert map_language("c++") == "cpp"
    assert map_language("java") == "java"
    assert map_language("c") == "c"
    assert map_language("csharp") == "csharp"
    assert map_language("javascript") == "javascript"
    assert map_language("typescript") == "typescript"
    assert map_language("go") == "go"
    assert map_language("rust") == "rust"
    assert map_language("kotlin") == "kotlin"
    assert map_language("scala") == "scala"
    assert map_language("brainfuck") == "text"  # unknown → fallback
    assert map_language(None) == "text"


async def test_jplag_provider_with_mocked_run():
    p = JPlagProvider()
    zip_bytes = _fake_jplag_zip()

    async def _spawn(state: _JPlagState, *, language, jar_path):
        return _FakeJPlagProcess(result_dir=state.result_dir, zip_bytes=zip_bytes)

    with patch("plagiarism_service.providers.jplag._spawn_jplag", _spawn):
        rid = await p.submit(_make_set("plg_jplag"))
        for _ in range(50):
            res = await p.poll(rid)
            if res.status == "completed":
                break
            await asyncio.sleep(0.05)
        assert res.status == "completed", f"got {res.status}: {res.error}"
        assert res.pairs and res.pairs[0].similarity == 0.5
        assert res.pairs[0].matched_tokens == 40
        assert res.pairs[0].fragments and res.pairs[0].fragments[0].a_file == "m.py"
        # Aggregate metrics surfaced as artifact.
        assert "aggregate_json" in res.artifacts
        agg = res.artifacts["aggregate_json"].content
        assert b'"max_sim"' in agg and b'"pair_count": 1' in agg


async def test_jplag_provider_failed_subprocess():
    p = JPlagProvider()

    async def _spawn(state: _JPlagState, *, language, jar_path):
        # Returncode != 0 → provider must report failure.
        return _FakeJPlagProcess(
            result_dir=state.result_dir,
            zip_bytes=b"",
            returncode=2,
            stderr=b"JPlag: invalid language token",
        )

    with patch("plagiarism_service.providers.jplag._spawn_jplag", _spawn):
        rid = await p.submit(_make_set("plg_jplag_fail"))
        for _ in range(50):
            res = await p.poll(rid)
            if res.status in ("failed", "completed"):
                break
            await asyncio.sleep(0.05)
        assert res.status == "failed"
        assert "exited 2" in (res.error or "") or "invalid language" in (res.error or "")


async def test_jplag_provider_cancel():
    p = JPlagProvider()

    class _SlowProcess(_FakeJPlagProcess):
        async def communicate(self):
            await asyncio.sleep(5.0)
            return await super().communicate()

    async def _spawn(state: _JPlagState, *, language, jar_path):
        return _SlowProcess(
            result_dir=state.result_dir, zip_bytes=_fake_jplag_zip()
        )

    with patch("plagiarism_service.providers.jplag._spawn_jplag", _spawn):
        rid = await p.submit(_make_set("plg_jplag_cancel"))
        # Give the waiter time to enter communicate().
        await asyncio.sleep(0.05)
        await p.cancel(rid)
        res = await p.poll(rid)
        assert res.status == "cancelled"


async def test_jplag_provider_archive_artifact():
    p = JPlagProvider()
    zip_bytes = _fake_jplag_zip()

    async def _spawn(state: _JPlagState, *, language, jar_path):
        return _FakeJPlagProcess(result_dir=state.result_dir, zip_bytes=zip_bytes)

    with patch("plagiarism_service.providers.jplag._spawn_jplag", _spawn):
        rid = await p.submit(_make_set("plg_jplag_art"))
        for _ in range(50):
            res = await p.poll(rid)
            if res.status == "completed":
                break
            await asyncio.sleep(0.05)
        art = await p.fetch_artifact(rid, "archive")
        assert art.content == zip_bytes
        assert art.content_type == "application/zip"
        json_art = await p.fetch_artifact(rid, "json")
        assert json_art.content  # overview.json
        html_art = await p.fetch_artifact(rid, "html")
        assert b"jplag" in html_art.content.lower()


async def test_dolos_provider_with_mocked_run():
    p = DolosProvider()

    def _run(state: _DolosState, language):
        out = state.run_dir / "out"
        out.mkdir()
        (out / "pairs.csv").write_text(
            "leftFileName,rightFileName,similarity,longestFragment,totalOverlap\n"
            "sub_a/m.py,sub_b/m.py,0.42,15,30\n",
            encoding="utf-8",
        )
        state.csv_path = out / "pairs.csv"
        state.status = "completed"

    with patch("plagiarism_service.providers.dolos._run_dolos", _run):
        rid = await p.submit(_make_set("plg_dolos"))
        for _ in range(50):
            res = await p.poll(rid)
            if res.status == "completed":
                break
            await asyncio.sleep(0.05)
        assert res.status == "completed"
        assert res.pairs[0].similarity == 0.42


async def test_codequiry_provider_4_step_flow():
    """Mock the HTTP layer to verify create→upload→start→poll→results."""

    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path.endswith("/check/create"):
            return httpx.Response(200, json={"check_id": 42})
        if request.url.path.endswith("/upload"):
            return httpx.Response(200, json={"ok": True})
        if request.url.path.endswith("/start"):
            return httpx.Response(200, json={"ok": True})
        if request.url.path.endswith("/status"):
            return httpx.Response(200, json={"status": "completed"})
        if request.url.path.endswith("/results"):
            return httpx.Response(
                200,
                json={
                    "pairs": [
                        {
                            "a_submission_id": "sub_a",
                            "b_submission_id": "sub_b",
                            "similarity": 78,
                            "matched_tokens": 200,
                        }
                    ]
                },
            )
        return httpx.Response(404)

    transport = httpx.MockTransport(handler)

    def mock_factory(api_key: str):
        return httpx.AsyncClient(transport=transport, headers={"Authorization": f"Bearer {api_key}"})

    with patch("plagiarism_service.providers.codequiry._client", mock_factory):
        p = CodequiryProvider()
        rid = await p.submit(_make_set("plg_cq"))
        result = await p.poll(rid)
        assert result.status == "completed"
        assert result.pairs and abs(result.pairs[0].similarity - 0.78) < 1e-6
