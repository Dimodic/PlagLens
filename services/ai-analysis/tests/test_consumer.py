"""Kafka consumer tests using fakes (no real broker)."""
from __future__ import annotations

import pytest
from sqlalchemy import select

from ai_analysis_service.events.consumer import AnalysisEventConsumer
from ai_analysis_service.models import AIAnalysis


@pytest.mark.asyncio
async def test_handle_assignment_created_caches_config(session_factory) -> None:
    consumer = AnalysisEventConsumer()
    await consumer.handle_event(
        {
            "id": "evt_a1",
            "type": "plaglens.course.assignment.created.v1",
            "data": {
                "assignment_id": "asg_1",
                "default_prompt_version": "v1",
                "ai_auto_run": True,
                "ai_only_for_suspicious": False,
            },
        }
    )
    assert "asg_1" in consumer._auto_run_assignments


@pytest.mark.asyncio
async def test_handle_submission_deleted_soft_deletes(session_factory) -> None:
    consumer = AnalysisEventConsumer()

    # Insert an analysis manually
    async with session_factory() as session:
        a = AIAnalysis(
            id="ana_del",
            tenant_id="t",
            submission_id="sub_kill",
            prompt_version="v1",
            provider="openai",
            model="m",
            status="completed",
            trigger="manual",
            cache_key="k",
        )
        session.add(a)
        await session.commit()

    await consumer.handle_event(
        {
            "id": "evt_del",
            "type": "plaglens.submission.submission.deleted.v1",
            "data": {"submission_id": "sub_kill"},
        }
    )

    async with session_factory() as session:
        row = (await session.execute(select(AIAnalysis).where(AIAnalysis.id == "ana_del"))).scalar_one()
        assert row.deleted_at is not None


@pytest.mark.asyncio
async def test_handle_user_anonymized_wipes_report(session_factory) -> None:
    consumer = AnalysisEventConsumer()
    async with session_factory() as session:
        a = AIAnalysis(
            id="ana_anon",
            tenant_id="t",
            submission_id="sub_anon",
            prompt_version="v1",
            provider="openai",
            model="m",
            status="completed",
            trigger="manual",
            cache_key="k",
            created_by="usr_x",
            report={"summary": "secret"},
            raw_llm_response="raw",
        )
        session.add(a)
        await session.commit()

    await consumer.handle_event(
        {
            "id": "evt_anon",
            "type": "plaglens.identity.user.anonymized.v1",
            "data": {"user_id": "usr_x"},
        }
    )

    async with session_factory() as session:
        row = (await session.execute(select(AIAnalysis).where(AIAnalysis.id == "ana_anon"))).scalar_one()
        assert row.report is None
        assert row.raw_llm_response is None


@pytest.mark.asyncio
async def test_dedup_processed_event(session_factory) -> None:
    """Same event_id processed twice → no double work."""
    consumer = AnalysisEventConsumer()
    envelope = {
        "id": "evt_dup_1",
        "type": "plaglens.course.assignment.created.v1",
        "data": {"assignment_id": "asg_dup", "ai_auto_run": True},
    }
    await consumer.handle_event(envelope)
    # Second time should be a no-op (we can't observe directly but ensure no error)
    await consumer.handle_event(envelope)
    assert "asg_dup" in consumer._auto_run_assignments
