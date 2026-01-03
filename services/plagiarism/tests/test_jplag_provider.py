"""Real-feel JPlag provider tests — fixture + mocked subprocess.

We mock ``asyncio.create_subprocess_exec`` (via the provider's ``_spawn_jplag``
seam) to return a fake process whose ``communicate()`` writes a v5-shaped
``result.jplag`` zip to disk. The provider's parser is then exercised end-to-
end with the realistic fixture.
"""
from __future__ import annotations

import asyncio
import zipfile
from pathlib import Path
from unittest.mock import patch

import pytest

from plagiarism_service.providers import (
    SubmissionFile,
    SubmissionItem,
    SubmissionSet,
)
from plagiarism_service.providers.jplag import (
    JPlagProvider,
    _JPlagState,
    _parse_jplag_zip,
    map_language,
)

from .fixtures.sample_jplag import build_jplag_v5_zip


def _set(run_id: str = "plg_jp_real", lang: str = "python") -> SubmissionSet:
    return SubmissionSet(
        run_id=run_id,
        tenant_id="tnt_acme",
        language=lang,
        options={"min_tokens": 9},
        items=[
            SubmissionItem(
                submission_id=sid,
                author_id=f"usr_{sid}",
                author_display_name=sid.upper(),
                course_id="crs_x",
                assignment_id="asn_x",
                language=lang,
                files=[
                    SubmissionFile(
                        path="main.py",
                        content="def foo(x):\n    return x + 1\n" * 10,
                    )
                ],
            )
            for sid in ("sub_alpha", "sub_beta", "sub_gamma")
        ],
    )


class _FakeProcess:
    """Mock for asyncio.subprocess.Process."""

    def __init__(self, *, result_dir: Path, zip_bytes: bytes, returncode: int = 0,
                 stderr: bytes = b"", delay: float = 0.0):
        self._result_dir = result_dir
        self._zip = zip_bytes
        self._final_rc = returncode
        self._stderr = stderr
        self._delay = delay
        self.returncode = None

    async def communicate(self):
        if self._delay:
            await asyncio.sleep(self._delay)
        Path(self._result_dir).mkdir(parents=True, exist_ok=True)
        # The provider's locator accepts both ``result.jplag`` and a
        # ``result/result.jplag`` layout. We write the canonical v5 location.
        (Path(self._result_dir) / "result.jplag").write_bytes(self._zip)
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


# --------------------------------------------------------------------------
# Parser tests — feed the fixture directly to ``_parse_jplag_zip``.
# --------------------------------------------------------------------------


def test_parser_extracts_pairs_from_v5_fixture(tmp_path):
    zip_path = tmp_path / "result.jplag"
    zip_path.write_bytes(build_jplag_v5_zip())
    result = _parse_jplag_zip(
        zip_path,
        fallback_index={"sub_alpha": "sub_alpha", "sub_beta": "sub_beta",
                        "sub_gamma": "sub_gamma"},
    )
    assert result.status == "completed"
    assert len(result.pairs) == 2
    by_pair = {(p.a_submission_id, p.b_submission_id): p for p in result.pairs}
    ab = by_pair[("sub_alpha", "sub_beta")]
    assert abs(ab.similarity - 0.82) < 1e-6
    assert ab.matched_tokens == 412
    assert len(ab.fragments) == 2
    f1 = ab.fragments[0]
    assert f1.a_file == "main.py"
    assert f1.b_file == "solution.py"
    assert f1.a_start_line == 10
    assert f1.a_end_line == 35
    assert f1.b_start_line == 12
    assert f1.b_end_line == 37


def test_parser_extracts_clusters(tmp_path):
    zip_path = tmp_path / "result.jplag"
    zip_path.write_bytes(build_jplag_v5_zip())
    result = _parse_jplag_zip(zip_path, fallback_index={})
    assert len(result.clusters) == 1
    c = result.clusters[0]
    assert set(c.members) == {"sub_alpha", "sub_beta"}
    assert abs(c.avg_similarity - 0.82) < 1e-6


def test_parser_aggregate_metrics_artifact(tmp_path):
    zip_path = tmp_path / "result.jplag"
    zip_path.write_bytes(build_jplag_v5_zip())
    result = _parse_jplag_zip(zip_path, fallback_index={})
    assert "aggregate_json" in result.artifacts
    import json as _json
    payload = _json.loads(result.artifacts["aggregate_json"].content)
    assert payload["pair_count"] == 2
    assert abs(payload["max_sim"] - 0.82) < 1e-6
    assert payload["mean_sim"] > 0
    assert payload["submission_count"] == 3


def test_parser_corrupted_zip(tmp_path):
    zp = tmp_path / "bad.jplag"
    zp.write_bytes(b"not a zip file")
    result = _parse_jplag_zip(zp, fallback_index={})
    assert result.status == "failed"
    assert "corrupted" in (result.error or "").lower()


def test_parser_missing_zip(tmp_path):
    zp = tmp_path / "missing.jplag"
    result = _parse_jplag_zip(zp, fallback_index={})
    assert result.status == "failed"


# --------------------------------------------------------------------------
# Provider end-to-end with mocked subprocess.
# --------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_provider_end_to_end_with_fixture():
    p = JPlagProvider()
    zip_bytes = build_jplag_v5_zip()

    async def _spawn(state: _JPlagState, *, language, jar_path):
        # Verify the provider passes through correct language token.
        assert language == "python"  # canonical input
        # The mapped token would be ``python3`` — we just sanity-check
        # the seam is reached. (The CLI cmd is built around ``map_language``
        # internally; here we trust that codepath.)
        return _FakeProcess(result_dir=state.result_dir, zip_bytes=zip_bytes)

    with patch("plagiarism_service.providers.jplag._spawn_jplag", _spawn):
        rid = await p.submit(_set("plg_e2e_real"))
        # Drive poll until completion (waiter task runs in background).
        for _ in range(50):
            res = await p.poll(rid)
            if res.status == "completed":
                break
            await asyncio.sleep(0.02)
        assert res.status == "completed", f"got {res.status} err={res.error}"
        # 2 pairs from the fixture.
        assert len(res.pairs) == 2
        # 1 cluster.
        assert len(res.clusters) == 1
        # Archive artifact = the raw zip.
        archive = await p.fetch_artifact(rid, "archive")
        assert archive.content == zip_bytes
        assert archive.content_type == "application/zip"
        assert archive.filename and archive.filename.endswith(".jplag")
        # JSON artifact = overview.json from inside the zip.
        js = await p.fetch_artifact(rid, "json")
        import json as _json
        ov = _json.loads(js.content)
        assert ov.get("submissionsCount") == 3


@pytest.mark.asyncio
async def test_provider_failed_with_stderr():
    p = JPlagProvider()

    async def _spawn(state: _JPlagState, *, language, jar_path):
        return _FakeProcess(
            result_dir=state.result_dir,
            zip_bytes=b"",
            returncode=1,
            stderr=b"ERROR: language token 'foo' is unknown",
        )

    with patch("plagiarism_service.providers.jplag._spawn_jplag", _spawn):
        rid = await p.submit(_set("plg_fail_real"))
        for _ in range(50):
            res = await p.poll(rid)
            if res.status in ("failed", "completed"):
                break
            await asyncio.sleep(0.02)
        assert res.status == "failed"
        assert "language token 'foo' is unknown" in (res.error or "")


@pytest.mark.asyncio
async def test_provider_cancel_terminates_subprocess():
    p = JPlagProvider()

    async def _spawn(state: _JPlagState, *, language, jar_path):
        return _FakeProcess(
            result_dir=state.result_dir,
            zip_bytes=build_jplag_v5_zip(),
            delay=10.0,
        )

    with patch("plagiarism_service.providers.jplag._spawn_jplag", _spawn):
        rid = await p.submit(_set("plg_cancel_real"))
        await asyncio.sleep(0.02)
        await p.cancel(rid)
        res = await p.poll(rid)
        assert res.status == "cancelled"


@pytest.mark.asyncio
async def test_provider_handles_old_layout_result_dir(tmp_path):
    """JPlag patch-level versions wrote to ``result/result.jplag``."""
    p = JPlagProvider()
    zip_bytes = build_jplag_v5_zip()

    async def _spawn(state: _JPlagState, *, language, jar_path):
        # Write to the legacy nested location.
        nested = state.result_dir / "result"
        nested.mkdir(parents=True, exist_ok=True)
        (nested / "result.jplag").write_bytes(zip_bytes)

        class _AlreadyDone:
            returncode = None

            async def communicate(self):
                self.returncode = 0
                return b"", b""

            async def wait(self):
                self.returncode = 0
                return 0

            def terminate(self):
                pass

            def kill(self):
                pass

        return _AlreadyDone()

    with patch("plagiarism_service.providers.jplag._spawn_jplag", _spawn):
        rid = await p.submit(_set("plg_legacy_real"))
        for _ in range(50):
            res = await p.poll(rid)
            if res.status == "completed":
                break
            await asyncio.sleep(0.02)
        assert res.status == "completed"
        assert len(res.pairs) == 2


def test_command_line_includes_required_flags(tmp_path, monkeypatch):
    """The provider builds a JPlag CLI line containing the documented flags
    -l, -t, -r, plus the submissions root."""
    captured: dict[str, list[str]] = {}

    real_create = asyncio.create_subprocess_exec

    async def fake_create(*cmd, **kwargs):
        captured["cmd"] = list(cmd)

        class _Done:
            returncode = None

            async def communicate(self):
                self.returncode = 0
                return b"", b""

            async def wait(self):
                self.returncode = 0
                return 0

            def terminate(self):
                pass

            def kill(self):
                pass

        return _Done()

    monkeypatch.setattr(asyncio, "create_subprocess_exec", fake_create)
    try:
        async def _run():
            p = JPlagProvider()
            await p.submit(_set("plg_cmd_inspect", lang="cpp"))
            # Wait a moment for the spawn coroutine to run.
            await asyncio.sleep(0.05)

        asyncio.run(_run())
    finally:
        monkeypatch.setattr(asyncio, "create_subprocess_exec", real_create)

    assert captured.get("cmd"), "JPlag was not invoked"
    cmd = captured["cmd"]
    assert "-jar" in cmd
    assert "-l" in cmd
    li = cmd.index("-l")
    assert cmd[li + 1] == "cpp"  # language token mapped
    assert "-t" in cmd
    ti = cmd.index("-t")
    assert int(cmd[ti + 1]) >= 1
    assert "-r" in cmd
    # submissions root is the last positional arg.
    assert cmd[-1].endswith("submissions")


def test_language_token_mapping_full_table():
    cases = {
        "python": "python3",
        "cpp": "cpp",
        "java": "java",
        "c": "c",
        "csharp": "csharp",
        "javascript": "javascript",
        "typescript": "typescript",
        "go": "go",
        "rust": "rust",
        "kotlin": "kotlin",
        "scala": "scala",
    }
    for canon, jp in cases.items():
        assert map_language(canon) == jp, f"{canon}→{jp}"
    # Case-insensitive.
    assert map_language("PYTHON") == "python3"
    # Unknown → fall back to text.
    assert map_language("erlang") == "text"
    assert map_language("") == "text"
    assert map_language(None) == "text"


# --------------------------------------------------------------------------
# Sanity check: the fixture is valid zip and contains the documented entries.
# --------------------------------------------------------------------------


def test_fixture_zip_layout(tmp_path):
    zip_path = tmp_path / "fixture.jplag"
    zip_path.write_bytes(build_jplag_v5_zip())
    with zipfile.ZipFile(zip_path) as zf:
        names = set(zf.namelist())
    assert "overview.json" in names
    assert "submissionFileIndex.json" in names
    assert "topComparisons.json" in names
    assert "options.json" in names
    pair_files = {n for n in names if n.endswith(".json") and "-" in n.split("/")[-1]}
    assert len(pair_files) == 2
