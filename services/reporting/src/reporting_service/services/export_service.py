"""Core export orchestration: queue, run, retry, cancel, download."""
from __future__ import annotations

import asyncio
from datetime import timedelta
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from ..common.ids import new_export_id, new_operation_id
from ..common.problem import conflict, not_found
from ..common.time import iso, utcnow
from ..events.envelope import build_envelope
from ..events.producer import EventProducer
from ..exports.builders.base import build_dataset
from ..exports.formats.csv import to_csv
from ..exports.formats.google_sheets import GoogleSheetsClient, sync_to_sheet
from ..exports.formats.json import to_json
from ..exports.formats.pdf import to_pdf
from ..exports.formats.xlsx import to_xlsx
from ..models.reporting import ExportJob
from ..repositories.export_jobs import ExportJobRepo
from ..storage import StorageBackend

CONTENT_TYPE_BY_FORMAT = {
    "csv": "text/csv; charset=utf-8",
    "xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "json": "application/json",
    "pdf": "application/pdf",
    "google_sheets": "application/json",
}


def _filename(job: ExportJob) -> str:
    suffix = {
        "csv": "csv",
        "xlsx": "xlsx",
        "json": "json",
        "pdf": "pdf",
        "google_sheets": "json",
    }.get(job.fmt, "bin")
    base = job.kind
    if (cid := job.scope.get("course_id")):
        base += f"_{cid}"
    elif (aid := job.scope.get("assignment_id")):
        base += f"_{aid}"
    return f"{base}_{job.id}.{suffix}"


def _bucket(settings, tenant_id: str) -> str:
    # S3 / MinIO bucket names allow only lowercase letters, digits and
    # hyphens — NO underscores. Tenant ids look like ``tnt_<hex>`` so a
    # naive ``plaglens-{tenant}`` produces an invalid name. Swap the
    # underscores out (and lowercase, in case anything ever leaks upper).
    safe = tenant_id.replace("_", "-").lower()
    return settings.minio_bucket_template.format(tenant=safe)


def _key(job: ExportJob, filename: str) -> str:
    created = job.created_at or utcnow()
    return f"exports/{created.year:04d}/{created.month:02d}/{job.id}/{filename}"


class ExportService:
    """Orchestrates export job lifecycle.

    Storage and Kafka are accepted as dependencies; running the worker is
    accomplished by ``run_now`` which produces the artifact synchronously
    (but inside an async function), so the API can fire-and-forget via
    ``asyncio.create_task`` and the worker can also be invoked from
    APScheduler/Celery in production.
    """

    def __init__(
        self,
        session_maker: async_sessionmaker,
        storage: StorageBackend,
        producer: EventProducer,
        sheets_client: GoogleSheetsClient,
        settings,
    ):
        self.session_maker = session_maker
        self.storage = storage
        self.producer = producer
        self.sheets_client = sheets_client
        self.settings = settings

    async def create(
        self,
        session: AsyncSession,
        *,
        tenant_id: str,
        triggered_by: str,
        kind: str,
        fmt: str,
        scope: dict[str, Any],
        options: dict[str, Any],
        trace_id: str | None = None,
    ) -> ExportJob:
        repo = ExportJobRepo(session)
        export_id = new_export_id()
        op_id = new_operation_id()
        expiry = utcnow() + timedelta(days=self.settings.artifact_default_ttl_days)
        job = ExportJob(
            id=export_id,
            operation_id=op_id,
            tenant_id=tenant_id,
            kind=kind,
            scope=scope or {},
            fmt=fmt,
            options=options or {},
            status="queued",
            triggered_by=triggered_by,
            expiry_at=expiry,
            created_at=utcnow(),
        )
        await repo.add(job)
        await self.producer.publish(
            "plaglens.reporting.export.v1",
            build_envelope(
                "reporting.export.started.v1",
                tenant_id=tenant_id,
                subject=f"exports/{export_id}",
                data={
                    "export_id": export_id,
                    "operation_id": op_id,
                    "kind": kind,
                    "format": fmt,
                    "scope": scope,
                },
                actor={"type": "user", "id": triggered_by},
                trace_id=trace_id,
            ),
        )
        return job

    async def run_now(
        self, export_id: str, bearer_token: str | None = None
    ) -> None:
        """Worker step: builds dataset, writes artifact, updates status.

        ``bearer_token`` is the triggering user's ``Authorization`` header,
        forwarded so builders that need live cross-service data (the grades
        export reads the course + submission services) can act as that user.
        It is never persisted — it only lives for the duration of this call.
        """
        async with self.session_maker() as session:
            job = await session.get(ExportJob, export_id)
            if job is None or job.status in ("completed", "cancelled"):
                return
            job.status = "running"
            job.started_at = utcnow()
            await session.commit()
            try:
                result = await build_dataset(
                    job.kind,
                    session,
                    job.scope,
                    job.options,
                    bearer_token=bearer_token,
                )
                if job.fmt == "csv":
                    blob, content_type = to_csv(result)
                elif job.fmt == "xlsx":
                    blob, content_type = to_xlsx(result)
                elif job.fmt == "json":
                    blob, content_type = to_json(result)
                elif job.fmt == "pdf":
                    blob, content_type = to_pdf(result)
                elif job.fmt == "google_sheets":
                    spreadsheet_id = str(job.scope.get("spreadsheet_id", "auto-default"))
                    sheet_title = str(job.scope.get("sheet_title") or result.title)[:99]
                    # ``anchor_cell`` lets the teacher pick a destination
                    # via the interactive picker; defaults to A1 for legacy
                    # callers that just pass spreadsheet_id.
                    anchor = str(job.scope.get("anchor_cell") or "A1")
                    # Prefer the triggering teacher's OAuth (their
                    # personal Google connection); fall back to the
                    # admin's tenant SA. Failure = clear runtime error,
                    # not a silent write to an in-memory stub.
                    from .sheets_sa_loader import get_sheets_client_for_user

                    client = await get_sheets_client_for_user(
                        job.tenant_id, job.triggered_by
                    )
                    if client is None:
                        raise RuntimeError(
                            "Google Sheets не подключён в интеграциях — "
                            "запись невозможна."
                        )
                    payload = await sync_to_sheet(
                        client,
                        spreadsheet_id,
                        sheet_title,
                        result,
                        anchor=anchor,
                    )
                    blob, content_type = to_json(result)
                    job.options = {**job.options, "google_sheets_response": payload}
                else:
                    raise ValueError(f"Unsupported format: {job.fmt}")

                bucket = _bucket(self.settings, job.tenant_id)
                fname = _filename(job)
                key = _key(job, fname)
                # Per-tenant buckets are created lazily on the first
                # export — otherwise a fresh tenant's very first export
                # 500s on ``NoSuchBucket``.
                await self.storage.ensure_bucket(bucket)
                await self.storage.put(bucket, key, blob, content_type)
                job.artifact_uri = f"s3://{bucket}/{key}"
                job.artifact_filename = fname
                job.artifact_format = job.fmt
                job.artifact_size_bytes = len(blob)
                job.status = "completed"
                job.finished_at = utcnow()
                await session.commit()
                await self.producer.publish(
                    "plaglens.reporting.export.v1",
                    build_envelope(
                        "reporting.export.completed.v1",
                        tenant_id=job.tenant_id,
                        subject=f"exports/{job.id}",
                        data={
                            "export_id": job.id,
                            "format": job.fmt,
                            "size_bytes": job.artifact_size_bytes,
                        },
                    ),
                )
            except Exception as exc:
                job.status = "failed"
                job.finished_at = utcnow()
                job.error = {"code": "EXPORT_FAILED", "message": str(exc)}
                await session.commit()
                await self.producer.publish(
                    "plaglens.reporting.export.v1",
                    build_envelope(
                        "reporting.export.failed.v1",
                        tenant_id=job.tenant_id,
                        subject=f"exports/{job.id}",
                        data={"export_id": job.id, "error": job.error},
                    ),
                )

    async def retry(self, session: AsyncSession, tenant_id: str, export_id: str) -> ExportJob:
        repo = ExportJobRepo(session)
        job = await repo.get(tenant_id, export_id)
        if job is None:
            raise not_found(f"Export {export_id} not found")
        if job.status not in ("failed", "cancelled"):
            raise conflict("CONFLICT", f"Cannot retry job in status {job.status}")
        job.status = "queued"
        job.error = None
        job.finished_at = None
        await session.flush()
        return job

    async def cancel(self, session: AsyncSession, tenant_id: str, export_id: str) -> ExportJob:
        repo = ExportJobRepo(session)
        job = await repo.get(tenant_id, export_id)
        if job is None:
            raise not_found(f"Export {export_id} not found")
        if job.status in ("completed", "failed"):
            raise conflict("CONFLICT", f"Cannot cancel job in status {job.status}")
        job.status = "cancelled"
        job.finished_at = utcnow()
        await session.flush()
        return job

    async def download(
        self, session: AsyncSession, tenant_id: str, export_id: str
    ) -> dict[str, Any]:
        repo = ExportJobRepo(session)
        job = await repo.get(tenant_id, export_id)
        if job is None:
            raise not_found(f"Export {export_id} not found")
        if job.status != "completed" or not job.artifact_uri:
            raise conflict("CONFLICT", f"Artifact not ready (status={job.status})")
        bucket, _, key = job.artifact_uri.removeprefix("s3://").partition("/")
        url = await self.storage.signed_url(
            bucket, key, ttl_seconds=self.settings.download_signed_url_ttl_seconds
        )
        return {
            "url": url,
            "expires_in": self.settings.download_signed_url_ttl_seconds,
            "filename": job.artifact_filename,
            "content_type": CONTENT_TYPE_BY_FORMAT.get(job.fmt, "application/octet-stream"),
        }

    @staticmethod
    def to_operation(job: ExportJob) -> dict[str, Any]:
        result_url = (
            f"/api/v1/exports/{job.id}/download"
            if job.status == "completed"
            else None
        )
        progress = {
            "completed": job.progress_completed,
            "total": job.progress_total or (1 if job.status == "completed" else 0),
            "percent": 100.0 if job.status == "completed" else 0.0,
        }
        return {
            "id": job.operation_id,
            "kind": "export",
            "status": job.status,
            "progress": progress,
            "started_at": iso(job.started_at) if job.started_at else None,
            "updated_at": iso(job.finished_at or job.started_at or job.created_at),
            "finished_at": iso(job.finished_at) if job.finished_at else None,
            "result_url": result_url,
            "error": job.error,
            "metadata": {
                "export_id": job.id,
                "kind": job.kind,
                "format": job.fmt,
            },
        }

    @staticmethod
    def to_read(job: ExportJob) -> dict[str, Any]:
        return {
            "id": job.id,
            "operation_id": job.operation_id,
            "kind": job.kind,
            "format": job.fmt,
            "status": job.status,
            "scope": job.scope or {},
            "options": job.options or {},
            "artifact_filename": job.artifact_filename,
            "artifact_size_bytes": job.artifact_size_bytes,
            "expiry_at": iso(job.expiry_at) if job.expiry_at else None,
            "triggered_by": job.triggered_by,
            "created_at": iso(job.created_at),
            "started_at": iso(job.started_at) if job.started_at else None,
            "finished_at": iso(job.finished_at) if job.finished_at else None,
            "error": job.error,
        }


async def schedule_run(
    service: ExportService, export_id: str, bearer_token: str | None = None
) -> None:
    """Fire-and-forget worker run."""
    asyncio.create_task(service.run_now(export_id, bearer_token=bearer_token))
