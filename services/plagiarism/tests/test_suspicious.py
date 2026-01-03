"""Suspicious flag service: severity bands + manual flow."""
from __future__ import annotations

from plagiarism_service.models.plagiarism import PlagiarismPair
from plagiarism_service.services.suspicious_service import (
    SuspiciousService,
    severity_for,
)


def test_severity_bands():
    assert severity_for(0.5) == "low"
    assert severity_for(0.7) == "medium"
    assert severity_for(0.85) == "medium"
    assert severity_for(0.86) == "high"
    assert severity_for(0.99) == "high"


async def test_auto_flag_pair_creates_two_flags(session_factory):
    async with session_factory() as session:
        svc = SuspiciousService(session)
        pair = PlagiarismPair(
            id="pair_x",
            run_id="plg_x",
            tenant_id="tnt_t",
            a_submission_id="sub_a",
            b_submission_id="sub_b",
            similarity=0.9,
            matched_tokens=120,
            fragments=[],
        )
        flags = await svc.auto_flag_pair(
            tenant_id="tnt_t", run_id="plg_x", pair=pair, threshold=0.6
        )
        await session.commit()
        assert len(flags) == 2
        assert {f.severity for f in flags} == {"high"}
        assert {f.submission_id for f in flags} == {"sub_a", "sub_b"}


async def test_auto_flag_below_threshold(session_factory):
    async with session_factory() as session:
        svc = SuspiciousService(session)
        pair = PlagiarismPair(
            id="pair_y",
            run_id="plg_y",
            tenant_id="tnt_t",
            a_submission_id="sub_c",
            b_submission_id="sub_d",
            similarity=0.4,
            matched_tokens=20,
            fragments=[],
        )
        flags = await svc.auto_flag_pair(
            tenant_id="tnt_t", run_id="plg_y", pair=pair, threshold=0.6
        )
        assert flags == []
