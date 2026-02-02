"""Run orchestration.

Lifecycle:
- ``enqueue_run``        — accepts a run, idempotency-deduped, persists in
  ``queued`` state and emits ``plagiarism.run.queued.v1``.
- ``start_run``          — transitions to ``running``, calls ``provider.submit``,
  emits ``plagiarism.run.started.v1``.
- ``poll_active_runs``   — APScheduler job; poll providers, on completion fetch
  artifacts, parse pairs, save them, emit ``run.completed.v1``.
- ``cancel_run`` / ``retry_run`` mirror the spec.

The orchestrator is intentionally idempotent: every step checks the persisted
state before mutating, so re-running ``poll_active_runs`` is safe.
"""
from __future__ import annotations

import hashlib
import json
from datetime import UTC, datetime
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from ..common.events import (
    EVT_REPORT_PUBLISHED,
    EVT_RUN_COMPLETED,
    EVT_RUN_FAILED,
    EVT_RUN_PROGRESS,
    EVT_RUN_QUEUED,
    EVT_RUN_STARTED,
    EVT_SUSPICIOUS_FLAGGED,
    build_event,
)
from ..common.ids import cluster_id as new_cluster_id
from ..common.ids import pair_id as new_pair_id
from ..common.ids import run_id as new_run_id
from ..common.logging import get_logger
from ..config import settings
from ..events.producer import EventProducer
from ..models.plagiarism import PlagiarismCluster, PlagiarismPair, PlagiarismRun
from ..providers import (
    PlagiarismProvider,
    ProviderArtifact,
    SubmissionFile,
    SubmissionItem,
    SubmissionSet,
    get_provider,
)
from ..providers.base import ResultPair
from ..repositories.corpus_repo import CorpusRepository
from ..repositories.pair_repo import PairRepository
from ..repositories.run_repo import RunRepository
from ..storage.artifact_store import ArtifactStore, get_artifact_store, make_uri
from .corpus_service import CorpusService, fingerprint
from .submission_fetcher import SubmissionFetcher, get_submission_fetcher
from .suspicious_service import SuspiciousService, threshold_from_options

log = get_logger(__name__)


def _hash_dict(value: dict[str, Any] | None) -> str:
    raw = json.dumps(value or {}, sort_keys=True, separators=(",", ":")).encode()
    return hashlib.sha256(raw).hexdigest()


class Orchestrator:
    def __init__(
        self,
        *,
        session_factory: async_sessionmaker[AsyncSession],
        producer: EventProducer | None = None,
        artifact_store: ArtifactStore | None = None,
        submission_fetcher: SubmissionFetcher | None = None,
    ) -> None:
        self.session_factory = session_factory
        self.producer = producer
        self.artifact_store = artifact_store or get_artifact_store()
        self.submission_fetcher = submission_fetcher or get_submission_fetcher()

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------
    async def enqueue_run(
        self,
        *,
        tenant_id: str,
        course_id: str | None,
        assignment_id: str | None,
        provider_name: str,
        scope: dict[str, Any],
        options: dict[str, Any],
        triggered_by: str | None,
        trigger: str = "manual",
    ) -> tuple[PlagiarismRun, bool]:
        """Returns (run, idempotent_hit).

        Idempotency lookup order:
          1. queued/running run with the same (scope_hash, options_hash)
             → reuse it (don't double-queue while one is in flight)
          2. completed run with the same hashes
             → reuse it (no submissions changed since last time)
          3. otherwise → create a new queued run

        ``submission_ids`` are normalised (sorted) inside the scope dict
        before hashing so that callers passing the same set in a
        different order map to the same hash.
        """
        scope = dict(scope or {})
        if isinstance(scope.get("submission_ids"), list):
            scope["submission_ids"] = sorted(scope["submission_ids"])
        scope_h = _hash_dict(scope)
        opts_h = _hash_dict(options)
        async with self.session_factory() as session:
            repo = RunRepository(session)
            existing = await repo.find_pending_idempotent(
                tenant_id=tenant_id,
                assignment_id=assignment_id,
                scope_hash=scope_h,
                options_hash=opts_h,
            )
            if existing is not None:
                return existing, True
            # Same scope as a previously-completed run? Hand that one
            # back — no submissions changed, no point re-running JPlag.
            done = await repo.find_completed_idempotent(
                tenant_id=tenant_id,
                assignment_id=assignment_id,
                scope_hash=scope_h,
                options_hash=opts_h,
            )
            if done is not None:
                return done, True
            run = PlagiarismRun(
                id=new_run_id(),
                tenant_id=tenant_id,
                course_id=course_id,
                assignment_id=assignment_id,
                provider=provider_name,
                scope=scope,
                trigger=trigger,
                status="queued",
                options=options,
                scope_hash=scope_h,
                options_hash=opts_h,
                triggered_by=triggered_by,
            )
            await repo.create(run)
            await session.commit()
        await self._emit(
            EVT_RUN_QUEUED,
            tenant_id=tenant_id,
            subject=f"plagiarism-runs/{run.id}",
            data={
                "run_id": run.id,
                "assignment_id": assignment_id,
                "provider": provider_name,
                "trigger": trigger,
            },
        )
        return run, False

    async def start_queued_run(self, run_id: str) -> bool:
        """Fetch submission files from Submission Service and start the run.

        Used by the scheduler (or webhook) when no caller has explicitly
        provided items. The submission ids come from ``run.scope.submission_ids``
        (set by the API layer when the request is queued). If the scope does
        not list any submissions, the run is failed with ``EMPTY_SCOPE``.
        """
        async with self.session_factory() as session:
            repo = RunRepository(session)
            run = await repo.get(run_id)
            if run is None or run.status != "queued":
                return False
            tenant_id = run.tenant_id
            scope = run.scope or {}
            submission_ids = list(scope.get("submission_ids") or [])
            language = (run.options or {}).get("language") or scope.get("language")

        if not submission_ids:
            await self._mark_failed(
                run_id, "no submission_ids in scope; provide them via the API"
            )
            return False
        try:
            items = await self.submission_fetcher.fetch_items(
                tenant_id=tenant_id, submission_ids=submission_ids
            )
        except Exception as exc:  # noqa: BLE001
            await self._mark_failed(run_id, f"submission fetch failed: {exc}")
            return False
        if not items:
            await self._mark_failed(run_id, "no submissions returned by Submission Service")
            return False
        return await self.start_run(run_id=run_id, items=items, language=language)

    async def start_run(
        self,
        *,
        run_id: str,
        items: list[SubmissionItem],
        language: str | None = None,
    ) -> bool:
        """Mark run as running and submit to the provider. Returns True on success."""
        async with self.session_factory() as session:
            repo = RunRepository(session)
            run = await repo.get(run_id)
            if run is None or run.status != "queued":
                return False
            provider = self._provider(run.provider)
            run.status = "running"
            run.started_at = datetime.now(UTC)
            run.submissions_count = len(items)
            # Stash submission_id → author info so _finalize can hydrate
            # PlagiarismPair.a_author_display_name / b_author_display_name
            # without re-fetching everything from submission-service. The
            # cluster map otherwise renders raw ``sub_xxx`` IDs as node
            # labels (the user can't tell who's who).
            scope = dict(run.scope or {})
            scope["author_map"] = {
                it.submission_id: {
                    "id": it.author_id,
                    "name": it.author_display_name,
                }
                for it in items
                if it.submission_id
            }
            run.scope = scope
            await session.commit()
            tenant_id = run.tenant_id

        # Optionally augment with cross-course corpus candidates.
        with_corpus = bool((run.scope or {}).get("with_corpus") if run else False)
        items_to_submit = list(items)
        if with_corpus and items:
            items_to_submit = await self._extend_with_corpus(
                tenant_id=tenant_id, items=items, language=language
            )

        try:
            provider_run_id = await provider.submit(
                SubmissionSet(
                    run_id=run_id,
                    tenant_id=tenant_id,
                    language=language,
                    options=run.options,
                    items=items_to_submit,
                )
            )
        except Exception as exc:  # noqa: BLE001
            await self._mark_failed(run_id, str(exc))
            return False

        async with self.session_factory() as session:
            repo = RunRepository(session)
            await repo.update(run_id, provider_run_id=str(provider_run_id))
            await session.commit()

        await self._emit(
            EVT_RUN_STARTED,
            tenant_id=tenant_id,
            subject=f"plagiarism-runs/{run_id}",
            data={"run_id": run_id, "provider": run.provider},
        )
        return True

    async def poll_active_runs(self) -> int:
        """APScheduler job: poll all queued/running runs once. Returns count handled."""
        handled = 0
        async with self.session_factory() as session:
            repo = RunRepository(session)
            runs = await repo.active(limit=200)
        for run in runs:
            if run.status == "queued":
                # Try to start any queued run that has explicit submission_ids
                # in its scope. Tests pass items in directly via start_run, so
                # we only auto-start if the scope opts in.
                scope = run.scope or {}
                if scope.get("submission_ids"):
                    try:
                        ok = await self.start_queued_run(run.id)
                        if ok:
                            handled += 1
                    except Exception as exc:  # noqa: BLE001
                        log.error("queued_start_failed", run_id=run.id, error=str(exc))
                        await self._mark_failed(run.id, f"start error: {exc}")
                continue
            if run.status == "running" and run.provider_run_id:
                try:
                    await self._poll_one(run)
                except Exception as exc:  # noqa: BLE001
                    log.error("poll_failed", run_id=run.id, error=str(exc))
                    await self._mark_failed(run.id, f"poll error: {exc}")
                handled += 1
        return handled

    async def cancel_run(self, run_id: str, *, by: str | None = None) -> bool:
        async with self.session_factory() as session:
            repo = RunRepository(session)
            run = await repo.get(run_id)
            if run is None or run.status not in ("queued", "running"):
                return False
            tenant_id = run.tenant_id
            provider = self._provider(run.provider)
            try:
                if run.provider_run_id:
                    await provider.cancel(run.provider_run_id)
            except Exception as exc:  # noqa: BLE001
                log.warning("provider_cancel_failed", run_id=run_id, error=str(exc))
            run.status = "cancelled"
            run.finished_at = datetime.now(UTC)
            run.error = {"code": "CANCELLED", "by": by or "unknown"}
            await session.commit()
        await self._emit(
            EVT_RUN_FAILED,
            tenant_id=tenant_id,
            subject=f"plagiarism-runs/{run_id}",
            data={"run_id": run_id, "status": "cancelled", "by": by},
        )
        return True

    async def retry_run(self, run_id: str) -> PlagiarismRun | None:
        async with self.session_factory() as session:
            repo = RunRepository(session)
            run = await repo.get(run_id)
            if run is None or run.status != "failed":
                return None
            new_run = PlagiarismRun(
                id=new_run_id(),
                tenant_id=run.tenant_id,
                course_id=run.course_id,
                assignment_id=run.assignment_id,
                provider=run.provider,
                scope=run.scope,
                trigger="retry",
                status="queued",
                options=run.options,
                scope_hash=run.scope_hash,
                options_hash=run.options_hash,
                triggered_by=run.triggered_by,
            )
            await repo.create(new_run)
            await session.commit()
        await self._emit(
            EVT_RUN_QUEUED,
            tenant_id=new_run.tenant_id,
            subject=f"plagiarism-runs/{new_run.id}",
            data={"run_id": new_run.id, "retried_from": run_id, "trigger": "retry"},
        )
        return new_run

    # ------------------------------------------------------------------
    # Internals
    # ------------------------------------------------------------------
    def _provider(self, name: str) -> PlagiarismProvider:
        return get_provider(name)

    async def _mark_failed(self, run_id: str, error: str) -> None:
        async with self.session_factory() as session:
            repo = RunRepository(session)
            run = await repo.get(run_id)
            if run is None:
                return
            run.status = "failed"
            run.finished_at = datetime.now(UTC)
            run.error = {"code": "RUN_FAILED", "detail": error}
            await session.commit()
            tenant_id = run.tenant_id
        await self._emit(
            EVT_RUN_FAILED,
            tenant_id=tenant_id,
            subject=f"plagiarism-runs/{run_id}",
            data={"run_id": run_id, "error": error},
        )

    async def _poll_one(self, run: PlagiarismRun) -> None:
        provider = self._provider(run.provider)
        result = await provider.poll(run.provider_run_id)
        if result.status == "running":
            if result.progress_percent is not None:
                await self._emit(
                    EVT_RUN_PROGRESS,
                    tenant_id=run.tenant_id,
                    subject=f"plagiarism-runs/{run.id}",
                    data={"run_id": run.id, "progress": result.progress_percent},
                )
            return
        if result.status in ("failed", "cancelled"):
            await self._mark_failed(run.id, result.error or result.status)
            return
        # completed
        await self._finalize(run, result.pairs, result.clusters)

    async def _finalize(
        self,
        run: PlagiarismRun,
        pairs: list[ResultPair],
        clusters: list[Any],
    ) -> None:
        # Save pairs / clusters, emit run.completed and report.published.
        threshold = threshold_from_options(run.options)
        # Rebuild submission_id → (author_id, display_name) map from the
        # snapshot we stashed in scope at start time. This is what makes
        # the pair rows carry real student names (rather than ``sub_xxx``
        # IDs that nobody can read).
        author_map = (run.scope or {}).get("author_map") or {}
        async with self.session_factory() as session:
            run_repo = RunRepository(session)
            pair_repo = PairRepository(session)
            db_pairs: list[PlagiarismPair] = []
            for rp in pairs:
                a_info = author_map.get(rp.a_submission_id) or {}
                b_info = author_map.get(rp.b_submission_id) or {}
                db_pair = PlagiarismPair(
                    id=new_pair_id(),
                    run_id=run.id,
                    tenant_id=run.tenant_id,
                    a_submission_id=rp.a_submission_id,
                    b_submission_id=rp.b_submission_id,
                    a_author_id=a_info.get("id"),
                    a_author_display_name=a_info.get("name"),
                    b_author_id=b_info.get("id"),
                    b_author_display_name=b_info.get("name"),
                    similarity=float(rp.similarity),
                    matched_tokens=int(rp.matched_tokens),
                    fragments=[
                        {
                            "a_file": fr.a_file,
                            "a_start_line": fr.a_start_line,
                            "a_end_line": fr.a_end_line,
                            "a_content": fr.a_content or "",
                            "b_file": fr.b_file,
                            "b_start_line": fr.b_start_line,
                            "b_end_line": fr.b_end_line,
                            "b_content": fr.b_content or "",
                        }
                        for fr in rp.fragments
                    ],
                )
                db_pairs.append(db_pair)
            await pair_repo.add_many(db_pairs)
            # Cluster IDs must be globally unique — the previous
            # ``clu_{i:08x}`` scheme restarted from 0 for every run and
            # collided with prior runs' rows (pk_plagiarism_clusters
            # IntegrityError on the second JPlag run). Use the same
            # time-prefixed random id generator as runs/pairs.
            db_clusters = [
                PlagiarismCluster(
                    id=new_cluster_id(),
                    run_id=run.id,
                    tenant_id=run.tenant_id,
                    members=list(c.members),
                    avg_similarity=float(c.avg_similarity),
                    dominant_language=c.dominant_language,
                )
                for c in clusters
            ]
            await run_repo.add_clusters(db_clusters)

            # auto-flag
            susp = SuspiciousService(session)
            flags_created, suspect_pairs = await susp.auto_flag_pairs(
                tenant_id=run.tenant_id,
                run_id=run.id,
                pairs=db_pairs,
                threshold=threshold,
            )

            max_sim = max((p.similarity for p in db_pairs), default=None)
            await run_repo.update(
                run.id,
                status="completed",
                finished_at=datetime.now(UTC),
                pairs_total=len(db_pairs),
                pairs_suspected=suspect_pairs,
                max_similarity=max_sim,
            )
            await session.commit()

        # Persist artifacts (best-effort).
        signed_archive_url: str | None = None
        try:
            provider = self._provider(run.provider)
            uris: dict[str, str] = {}
            stored_keys: dict[str, tuple[str, str]] = {}
            for kind in ("html", "json", "archive"):
                try:
                    art: ProviderArtifact = await provider.fetch_artifact(
                        run.provider_run_id, kind
                    )
                except Exception as exc:  # noqa: BLE001
                    log.warning(
                        "artifact_fetch_failed",
                        run_id=run.id,
                        kind=kind,
                        error=str(exc),
                    )
                    continue
                if not art.content:
                    continue
                stored = await self.artifact_store.put(
                    tenant_id=run.tenant_id,
                    run_id=run.id,
                    kind=kind,
                    data=art.content,
                    content_type=art.content_type,
                    filename=art.filename,
                )
                uris[kind] = make_uri(stored.bucket, stored.key)
                stored_keys[kind] = (stored.bucket, stored.key)
            if uris:
                async with self.session_factory() as session:
                    run_repo = RunRepository(session)
                    await run_repo.update(
                        run.id,
                        artifact_html_uri=uris.get("html"),
                        artifact_json_uri=uris.get("json"),
                        artifact_archive_uri=uris.get("archive"),
                    )
                    await session.commit()
            # Sign the archive URL with a short TTL (default 5 min, per spec
            # §10) so the orchestrator's ``run.completed`` event carries a
            # consumable link.
            if "archive" in stored_keys:
                bucket, key = stored_keys["archive"]
                try:
                    signed_archive_url = await self.artifact_store.signed_url(
                        bucket=bucket, key=key, ttl_seconds=300
                    )
                except Exception as exc:  # noqa: BLE001
                    log.warning("signed_url_failed", run_id=run.id, error=str(exc))
        except Exception as exc:  # noqa: BLE001
            log.warning("artifact_persist_failed", run_id=run.id, error=str(exc))

        # Emit lifecycle events.
        completed_data: dict[str, Any] = {
            "run_id": run.id,
            "assignment_id": run.assignment_id,
            "pairs_total": len(db_pairs),
            "pairs_suspected": flags_created // 2,
            "max_similarity": max_sim,
        }
        if signed_archive_url:
            # 5-minute pre-signed URL; consumers must download promptly.
            completed_data["archive_signed_url"] = signed_archive_url
            completed_data["archive_ttl_seconds"] = 300
        await self._emit(
            EVT_RUN_COMPLETED,
            tenant_id=run.tenant_id,
            subject=f"plagiarism-runs/{run.id}",
            data=completed_data,
        )
        await self._emit(
            EVT_REPORT_PUBLISHED,
            tenant_id=run.tenant_id,
            subject=f"plagiarism-runs/{run.id}",
            data={
                "run_id": run.id,
                "provider": run.provider,
                "archive_signed_url": signed_archive_url,
            },
        )
        if suspect_pairs:
            await self._emit(
                EVT_SUSPICIOUS_FLAGGED,
                tenant_id=run.tenant_id,
                subject=f"plagiarism-runs/{run.id}",
                data={
                    "run_id": run.id,
                    "suspect_pairs": suspect_pairs,
                    "threshold": threshold,
                },
            )

    async def _extend_with_corpus(
        self,
        *,
        tenant_id: str,
        items: list[SubmissionItem],
        language: str | None,
    ) -> list[SubmissionItem]:
        async with self.session_factory() as session:
            corpus_repo = CorpusRepository(session)
            cs = CorpusService(session)
            existing_ids = {it.submission_id for it in items}
            extended = list(items)
            for it in items:
                src = "\n".join(f.content for f in it.files)
                if not src:
                    continue
                fp, _tokens = fingerprint(src, k=settings.corpus_shingle_size)
                hits = await cs.search_similar(
                    tenant_id=tenant_id,
                    query_fingerprint=fp,
                    language=language,
                    top_k=settings.corpus_top_k_candidates,
                    min_similarity=0.2,
                    exclude_submission_ids=existing_ids,
                )
                for entry, _sim in hits:
                    if entry.submission_id in existing_ids:
                        continue
                    existing_ids.add(entry.submission_id)
                    # We don't have the source text in CorpusEntry, only fingerprints.
                    # Add a placeholder with the fingerprint as a "content" hint —
                    # provider-side uses the fingerprints implicitly via shingle reconstruction.
                    extended.append(
                        SubmissionItem(
                            submission_id=entry.submission_id,
                            author_id=None,
                            author_display_name=None,
                            course_id=entry.course_id,
                            assignment_id=entry.assignment_id,
                            language=entry.language,
                            files=[SubmissionFile(path=f"corpus/{entry.id}.bin", content="")],
                            is_corpus=True,
                            cross_course=entry.course_id is not None
                            and entry.course_id not in {it2.course_id for it2 in items if it2.course_id},
                            cross_assignment=entry.assignment_id is not None
                            and entry.assignment_id not in {
                                it2.assignment_id for it2 in items if it2.assignment_id
                            },
                        )
                    )
            await corpus_repo  # keep ref alive
        return extended

    async def _emit(
        self,
        type_: str,
        *,
        tenant_id: str,
        subject: str | None,
        data: dict[str, Any],
    ) -> None:
        if self.producer is None:
            return
        try:
            ev = build_event(type_, tenant_id=tenant_id, subject=subject, data=data)
            await self.producer.publish(settings.kafka_topic_run, ev)
        except Exception as exc:  # noqa: BLE001
            log.warning("event_publish_failed", type=type_, error=str(exc))
