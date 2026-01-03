"""Corpus API smoke tests."""
from __future__ import annotations

from plagiarism_service.services.corpus_service import CorpusService
from tests.conftest import admin_headers


async def test_corpus_stats_admin_only(client):
    resp = await client.get("/api/v1/plagiarism-corpus", headers=admin_headers())
    assert resp.status_code == 200
    body = resp.json()
    assert body["total_entries"] == 0


async def test_corpus_stats_forbidden_for_student(client):
    headers = {
        "X-Dev-User": "usr_s",
        "X-Dev-Tenant": "tnt_test",
        "X-Dev-Role": "student",
    }
    resp = await client.get("/api/v1/plagiarism-corpus", headers=headers)
    assert resp.status_code == 403


async def test_corpus_search_endpoint(client, session_factory):
    async with session_factory() as session:
        cs = CorpusService(session)
        await cs.add_submission(
            tenant_id="tnt_test",
            course_id="crs_a",
            assignment_id="asn_a",
            submission_id="sub_q",
            language="python",
            source="def f(x): return x*2\n" * 30,
        )
        await session.commit()

    resp = await client.post(
        "/api/v1/plagiarism-corpus/search",
        json={"submission_id": "sub_q", "top_k": 5, "min_similarity": 0.0},
        headers=admin_headers(),
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["query_submission_id"] == "sub_q"
