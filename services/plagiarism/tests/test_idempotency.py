"""Idempotency store + run-level idempotent dedup."""
from __future__ import annotations

from plagiarism_service.common.idempotency import IdempotencyStore
from plagiarism_service.events.producer import NullEventProducer
from plagiarism_service.services.orchestrator import Orchestrator


async def test_store_with_fakeredis(fakeredis_store):
    store = fakeredis_store
    body = {"a": 1}
    h = IdempotencyStore.hash_body(body)
    await store.set("k1", h, {"ok": True})
    got = await store.get("k1")
    assert got == (h, {"ok": True})


async def test_orchestrator_dedup_pending(session_factory):
    orch = Orchestrator(session_factory=session_factory, producer=NullEventProducer())
    r1, replay1 = await orch.enqueue_run(
        tenant_id="tnt_t",
        course_id="crs_t",
        assignment_id="asn_t",
        provider_name="dolos",
        scope={"assignment_ids": ["asn_t"]},
        options={"min_tokens": 9},
        triggered_by="usr_admin",
    )
    r2, replay2 = await orch.enqueue_run(
        tenant_id="tnt_t",
        course_id="crs_t",
        assignment_id="asn_t",
        provider_name="dolos",
        scope={"assignment_ids": ["asn_t"]},
        options={"min_tokens": 9},
        triggered_by="usr_admin",
    )
    assert r1.id == r2.id
    assert not replay1
    assert replay2
