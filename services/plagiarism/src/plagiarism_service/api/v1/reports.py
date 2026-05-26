"""§B — report, pairs, clusters, artifacts."""
from __future__ import annotations

import difflib
from typing import Any

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from ...common.pagination import PageInfo, decode_cursor, encode_cursor
from ...common.problem import not_found
from ...common.rbac import Principal, assert_course_role, assert_tenant
from ...repositories.pair_repo import PairRepository
from ...repositories.run_repo import RunRepository
from ...schemas.common import AuthorRef
from ...schemas.runs import (
    ClusterDetail,
    ClusterListItem,
    PairDetail,
    PairFragment,
    PairListItem,
    RunReport,
    RunSummary,
)
from ...storage.artifact_store import ArtifactStore, parse_uri
from ..deps import get_db, get_principal_dep, get_store

router = APIRouter(tags=["reports"])


@router.get("/plagiarism-runs/{run_id}/report", response_model=RunReport)
async def get_report(
    run_id: str,
    principal: Principal = Depends(get_principal_dep),
    db: AsyncSession = Depends(get_db),
) -> RunReport:
    run_repo = RunRepository(db)
    run = await run_repo.get_for_tenant(run_id, principal.tenant_id)
    if run is None:
        raise not_found(f"Run {run_id} not found")
    assert_course_role(principal, run.course_id, ("owner", "co_owner", "assistant"))

    pair_repo = PairRepository(db)
    pairs = await pair_repo.list_by_run(
        run_id=run_id, tenant_id=run.tenant_id, limit=200
    )
    clusters = await run_repo.list_clusters(run_id)

    mean_sim = (
        sum(p.similarity for p in pairs) / len(pairs) if pairs else None
    )
    summary = RunSummary(
        max_similarity=run.max_similarity,
        mean_similarity=mean_sim,
        pairs_total=run.pairs_total,
        pairs_suspected=run.pairs_suspected,
        clusters_count=len(clusters),
        languages={},
    )
    return RunReport(
        run_id=run.id,
        assignment_id=run.assignment_id,
        provider=run.provider,
        status=run.status,  # type: ignore[arg-type]
        submissions_count=run.submissions_count,
        summary=summary,
        started_at=run.started_at,
        finished_at=run.finished_at,
        options_used=run.options or {},
        artifacts={
            "html_url": (
                f"/api/v1/plagiarism-runs/{run.id}/artifacts/html"
                if run.artifact_html_uri
                else None
            ),
            "json_url": (
                f"/api/v1/plagiarism-runs/{run.id}/artifacts/json"
                if run.artifact_json_uri
                else None
            ),
            "archive_url": (
                f"/api/v1/plagiarism-runs/{run.id}/artifacts/archive"
                if run.artifact_archive_uri
                else None
            ),
        },
    )


@router.get("/plagiarism-runs/{run_id}/pairs")
async def list_pairs(
    run_id: str,
    cursor: str | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=200),
    min_similarity: float | None = Query(default=None),
    cross_course: bool | None = Query(default=None),
    sort: str | None = Query(default=None),
    principal: Principal = Depends(get_principal_dep),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    run_repo = RunRepository(db)
    run = await run_repo.get_for_tenant(run_id, principal.tenant_id)
    if run is None:
        raise not_found(f"Run {run_id} not found")
    assert_course_role(principal, run.course_id, ("owner", "co_owner", "assistant"))

    parsed = decode_cursor(cursor)
    pair_repo = PairRepository(db)
    rows = await pair_repo.list_by_run(
        run_id=run_id,
        tenant_id=run.tenant_id,
        limit=limit,
        cursor_id=parsed.get("id") if parsed else None,
        min_similarity=min_similarity,
        cross_course=cross_course,
        sort=sort,
    )
    has_more = len(rows) > limit
    rows = rows[:limit]
    next_cursor = encode_cursor({"id": rows[-1].id}) if has_more and rows else None
    items = [
        PairListItem(
            id=p.id,
            a_submission_id=p.a_submission_id,
            b_submission_id=p.b_submission_id,
            a_author={"id": p.a_author_id, "display_name": p.a_author_display_name},
            b_author={"id": p.b_author_id, "display_name": p.b_author_display_name},
            similarity=p.similarity,
            matched_tokens=p.matched_tokens,
            fragments_count=len(p.fragments or []),
            cross_course=bool(p.cross_course),
            cross_assignment=bool(p.cross_assignment),
            evidence_url=f"/api/v1/plagiarism-runs/{run_id}/pairs/{p.id}",
        ).model_dump()
        for p in rows
    ]
    return {
        "data": items,
        "pagination": PageInfo(next_cursor=next_cursor, has_more=has_more, limit=limit).model_dump(),
    }


def _slice_lines(text: str, start: int, end: int) -> str:
    """Return inclusive 1-indexed line range from ``text``.

    Dolos fragments carry start/end lines but no content. We fetch the
    original submission file at pair-detail time and slice here so the
    side-by-side diff actually has code to render."""
    if not text or start <= 0 or end < start:
        return ""
    lines = text.split("\n")
    return "\n".join(lines[start - 1 : end])


@router.get("/plagiarism-runs/{run_id}/pairs/{pair_id}", response_model=PairDetail)
async def get_pair(
    run_id: str,
    pair_id: str,
    principal: Principal = Depends(get_principal_dep),
    db: AsyncSession = Depends(get_db),
) -> PairDetail:
    run_repo = RunRepository(db)
    run = await run_repo.get_for_tenant(run_id, principal.tenant_id)
    if run is None:
        raise not_found(f"Run {run_id} not found")
    assert_course_role(principal, run.course_id, ("owner", "co_owner", "assistant"))

    pair_repo = PairRepository(db)
    pair = await pair_repo.get(pair_id)
    if pair is None or pair.run_id != run_id:
        raise not_found(f"Pair {pair_id} not found")
    assert_tenant(principal, pair.tenant_id)
    raw_fragments = list(pair.fragments or [])

    # We *always* fetch the source files for both submissions: the
    # frontend needs the FULL file (incl. the trailing ``}`` of main
    # and surrounding helpers) to render the side-by-side diff with
    # Dolos match ranges as overlays. Only the fragment-snippet
    # hydration ("a_content"/"b_content" on each fragment) is skipped
    # when those fields already have data — that part is just for
    # back-compat with older clients that read the fragment snippets
    # directly.
    needs_fragment_hydrate = bool(raw_fragments) and not any(
        fr.get("a_content") or fr.get("b_content") for fr in raw_fragments
    )
    a_lang: str | None = None
    b_lang: str | None = None
    _a_full: str | None = None
    _b_full: str | None = None
    if raw_fragments:
        from ...services.submission_fetcher import get_submission_fetcher

        fetcher = get_submission_fetcher()
        try:
            a_item = await fetcher.fetch_one(
                tenant_id=pair.tenant_id, submission_id=pair.a_submission_id
            )
            b_item = await fetcher.fetch_one(
                tenant_id=pair.tenant_id, submission_id=pair.b_submission_id
            )
        except Exception:
            a_item = None
            b_item = None
        a_files = (
            {f.path: f.content for f in a_item.files} if a_item else {}
        )
        b_files = (
            {f.path: f.content for f in b_item.files} if b_item else {}
        )
        a_lang = a_item.language if a_item else None
        b_lang = b_item.language if b_item else None
        # Helper: tolerate the file-name mismatch between Dolos (which
        # reports the path relative to the submission folder it saw)
        # and submission service (which may carry a different leading
        # segment). Fall back to first file content if exact match
        # misses — most submissions have just one file anyway.
        def _resolve(files: dict[str, str], wanted: str | None) -> str:
            if not files:
                return ""
            if wanted and wanted in files:
                return files[wanted]
            if wanted:
                # match by basename
                base = wanted.rsplit("/", 1)[-1]
                for k, v in files.items():
                    if k.rsplit("/", 1)[-1] == base:
                        return v
            # one-file submission fallback
            return next(iter(files.values()), "")

        # Stash the FULL files used by the matches so the frontend can
        # render the complete source (closing braces and all) with
        # highlights overlaid — Dolos's match ranges typically stop at
        # the last matched token, so a diff that renders only fragment
        # content is missing the final ``}`` of ``main`` and looks cut
        # off to the grader. (Variables declared at function scope above
        # so they survive the no-hydrate branch.)
        for fr in raw_fragments:
            a_full = _resolve(a_files, fr.get("a_file"))
            b_full = _resolve(b_files, fr.get("b_file"))
            if _a_full is None and a_full:
                _a_full = a_full
            if _b_full is None and b_full:
                _b_full = b_full
            # Per-fragment snippets — only fill when missing (older
            # clients consume these instead of the full submission).
            if needs_fragment_hydrate and not fr.get("a_content"):
                fr["a_content"] = _slice_lines(
                    a_full,
                    int(fr.get("a_start_line") or 0),
                    int(fr.get("a_end_line") or 0),
                )
            if needs_fragment_hydrate and not fr.get("b_content"):
                fr["b_content"] = _slice_lines(
                    b_full,
                    int(fr.get("b_start_line") or 0),
                    int(fr.get("b_end_line") or 0),
                )

    fragments = [PairFragment(**fr) for fr in raw_fragments]
    return PairDetail(
        id=pair.id,
        run_id=run_id,
        similarity=pair.similarity,
        matched_tokens=pair.matched_tokens,
        fragments=fragments,
        submissions={
            "a": {
                "id": pair.a_submission_id,
                "language": a_lang,
                # Full source so the diff can show the whole file with
                # match ranges as overlays — not a fragment-only snippet
                # that drops the closing brace of ``main``.
                "content": _a_full or "",
                "author": {
                    "id": pair.a_author_id,
                    "display_name": pair.a_author_display_name,
                },
            },
            "b": {
                "id": pair.b_submission_id,
                "language": b_lang,
                "content": _b_full or "",
                "author": {
                    "id": pair.b_author_id,
                    "display_name": pair.b_author_display_name,
                },
            },
        },
    )


@router.get("/plagiarism-runs/{run_id}/pairs/{pair_id}/diff")
async def get_pair_diff(
    run_id: str,
    pair_id: str,
    principal: Principal = Depends(get_principal_dep),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    run_repo = RunRepository(db)
    run = await run_repo.get_for_tenant(run_id, principal.tenant_id)
    if run is None:
        raise not_found(f"Run {run_id} not found")
    assert_course_role(principal, run.course_id, ("owner", "co_owner", "assistant"))
    pair_repo = PairRepository(db)
    pair = await pair_repo.get(pair_id)
    if pair is None or pair.run_id != run_id:
        raise not_found(f"Pair {pair_id} not found")
    assert_tenant(principal, pair.tenant_id)
    diffs: list[dict[str, Any]] = []
    for fr in (pair.fragments or []):
        a_text = (fr.get("a_content") or "").splitlines()
        b_text = (fr.get("b_content") or "").splitlines()
        unified = list(
            difflib.unified_diff(
                a_text,
                b_text,
                fromfile=fr.get("a_file", "a"),
                tofile=fr.get("b_file", "b"),
                n=3,
                lineterm="",
            )
        )
        diffs.append(
            {
                "a_file": fr.get("a_file"),
                "b_file": fr.get("b_file"),
                "a_lines": [fr.get("a_start_line"), fr.get("a_end_line")],
                "b_lines": [fr.get("b_start_line"), fr.get("b_end_line")],
                "diff": unified,
            }
        )
    return {"pair_id": pair_id, "fragments": diffs}


@router.get("/plagiarism-runs/{run_id}/clusters")
async def list_clusters(
    run_id: str,
    principal: Principal = Depends(get_principal_dep),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    repo = RunRepository(db)
    run = await repo.get_for_tenant(run_id, principal.tenant_id)
    if run is None:
        raise not_found(f"Run {run_id} not found")
    assert_course_role(principal, run.course_id, ("owner", "co_owner", "assistant"))
    clusters = await repo.list_clusters(run_id)
    # ``author_map`` was snapshotted into run.scope at start time as
    # ``{submission_id: {id, name}}`` — reuse it to resolve cluster
    # member identities so the UI shows real names, not ``sub_xxx``.
    author_map = (run.scope or {}).get("author_map") or {}
    # Cluster avg similarity is recomputed from the actual pairs rather
    # than trusting the value Dolos wrote at finalize time — older runs
    # have it stored as 0 (the parser was reading the wrong overview.json
    # key), and recomputing keeps the number honest regardless.
    pair_sim = await _pair_similarity_map(db, run_id, principal.tenant_id)
    # Compute the honest avg per cluster, then:
    #   • drop noise clusters (avg < 5%) — Dolos's clustering is eager
    #     and produces "everyone weakly touches everyone" groups that
    #     carry no signal and just clutter the list + map.
    #   • sort by avg desc so the strongest match sits on top.
    scored = [
        (
            _cluster_avg_similarity(
                list(c.members), pair_sim, fallback=c.avg_similarity
            ),
            c,
        )
        for c in clusters
    ]
    scored = [(avg, c) for (avg, c) in scored if avg >= 0.05]
    scored.sort(key=lambda t: t[0], reverse=True)
    return {
        "data": [
            ClusterListItem(
                id=c.id,
                members=list(c.members),
                member_authors=_resolve_members(c.members, author_map),
                avg_similarity=avg,
                dominant_language=c.dominant_language,
            ).model_dump()
            for (avg, c) in scored
        ]
    }


async def _pair_similarity_map(
    db: AsyncSession, run_id: str, tenant_id: str
) -> dict[tuple[str, str], float]:
    """``{(sub_a, sub_b): similarity}`` for every pair of a run, with the
    submission-id tuple sorted so lookups are order-independent."""
    pair_repo = PairRepository(db)
    # Generous limit — Dolos prunes to top matches, a run rarely exceeds
    # a few thousand pairs even for large cohorts.
    pairs = await pair_repo.list_by_run(
        run_id=run_id, tenant_id=tenant_id, limit=5000
    )
    out: dict[tuple[str, str], float] = {}
    for p in pairs:
        key = tuple(sorted((p.a_submission_id, p.b_submission_id)))
        out[key] = float(p.similarity)
    return out


def _cluster_avg_similarity(
    members: list[str],
    pair_sim: dict[tuple[str, str], float],
    *,
    fallback: float,
) -> float:
    """Mean similarity across every member-pair of a cluster that has a
    recorded pair. Falls back to the stored value when the cluster has
    no pairs in the map (shouldn't happen, but keeps the number sane)."""
    sims: list[float] = []
    for i in range(len(members)):
        for j in range(i + 1, len(members)):
            key = tuple(sorted((members[i], members[j])))
            if key in pair_sim:
                sims.append(pair_sim[key])
    if not sims:
        return float(fallback or 0.0)
    return sum(sims) / len(sims)


def _resolve_members(
    members: list[str], author_map: dict[str, Any]
) -> list[AuthorRef]:
    """Map a cluster's submission IDs to AuthorRefs via the run's
    ``author_map`` snapshot. Falls back to the raw ID as display_name
    when a submission isn't in the map (older runs, deleted students)."""
    out: list[AuthorRef] = []
    for m in members:
        info = author_map.get(m) or {}
        out.append(
            AuthorRef(
                id=info.get("id") or m,
                display_name=info.get("name") or m,
            )
        )
    return out


@router.get(
    "/plagiarism-runs/{run_id}/clusters/{cluster_id}", response_model=ClusterDetail
)
async def get_cluster(
    run_id: str,
    cluster_id: str,
    principal: Principal = Depends(get_principal_dep),
    db: AsyncSession = Depends(get_db),
) -> ClusterDetail:
    repo = RunRepository(db)
    run = await repo.get_for_tenant(run_id, principal.tenant_id)
    if run is None:
        raise not_found(f"Run {run_id} not found")
    assert_course_role(principal, run.course_id, ("owner", "co_owner", "assistant"))
    cluster = await repo.get_cluster(cluster_id)
    if cluster is None or cluster.run_id != run_id:
        raise not_found(f"Cluster {cluster_id} not found")
    author_map = (run.scope or {}).get("author_map") or {}
    pair_sim = await _pair_similarity_map(db, run_id, principal.tenant_id)
    return ClusterDetail(
        id=cluster.id,
        run_id=run_id,
        members=list(cluster.members),
        member_authors=_resolve_members(cluster.members, author_map),
        avg_similarity=_cluster_avg_similarity(
            list(cluster.members), pair_sim, fallback=cluster.avg_similarity
        ),
        dominant_language=cluster.dominant_language,
    )


@router.get("/plagiarism-runs/{run_id}/clusters/{cluster_id}/pairs")
async def list_cluster_pairs(
    run_id: str,
    cluster_id: str,
    principal: Principal = Depends(get_principal_dep),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    """Pairs whose *both* submissions belong to a given cluster, sorted
    by similarity desc. Lets the UI lazy-load a cluster's comparisons
    when its card is expanded — the public ``/pairs`` endpoint caps the
    ``limit`` query param at 200, but here we filter internally so a
    big run (500+ pairs) is no problem."""
    run_repo = RunRepository(db)
    run = await run_repo.get_for_tenant(run_id, principal.tenant_id)
    if run is None:
        raise not_found(f"Run {run_id} not found")
    assert_course_role(principal, run.course_id, ("owner", "co_owner", "assistant"))
    cluster = await run_repo.get_cluster(cluster_id)
    if cluster is None or cluster.run_id != run_id:
        raise not_found(f"Cluster {cluster_id} not found")

    member_set = set(cluster.members)
    pair_repo = PairRepository(db)
    # Internal call — not bound by the public endpoint's le=200 cap.
    all_pairs = await pair_repo.list_by_run(
        run_id=run_id,
        tenant_id=run.tenant_id,
        limit=5000,
        sort="-similarity",
    )
    within = [
        p
        for p in all_pairs
        if p.a_submission_id in member_set and p.b_submission_id in member_set
    ]
    items = [
        PairListItem(
            id=p.id,
            a_submission_id=p.a_submission_id,
            b_submission_id=p.b_submission_id,
            a_author={"id": p.a_author_id, "display_name": p.a_author_display_name},
            b_author={"id": p.b_author_id, "display_name": p.b_author_display_name},
            similarity=p.similarity,
            matched_tokens=p.matched_tokens,
            fragments_count=len(p.fragments or []),
            cross_course=bool(p.cross_course),
            cross_assignment=bool(p.cross_assignment),
            evidence_url=f"/api/v1/plagiarism-runs/{run_id}/pairs/{p.id}",
        ).model_dump()
        for p in within
    ]
    return {"data": items}


async def _artifact_response(
    *,
    run_id: str,
    kind: str,
    principal: Principal,
    db: AsyncSession,
    store: ArtifactStore,
) -> dict[str, Any]:
    repo = RunRepository(db)
    run = await repo.get_for_tenant(run_id, principal.tenant_id)
    if run is None:
        raise not_found(f"Run {run_id} not found")
    assert_course_role(principal, run.course_id, ("owner", "co_owner", "assistant"))
    uri = {
        "html": run.artifact_html_uri,
        "json": run.artifact_json_uri,
        "archive": run.artifact_archive_uri,
    }[kind]
    if not uri:
        raise not_found(f"Artifact {kind} not yet available")
    parsed = parse_uri(uri)
    if not parsed:
        raise not_found("Invalid artifact uri")
    bucket, key = parsed
    url = await store.signed_url(bucket=bucket, key=key)
    return {"kind": kind, "download_url": url, "ttl_seconds": 300}


@router.get("/plagiarism-runs/{run_id}/artifacts/html")
async def get_artifact_html(
    run_id: str,
    principal: Principal = Depends(get_principal_dep),
    db: AsyncSession = Depends(get_db),
    store: ArtifactStore = Depends(get_store),
) -> dict[str, Any]:
    return await _artifact_response(
        run_id=run_id, kind="html", principal=principal, db=db, store=store
    )


@router.get("/plagiarism-runs/{run_id}/artifacts/json")
async def get_artifact_json(
    run_id: str,
    principal: Principal = Depends(get_principal_dep),
    db: AsyncSession = Depends(get_db),
    store: ArtifactStore = Depends(get_store),
) -> dict[str, Any]:
    return await _artifact_response(
        run_id=run_id, kind="json", principal=principal, db=db, store=store
    )


@router.get("/plagiarism-runs/{run_id}/artifacts/archive")
async def get_artifact_archive(
    run_id: str,
    principal: Principal = Depends(get_principal_dep),
    db: AsyncSession = Depends(get_db),
    store: ArtifactStore = Depends(get_store),
) -> dict[str, Any]:
    return await _artifact_response(
        run_id=run_id, kind="archive", principal=principal, db=db, store=store
    )
