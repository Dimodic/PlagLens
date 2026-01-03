"""Service-level import orchestration tests (no HTTP)."""
from __future__ import annotations

from sqlalchemy.ext.asyncio import async_sessionmaker

from integration_service.common.ids import new_config_id
from integration_service.models import IntegrationConfig
from integration_service.services.imports import enqueue_import, run_import_inline


async def test_enqueue_and_run_inline(engine, bus):
    sm = async_sessionmaker(engine, expire_on_commit=False)
    async with sm() as session:
        cfg = IntegrationConfig(
            id=new_config_id(),
            tenant_id="tnt_x",
            course_id="crs_1",
            kind="manual",
            display_name="m",
            status="active",
            settings={},
            cursor={},
            created_by="u",
        )
        session.add(cfg)
        await session.commit()

    async with sm() as session:
        cfg = (await session.get(IntegrationConfig, cfg.id))
        job = await enqueue_import(session, cfg, {}, "manual", bus=bus)
        await session.commit()

    async with sm() as session:
        cfg = await session.get(IntegrationConfig, cfg.id)
        job = await session.merge(job)
        ran = await run_import_inline(session, cfg, job, bus=bus)
        await session.commit()
    assert ran.status in ("completed", "failed")
