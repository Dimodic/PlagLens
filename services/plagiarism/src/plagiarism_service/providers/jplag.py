"""JPlag provider — real subprocess wrapper around the JPlag JAR.

Flow
----
1. ``submit``: spill ``submission_set`` into a temp dir, then spawn the JPlag
   JAR via ``asyncio.create_subprocess_exec`` *in the background*. The request
   returns immediately with our ``run_id``; the orchestrator's poll-loop will
   pick up the result later.
2. ``poll``: returns ``running`` while the subprocess is alive, ``completed``
   once it has produced ``result.jplag`` (a zip), and ``failed`` if the process
   exited non-zero. On completion we parse the zip — ``overview.json``,
   ``submissionFileIndex.json``, ``topComparisons.json`` and per-pair
   ``ComparisonReport`` JSON files (the exact layout is documented in the JPlag
   v4/v5 source — see ``de.jplag.reporting.reportobject``).
3. ``cancel``: terminates the subprocess and removes the workdir.
4. ``fetch_artifact``: returns the result zip ("archive"), the overview json
   ("json") or a placeholder html ("html").

JPlag CLI version
-----------------
Pinned to **v5.1.0** in the Dockerfile. The CLI surface used here:

    java -jar /opt/jplag.jar \
         --mode RUN \
         -l <language-token> \
         -t <min-token-match> \
         -r <result-dir>/result \
         <submissions-root>

The result is written to ``<result-dir>/result.jplag`` (a zip). Older
patch-versions wrote it to ``<result-dir>/result/result.jplag``; we handle
both.

In tests, ``_spawn_jplag`` is monkey-patched so no JVM is needed; the test
just hands us a fake ``Process`` whose ``wait()`` resolves immediately and a
hand-crafted ``result.jplag`` zip on disk.
"""
from __future__ import annotations

import asyncio
import io
import json
import shutil
import tempfile
import time
import zipfile
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from ..config import settings
from .base import (
    PlagiarismProvider,
    ProviderArtifact,
    ProviderCapabilities,
    ProviderResult,
    ProviderRunId,
    ResultCluster,
    ResultFragment,
    ResultPair,
    SubmissionSet,
)

# ---------------------------------------------------------------------------
# Language mapping: PlagLens canonical → JPlag CLI token.
# Unknown languages fall back to ``text`` (JPlag's tokenless ``simple`` mode
# in v5.x). Keep this in sync with the spec in ``08-PLAGIARISM.md``.
# ---------------------------------------------------------------------------
_LANGUAGE_MAP: dict[str, str] = {
    "python": "python3",
    "python3": "python3",
    "py": "python3",
    "java": "java",
    "c": "c",
    "cpp": "cpp",
    "c++": "cpp",
    "csharp": "csharp",
    "cs": "csharp",
    "javascript": "javascript",
    "js": "javascript",
    "typescript": "typescript",
    "ts": "typescript",
    "go": "go",
    "golang": "go",
    "rust": "rust",
    "rs": "rust",
    "kotlin": "kotlin",
    "kt": "kotlin",
    "scala": "scala",
}


def map_language(lang: str | None) -> str:
    """Map PlagLens language to JPlag CLI token. Unknown → ``text``."""
    if lang is None:
        return "text"
    return _LANGUAGE_MAP.get(lang.strip().lower(), "text")


# ---------------------------------------------------------------------------
# Per-run state. Held in-process; the orchestrator's poll-loop reads it.
# ---------------------------------------------------------------------------


@dataclass
class _JPlagState:
    run_dir: Path
    submission_dir: Path
    result_dir: Path
    result_zip: Path
    options: dict[str, Any]
    started_at: float
    timeout_seconds: int
    process: Any | None = None  # asyncio.subprocess.Process or test stub
    finished_at: float | None = None
    status: str = "running"  # running | completed | failed | cancelled
    error: str | None = None
    stderr: bytes = b""
    stdout: bytes = b""
    exit_code: int | None = None
    submission_index: dict[str, str] = field(default_factory=dict)
    waiter: asyncio.Task[None] | None = None


# Process-wide registry mapping our run_id → _JPlagState. Survives async hops
# and orchestrator polls within the same uvicorn worker. For multi-worker
# deployments, JPlag runs are bound to whichever worker accepted ``submit`` —
# that is by design (worker affinity via the run_id).
_RUNS: dict[str, _JPlagState] = {}
_LOCK = asyncio.Lock()


# ---------------------------------------------------------------------------
# Submission materialization
# ---------------------------------------------------------------------------


def _materialize_submissions(submission_set: SubmissionSet, root: Path) -> dict[str, str]:
    """Write each submission as a folder under ``root``.

    JPlag treats every immediate subdirectory of the submissions root as one
    "submission" (= one student / one repo). The folder name becomes the
    submission display name, which we mirror to ``submission_id`` so the
    parser can recover the IDs without an external mapping table.
    """
    index: dict[str, str] = {}
    for item in submission_set.items:
        # Use a sanitized form of submission_id as folder name. JPlag is fine
        # with any path-safe ASCII; we keep our IDs as-is.
        folder = root / item.submission_id
        folder.mkdir(parents=True, exist_ok=True)
        wrote_any = False
        for f in item.files:
            # Strip any leading "/" or "../" — defensive; submission service
            # validates paths but this provider is a sandboxed boundary.
            rel = f.path.lstrip("/").replace("..", "_")
            target = folder / rel
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_text(f.content or "", encoding="utf-8")
            wrote_any = True
        if not wrote_any:
            # Empty submission: write a placeholder so JPlag does not skip it.
            (folder / "__empty__").write_text("", encoding="utf-8")
        index[item.submission_id] = item.submission_id
    return index


# ---------------------------------------------------------------------------
# Subprocess spawn — kept as a module-level fn so tests can monkey-patch it.
# ---------------------------------------------------------------------------


async def _spawn_jplag(
    state: _JPlagState,
    *,
    language: str | None,
    jar_path: str,
) -> Any:
    """Launch JPlag. Returns the asyncio Process. Replaceable in tests."""
    cmd = [
        settings.jplag_java_bin,
        "-jar",
        jar_path,
        "--mode",
        "RUN",
        "-l",
        map_language(language),
        "-t",
        str(int(state.options.get("min_tokens", settings.jplag_min_tokens))),
        "-r",
        str(state.result_dir / "result"),
        str(state.submission_dir),
    ]
    proc = await asyncio.create_subprocess_exec(
        *cmd,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
        cwd=str(state.run_dir),
    )
    return proc


def _locate_result_zip(result_dir: Path) -> Path | None:
    """Find the result zip produced by JPlag.

    JPlag writes to one of:
      - ``<result-dir>/result.jplag``               (v5.x, common)
      - ``<result-dir>/result/result.jplag``        (older)
      - ``<result-dir>/result.zip``                 (some forks)
    """
    candidates = [
        result_dir / "result.jplag",
        result_dir / "result" / "result.jplag",
        result_dir / "result.zip",
        result_dir / "result" / "result.zip",
    ]
    for c in candidates:
        if c.exists() and c.stat().st_size > 0:
            return c
    # Last resort: any *.jplag under result_dir.
    jplags = list(result_dir.rglob("*.jplag"))
    return jplags[0] if jplags else None


async def _wait_and_finalize(state: _JPlagState) -> None:
    """Background coroutine: wait for the JPlag process and update state."""
    proc = state.process
    if proc is None:
        state.status = "failed"
        state.error = "no process"
        state.finished_at = time.time()
        return
    try:
        try:
            stdout, stderr = await asyncio.wait_for(
                proc.communicate(), timeout=state.timeout_seconds
            )
        except TimeoutError:
            with _suppress():
                proc.kill()
            state.status = "failed"
            state.error = f"JPlag timed out after {state.timeout_seconds}s"
            state.finished_at = time.time()
            return

        state.stdout = stdout or b""
        state.stderr = stderr or b""
        state.exit_code = proc.returncode

        if proc.returncode == 0:
            zip_path = _locate_result_zip(state.result_dir)
            if zip_path is None:
                state.status = "failed"
                state.error = "result.jplag not found after JPlag exit"
            else:
                state.result_zip = zip_path
                state.status = "completed"
        else:
            err_msg = (state.stderr or b"").decode("utf-8", errors="replace")[:4000]
            state.status = "failed"
            state.error = f"JPlag exited {proc.returncode}: {err_msg}"
    except FileNotFoundError as exc:
        state.status = "failed"
        state.error = f"JPlag binary missing: {exc}"
    except Exception as exc:  # noqa: BLE001
        state.status = "failed"
        state.error = f"{type(exc).__name__}: {exc}"
    finally:
        state.finished_at = time.time()


class _suppress:
    """Tiny ctx-mgr: swallow OSError from ``proc.kill()`` after exit."""

    def __enter__(self) -> _suppress:
        return self

    def __exit__(self, *exc_info: Any) -> bool:
        return True


# ---------------------------------------------------------------------------
# Result parsing — the heart of "real similarity pairs".
# ---------------------------------------------------------------------------


def _read_json(zf: zipfile.ZipFile, name: str) -> Any | None:
    if name not in zf.namelist():
        return None
    try:
        return json.loads(zf.read(name).decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError):
        return None


def _walk_pair_files(zf: zipfile.ZipFile) -> list[str]:
    """Return all per-pair JSON files. JPlag v5 stores them at the zip root
    as ``<a>-<b>.json`` (where a, b are submission IDs). Older versions used
    a ``comparisons/`` prefix."""
    out: list[str] = []
    for n in zf.namelist():
        if n.endswith(".json") and n not in {
            "overview.json",
            "submissionFileIndex.json",
            "topComparisons.json",
            "options.json",
        }:
            # Heuristic: pair files contain a hyphen between two IDs.
            base = n.split("/")[-1][: -len(".json")]
            if "-" in base and not base.startswith(("README", "CHANGELOG")):
                out.append(n)
    return out


def _extract_pair_ids(filename: str, known_ids: set[str]) -> tuple[str, str] | None:
    """Map ``"sub_a-sub_b.json"`` → ``("sub_a", "sub_b")``.

    Submission IDs may themselves contain hyphens (UUIDs do not, but our
    ``sub_<hex>`` format is fine). To be safe we try every split position and
    pick the first one where both halves are in ``known_ids``; otherwise fall
    back to the rightmost hyphen.
    """
    base = filename.split("/")[-1][: -len(".json")]
    if not known_ids:
        if "-" in base:
            a, b = base.rsplit("-", 1)
            return a, b
        return None
    parts = base.split("-")
    for i in range(1, len(parts)):
        a = "-".join(parts[:i])
        b = "-".join(parts[i:])
        if a in known_ids and b in known_ids:
            return a, b
    if "-" in base:
        a, b = base.rsplit("-", 1)
        return a, b
    return None


def _normalize_similarity(value: Any) -> float:
    try:
        sim = float(value)
    except (TypeError, ValueError):
        return 0.0
    if sim > 1.0:
        sim /= 100.0
    return max(0.0, min(1.0, sim))


def _build_fragment(match: dict[str, Any]) -> ResultFragment:
    """Translate one JPlag ``Match`` entry into a ``ResultFragment``.

    JPlag v5.x emits matches with short numeric suffixes (``file1`` /
    ``start1`` / ``end1`` / ``file2`` / ``start2`` / ``end2``). Older
    JPlag versions used ``first_file_name`` / ``start_in_first`` etc.,
    and there are also snake_case and camelCase variants in between.
    Accept everything and fall through; an empty fragment is the
    sentinel that something was parsed but no real metadata came out.
    """
    a_file = (
        match.get("file1")
        or match.get("first_file_name")
        or match.get("firstFileName")
        or match.get("a_file")
        or ""
    )
    b_file = (
        match.get("file2")
        or match.get("second_file_name")
        or match.get("secondFileName")
        or match.get("b_file")
        or ""
    )
    a_start = (
        match.get("start1")
        or match.get("start_in_first")
        or match.get("startInFirst")
        or match.get("a_start_line")
        or 0
    )
    a_end = (
        match.get("end1")
        or match.get("end_in_first")
        or match.get("endInFirst")
        or match.get("a_end_line")
        or 0
    )
    b_start = (
        match.get("start2")
        or match.get("start_in_second")
        or match.get("startInSecond")
        or match.get("b_start_line")
        or 0
    )
    b_end = (
        match.get("end2")
        or match.get("end_in_second")
        or match.get("endInSecond")
        or match.get("b_end_line")
        or 0
    )
    return ResultFragment(
        a_file=str(a_file),
        a_start_line=int(a_start or 0),
        a_end_line=int(a_end or 0),
        b_file=str(b_file),
        b_start_line=int(b_start or 0),
        b_end_line=int(b_end or 0),
    )


def _slice_lines(text: str, start: int, end: int) -> str:
    """Return the 1-indexed inclusive line range from ``text``."""
    if not text or start <= 0 or end < start:
        return ""
    lines = text.split("\n")
    return "\n".join(lines[start - 1 : end])


def _zip_file_text(zf: zipfile.ZipFile, name: str) -> str:
    """Read a file from the result.jplag zip as utf-8 text. Returns
    "" if the file doesn't exist or can't be decoded."""
    if name not in zf.namelist():
        return ""
    try:
        return zf.read(name).decode("utf-8")
    except (UnicodeDecodeError, KeyError):
        return ""


def _enrich_fragment_content(
    zf: zipfile.ZipFile, fr: ResultFragment, a_id: str, b_id: str
) -> None:
    """JPlag v5 stores submission files at ``files/<sub_id>/<path>`` in
    the result zip — exactly the files it tokenised. We read those and
    slice the lines so the resulting ``ResultFragment`` carries the
    actual code matched, ready for the side-by-side diff. Without
    this fragments only carry numbers and the UI shows empty panes."""
    # ``a_file`` may already include the submission id prefix
    # ("a/main.cpp") or be relative ("main.cpp"). Try both shapes.
    candidates_a = [f"files/{fr.a_file}", f"files/{a_id}/{fr.a_file}"]
    candidates_b = [f"files/{fr.b_file}", f"files/{b_id}/{fr.b_file}"]
    a_text = next((_zip_file_text(zf, c) for c in candidates_a if c in zf.namelist()), "")
    b_text = next((_zip_file_text(zf, c) for c in candidates_b if c in zf.namelist()), "")
    fr.a_content = _slice_lines(a_text, fr.a_start_line, fr.a_end_line)
    fr.b_content = _slice_lines(b_text, fr.b_start_line, fr.b_end_line)


def _parse_jplag_zip(
    zip_path: Path, fallback_index: dict[str, str]
) -> ProviderResult:
    """Parse a JPlag result zip into ``ProviderResult``.

    JPlag (v5.x) ``result.jplag`` zip layout:
      - ``overview.json``           — run metadata (incl. cluster info)
      - ``submissionFileIndex.json``— map submission_id → list of files (and
        their display names; useful when JPlag truncates names)
      - ``topComparisons.json``     — array of ``{ first_submission,
        second_submission, similarities: {...} }`` objects
      - ``<a>-<b>.json``            — per-pair ``ComparisonReport`` with
        ``matches[]`` (line ranges + matched tokens)
    """
    if not zip_path.exists():
        return ProviderResult(status="failed", error="result.jplag missing")

    pairs: list[ResultPair] = []
    clusters: list[ResultCluster] = []

    try:
        with zipfile.ZipFile(zip_path) as zf:
            overview = _read_json(zf, "overview.json") or {}
            file_index = _read_json(zf, "submissionFileIndex.json") or {}
            top = _read_json(zf, "topComparisons.json")

            # ``submissionFileIndex.json`` shape (v5.x):
            #   { "submissions": { "<id>": { "files": [...] } } }
            # OR a flat dict { "<id>": [...] }. We accept either.
            known_ids: set[str] = set()
            if isinstance(file_index, dict):
                if "submissions" in file_index and isinstance(
                    file_index["submissions"], dict
                ):
                    known_ids = set(file_index["submissions"].keys())
                else:
                    known_ids = {
                        k for k, v in file_index.items() if isinstance(v, list | dict)
                    }
            if not known_ids:
                known_ids = set(fallback_index.values()) | set(fallback_index.keys())

            # ``topComparisons.json`` may be a top-level list or a dict with
            # ``comparisons``/``topComparisons`` field.
            comparisons: list[dict[str, Any]] = []
            if isinstance(top, list):
                comparisons = [c for c in top if isinstance(c, dict)]
            elif isinstance(top, dict):
                for key in ("comparisons", "topComparisons", "items"):
                    if isinstance(top.get(key), list):
                        comparisons = [c for c in top[key] if isinstance(c, dict)]
                        break
            if not comparisons:
                # v4 fallback: comparisons embedded in overview.
                emb = overview.get("topComparisons") or overview.get("comparisons") or []
                if isinstance(emb, list):
                    comparisons = [c for c in emb if isinstance(c, dict)]

            for entry in comparisons:
                a = (
                    entry.get("first_submission")
                    or entry.get("firstSubmission")
                    or entry.get("a")
                    or entry.get("first")
                )
                b = (
                    entry.get("second_submission")
                    or entry.get("secondSubmission")
                    or entry.get("b")
                    or entry.get("second")
                )
                if a is None or b is None:
                    continue
                a, b = str(a), str(b)

                # Similarity: JPlag exposes a "similarities" dict with multiple
                # metrics ("AVG", "MAX", ...). We use AVG by default and fall
                # back to scalar fields used by older releases.
                sim_value: Any = 0.0
                sims = entry.get("similarities")
                if isinstance(sims, dict):
                    sim_value = (
                        sims.get("AVG")
                        or sims.get("avg")
                        or sims.get("MAX")
                        or sims.get("max")
                        or 0
                    )
                else:
                    sim_value = (
                        entry.get("similarity")
                        or entry.get("avgSimilarity")
                        or entry.get("avg_similarity")
                        or 0
                    )
                similarity = _normalize_similarity(sim_value)
                tokens = int(
                    entry.get("matched_tokens")
                    or entry.get("matchedTokens")
                    or entry.get("tokens")
                    or 0
                )

                # Map JPlag display-id back to our submission_id. JPlag uses
                # the folder name we wrote, so identity by default.
                a_id = fallback_index.get(a, a)
                b_id = fallback_index.get(b, b)

                # Per-pair detail JSON (matches → fragments).
                fragments: list[ResultFragment] = []
                for cand in (
                    f"{a}-{b}.json",
                    f"{b}-{a}.json",
                    f"comparisons/{a}-{b}.json",
                    f"comparisons/{b}-{a}.json",
                ):
                    if cand in zf.namelist():
                        comp = _read_json(zf, cand)
                        if isinstance(comp, dict):
                            for m in comp.get("matches", []):
                                if isinstance(m, dict):
                                    fr = _build_fragment(m)
                                    _enrich_fragment_content(zf, fr, a, b)
                                    fragments.append(fr)
                            if not tokens:
                                tokens = int(
                                    comp.get("matched_tokens")
                                    or comp.get("matchedTokens")
                                    or 0
                                )
                        break

                pairs.append(
                    ResultPair(
                        a_submission_id=a_id,
                        b_submission_id=b_id,
                        similarity=similarity,
                        matched_tokens=tokens,
                        fragments=fragments,
                    )
                )

            # If overview did not produce comparisons but per-pair files exist
            # (some JPlag builds skip topComparisons.json), reconstruct from
            # those.
            if not pairs:
                for name in _walk_pair_files(zf):
                    ids = _extract_pair_ids(name, known_ids)
                    if not ids:
                        continue
                    a, b = ids
                    comp = _read_json(zf, name) or {}
                    sims = comp.get("similarities") or {}
                    sim = _normalize_similarity(
                        sims.get("AVG")
                        if isinstance(sims, dict)
                        else comp.get("similarity") or 0
                    )
                    fragments = []
                    for m in comp.get("matches", []):
                        if isinstance(m, dict):
                            fr = _build_fragment(m)
                            _enrich_fragment_content(zf, fr, a, b)
                            fragments.append(fr)
                    tokens = int(
                        comp.get("matched_tokens")
                        or comp.get("matchedTokens")
                        or 0
                    )
                    pairs.append(
                        ResultPair(
                            a_submission_id=fallback_index.get(a, a),
                            b_submission_id=fallback_index.get(b, b),
                            similarity=sim,
                            matched_tokens=tokens,
                            fragments=fragments,
                        )
                    )

            # Clusters (optional). JPlag v5's overview.json uses the key
            # ``average_similarity`` (snake_case, full word) — the older
            # ``avg_similarity`` / ``avgSimilarity`` guesses never matched,
            # so every cluster's avg silently fell back to 0. Keep the
            # legacy keys in the chain for forward/backward safety.
            for c in overview.get("clusters", []) or []:
                if not isinstance(c, dict):
                    continue
                members_raw = c.get("members", [])
                clusters.append(
                    ResultCluster(
                        members=[fallback_index.get(str(m), str(m)) for m in members_raw],
                        avg_similarity=float(
                            c.get("average_similarity")
                            or c.get("avg_similarity")
                            or c.get("avgSimilarity")
                            or 0
                        ),
                        dominant_language=c.get("language") or c.get("dominant_language"),
                    )
                )

            # Aggregate metrics → exposed via artifacts["aggregate_json"]; the
            # orchestrator persists them in PG.
            aggregate = {
                "max_sim": max((p.similarity for p in pairs), default=0.0),
                "mean_sim": (
                    sum(p.similarity for p in pairs) / len(pairs) if pairs else 0.0
                ),
                "pair_count": len(pairs),
                "submission_count": len(known_ids) or len(fallback_index),
            }

    except zipfile.BadZipFile as exc:
        return ProviderResult(status="failed", error=f"corrupted result zip: {exc}")

    artifacts = {
        "aggregate_json": ProviderArtifact(
            kind="json",
            content=json.dumps(aggregate).encode("utf-8"),
            content_type="application/json",
            filename="aggregate.json",
        )
    }
    return ProviderResult(
        status="completed", pairs=pairs, clusters=clusters, artifacts=artifacts
    )


# ---------------------------------------------------------------------------
# Provider class
# ---------------------------------------------------------------------------


class JPlagProvider(PlagiarismProvider):
    name = "jplag"
    capabilities = ProviderCapabilities(
        name="jplag",
        languages=[
            "python", "java", "c", "cpp", "csharp", "javascript",
            "typescript", "go", "rust", "kotlin", "scala",
        ],
        supports_clusters=True,
        supports_cancel=True,
        polling_interval_seconds=2,
    )

    async def submit(self, submission_set: SubmissionSet) -> ProviderRunId:
        # Workspace layout:
        #   /tmp/jplag/{run_id}/submissions/<sub_id>/<files...>
        #   /tmp/jplag/{run_id}/result/result.jplag
        prefix = settings.jplag_workspace_root or tempfile.gettempdir()
        run_root = Path(prefix) / "jplag" / submission_set.run_id
        # Clean up any stale run dir first (e.g. retried run with same id).
        if run_root.exists():
            shutil.rmtree(run_root, ignore_errors=True)
        run_root.mkdir(parents=True, exist_ok=True)
        sub_dir = run_root / "submissions"
        result_dir = run_root / "result_dir"
        sub_dir.mkdir()
        result_dir.mkdir()

        index = _materialize_submissions(submission_set, sub_dir)

        timeout = int(
            submission_set.options.get(
                "timeout_seconds", settings.jplag_timeout_seconds
            )
            or settings.jplag_timeout_seconds
        )

        state = _JPlagState(
            run_dir=run_root,
            submission_dir=sub_dir,
            result_dir=result_dir,
            result_zip=result_dir / "result.jplag",
            options=submission_set.options,
            started_at=time.time(),
            timeout_seconds=timeout,
            submission_index=index,
        )

        try:
            proc = await _spawn_jplag(
                state, language=submission_set.language, jar_path=settings.jplag_jar_path
            )
        except FileNotFoundError as exc:
            state.status = "failed"
            state.error = f"java/JPlag not found: {exc}"
            state.finished_at = time.time()
            async with _LOCK:
                _RUNS[submission_set.run_id] = state
            return ProviderRunId(submission_set.run_id)
        except Exception as exc:  # noqa: BLE001
            state.status = "failed"
            state.error = f"failed to spawn JPlag: {exc}"
            state.finished_at = time.time()
            async with _LOCK:
                _RUNS[submission_set.run_id] = state
            return ProviderRunId(submission_set.run_id)

        state.process = proc
        # Spawn the wait task in the background so submit() returns
        # immediately. The task updates state.status when JPlag exits.
        loop = asyncio.get_event_loop()
        state.waiter = loop.create_task(_wait_and_finalize(state))

        async with _LOCK:
            _RUNS[submission_set.run_id] = state
        return ProviderRunId(submission_set.run_id)

    async def poll(self, run_id: ProviderRunId) -> ProviderResult:
        state = _RUNS.get(str(run_id))
        if state is None:
            return ProviderResult(status="failed", error="run not found")
        if state.status == "running":
            # Heuristic progress: time elapsed / timeout.
            elapsed = time.time() - state.started_at
            pct = min(95.0, (elapsed / max(state.timeout_seconds, 1)) * 100.0)
            return ProviderResult(status="running", progress_percent=pct)
        if state.status == "failed":
            return ProviderResult(status="failed", error=state.error)
        if state.status == "cancelled":
            return ProviderResult(status="cancelled", error="cancelled by user")
        # completed — parse off the event loop.
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(
            None, _parse_jplag_zip, state.result_zip, state.submission_index
        )

    async def cancel(self, run_id: ProviderRunId) -> None:
        state = _RUNS.get(str(run_id))
        if state is None:
            return
        proc = state.process
        if proc is not None and getattr(proc, "returncode", None) is None:
            try:
                proc.terminate()
                # Give it a moment, then kill.
                try:
                    await asyncio.wait_for(proc.wait(), timeout=5.0)
                except TimeoutError:
                    with _suppress():
                        proc.kill()
            except ProcessLookupError:
                pass
            except Exception:
                pass
        if state.waiter is not None and not state.waiter.done():
            state.waiter.cancel()
        state.status = "cancelled"
        state.error = "cancelled by user"
        state.finished_at = time.time()

    async def fetch_artifact(
        self, run_id: ProviderRunId, kind: str
    ) -> ProviderArtifact:
        state = _RUNS.get(str(run_id))
        if state is None:
            return ProviderArtifact(
                kind=kind, content=b"", content_type="application/octet-stream"
            )
        if kind == "archive" and state.result_zip.exists():
            return ProviderArtifact(
                kind="archive",
                content=state.result_zip.read_bytes(),
                content_type="application/zip",
                filename=f"jplag-{run_id}.jplag",
            )
        if kind == "json" and state.result_zip.exists():
            try:
                with zipfile.ZipFile(state.result_zip) as zf:
                    if "overview.json" in zf.namelist():
                        return ProviderArtifact(
                            kind="json",
                            content=zf.read("overview.json"),
                            content_type="application/json",
                            filename="overview.json",
                        )
            except zipfile.BadZipFile:
                pass
        if kind == "html":
            # JPlag does not produce a stand-alone HTML report — its viewer
            # is a SPA hosted at https://jplag.github.io/JPlag/. We embed a
            # tiny shim so the artifact endpoint returns *something* useful.
            html = (
                b"<!doctype html><html><head><meta charset='utf-8'>"
                b"<title>JPlag Report</title></head><body>"
                b"<p>JPlag does not produce a stand-alone HTML report. "
                b"Download the <code>archive</code> artifact and load "
                b"<code>result.jplag</code> at "
                b"<a href='https://jplag.github.io/JPlag/'>jplag.github.io</a>.</p>"
                b"</body></html>"
            )
            return ProviderArtifact(kind="html", content=html, content_type="text/html")
        return ProviderArtifact(
            kind=kind, content=b"", content_type="application/octet-stream"
        )


__all__ = [
    "JPlagProvider",
    "map_language",
    "_RUNS",
    "_JPlagState",
    "_spawn_jplag",
    "_parse_jplag_zip",
    "_materialize_submissions",
]


# Re-exported for legacy imports (not part of the public API).
def _ensure_buffer(b: Any) -> io.BytesIO:  # pragma: no cover - shim
    return io.BytesIO(b if isinstance(b, bytes | bytearray) else b)
