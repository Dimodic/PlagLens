"""Corpus fingerprint + cross-tenant isolation."""
from __future__ import annotations

from plagiarism_service.services.corpus_service import (
    CorpusService,
    fingerprint,
    jaccard,
)


def test_fingerprint_deterministic():
    fp1, n1 = fingerprint("def add(a, b): return a + b", k=3)
    fp2, n2 = fingerprint("def add(a, b): return a + b", k=3)
    assert fp1 == fp2
    assert n1 == n2 > 0


def test_jaccard_similarity_makes_sense():
    fp_a, _ = fingerprint("def add(a, b): return a + b\nprint(add(1, 2))", k=3)
    fp_b, _ = fingerprint("def add(a, b): return a + b\nprint(add(3, 4))", k=3)
    fp_c, _ = fingerprint("import os\nprint(os.path.dirname('/'))", k=3)
    sim_close = jaccard(fp_a, fp_b)
    sim_far = jaccard(fp_a, fp_c)
    assert sim_close > sim_far


async def test_corpus_cross_tenant_isolation(session_factory):
    async with session_factory() as session:
        cs = CorpusService(session)
        await cs.add_submission(
            tenant_id="tnt_a",
            course_id="crs_1",
            assignment_id="asn_1",
            submission_id="sub_a1",
            language="python",
            source="def add(a, b): return a + b\n" * 20,
        )
        await cs.add_submission(
            tenant_id="tnt_b",
            course_id="crs_2",
            assignment_id="asn_2",
            submission_id="sub_b1",
            language="python",
            source="def add(a, b): return a + b\n" * 20,
        )
        await session.commit()

    async with session_factory() as session:
        cs = CorpusService(session)
        fp_a, _ = fingerprint("def add(a, b): return a + b\n" * 20, k=5)
        hits = await cs.search_similar(
            tenant_id="tnt_a",
            query_fingerprint=fp_a,
            language="python",
            top_k=10,
            min_similarity=0.0,
        )
        sub_ids = {h.submission_id for h, _ in hits}
        assert "sub_a1" in sub_ids
        assert "sub_b1" not in sub_ids  # CRITICAL: no cross-tenant leak


async def test_corpus_remove_submission(session_factory):
    async with session_factory() as session:
        cs = CorpusService(session)
        await cs.add_submission(
            tenant_id="tnt_x",
            course_id="crs_x",
            assignment_id="asn_x",
            submission_id="sub_xrem",
            language="python",
            source="x = 1\n" * 30,
        )
        await session.commit()
    async with session_factory() as session:
        cs = CorpusService(session)
        ok = await cs.remove_submission("sub_xrem")
        await session.commit()
        assert ok
