"""End-to-end orchestrator test using mocked provider subprocess (jplag)."""
from __future__ import annotations

import asyncio
import zipfile
from io import BytesIO
from unittest.mock import patch

from plagiarism_service.events.producer import NullEventProducer
from plagiarism_service.providers import (
    SubmissionFile,
    SubmissionItem,
)
from plagiarism_service.providers.jplag import _JPlagState
from plagiarism_service.services.orchestrator import Orchestrator


def _build_fake_zip() -> bytes:
    buf = BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.writestr(
            "submissionFileIndex.json",
            '{"submissions":{"sub_a":{"files":["A.java"]},"sub_b":{"files":["B.java"]}}}',
        )
        zf.writestr(
            "topComparisons.json",
            (
                '[{"first_submission":"sub_a","second_submission":"sub_b",'
                '"similarities":{"AVG":0.91,"MAX":0.95},"matchedTokens":150}]'
            ),
        )
        zf.writestr(
            "sub_a-sub_b.json",
            (
                '{"first_submission":"sub_a","second_submission":"sub_b",'
                '"similarities":{"AVG":0.91},"matched_tokens":150,'
                '"matches":[{"first_file_name":"A.java","second_file_name":"B.java",'
                '"start_in_first":1,"end_in_first":1,'
                '"start_in_second":1,"end_in_second":1}]}'
            ),
        )
        zf.writestr("overview.json", '{"clusters":[]}')
    return buf.getvalue()


class _FakeProcess:
    def __init__(self, result_dir, zip_bytes):
        self._result_dir = result_dir
        self._zip = zip_bytes
        self.returncode = None

    async def communicate(self):
        from pathlib import Path
        rd = Path(self._result_dir)
        rd.mkdir(parents=True, exist_ok=True)
        (rd / "result.jplag").write_bytes(self._zip)
        self.returncode = 0
        return b"", b""

    async def wait(self):
        if self.returncode is None:
            self.returncode = 0
        return self.returncode

    def terminate(self):
        self.returncode = -15

    def kill(self):
        self.returncode = -9


async def _patched_spawn(state: _JPlagState, *, language, jar_path):
    return _FakeProcess(state.result_dir, _build_fake_zip())


async def test_orchestrator_full_flow(session_factory):
    producer = NullEventProducer()
    orch = Orchestrator(session_factory=session_factory, producer=producer)
    items = [
        SubmissionItem(
            submission_id="sub_a",
            author_id="usr_a",
            author_display_name="Alice",
            course_id="crs_test",
            assignment_id="asn_42",
            language="java",
            files=[SubmissionFile(path="A.java", content="class A {}")],
        ),
        SubmissionItem(
            submission_id="sub_b",
            author_id="usr_b",
            author_display_name="Bob",
            course_id="crs_test",
            assignment_id="asn_42",
            language="java",
            files=[SubmissionFile(path="B.java", content="class B {}")],
        ),
    ]
    run, replayed = await orch.enqueue_run(
        tenant_id="tnt_test",
        course_id="crs_test",
        assignment_id="asn_42",
        provider_name="jplag",
        scope={"assignment_ids": ["asn_42"]},
        options={"similarity_threshold": 0.6},
        triggered_by="usr_admin",
    )
    assert not replayed
    with patch("plagiarism_service.providers.jplag._spawn_jplag", _patched_spawn):
        ok = await orch.start_run(run_id=run.id, items=items, language="java")
        assert ok
        # Wait for the JPlag waiter task to finish, then drive poll-loop.
        for _ in range(50):
            await orch.poll_active_runs()
            # Refetch run to detect completion (poll returns count, not state).
            async with session_factory() as session:
                from plagiarism_service.models.plagiarism import PlagiarismRun

                db_run = await session.get(PlagiarismRun, run.id)
                if db_run and db_run.status == "completed":
                    break
            await asyncio.sleep(0.05)
        # final
        async with session_factory() as session:
            from plagiarism_service.models.plagiarism import PlagiarismPair, PlagiarismRun

            db_run = await session.get(PlagiarismRun, run.id)
            assert db_run.status == "completed"
            assert db_run.pairs_total == 1
            from sqlalchemy import select

            res = await session.execute(select(PlagiarismPair).where(PlagiarismPair.run_id == run.id))
            pairs = list(res.scalars().all())
            assert pairs
            assert pairs[0].similarity == 0.91
    types = {ev.type for _, ev in producer.events}
    assert "plaglens.plagiarism.run.queued.v1" in types
    assert "plaglens.plagiarism.run.started.v1" in types
    assert "plaglens.plagiarism.run.completed.v1" in types
