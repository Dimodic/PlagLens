"""Dolos provider — CLI subprocess wrapper for ``@dodona/dolos`` v2.

Dolos v2 doesn't accept a directory as the corpus; it expects either an
info CSV listing every file or a flat list of file path arguments. We
materialize the submission set into ``<run_dir>/submissions/<sub_id>/...``
and then invoke ``dolos run -f csv -l <lang> -o <out_dir> <file1> <file2>
…`` with paths *relative* to ``<run_dir>/submissions`` so the CSV that
Dolos writes back has ``<sub_id>/<file>`` paths the parser can split on.

CSV columns differ between Dolos majors:
  * v1: ``leftFileName, rightFileName, similarity, totalOverlap, longestFragment``
  * v2: ``leftFilePath, rightFilePath, similarity, totalOverlap, longestFragment``
``_parse_pairs_csv`` tolerates both so test fixtures don't need to be
rewritten alongside an upgrade.

In tests ``_run_dolos`` is monkey-patched so no Dolos binary is needed.
"""
from __future__ import annotations

import csv
import io
import shutil
import tempfile
import threading
import time
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
    ResultPair,
    SubmissionSet,
)


@dataclass
class _DolosState:
    run_dir: Path
    submission_dir: Path
    options: dict[str, Any]
    started_at: float
    finished_at: float | None = None
    status: str = "running"
    error: str | None = None
    csv_path: Path | None = None
    report_html: bytes | None = None
    submission_index: dict[str, str] = field(default_factory=dict)


_RUNS: dict[str, _DolosState] = {}
_LOCK = threading.Lock()


# Dolos understands a fixed set of language tokens. Map submission-side
# hints (which YC imports normalise via _normalize_language_hint) onto
# the names Dolos's tree-sitter loader accepts; anything not in this
# table falls back to ``python`` because that's what Dolos does too if
# the flag is missing — but at least the warning lands.
_LANG_ALIASES = {
    "c": "c",
    "cpp": "cpp",
    "c++": "cpp",
    "csharp": "c-sharp",
    "c#": "c-sharp",
    "go": "go",
    "golang": "go",
    "java": "java",
    "javascript": "javascript",
    "js": "javascript",
    "kotlin": "kotlin",
    "python": "python",
    "py": "python",
    "rust": "rust",
    "typescript": "typescript",
    "ts": "typescript",
}


def _dominant_language(submission_set: SubmissionSet) -> str | None:
    """Return the most-common ``language`` across items, mapped to a
    Dolos token. ``None`` when no item carries a language hint.
    """
    from collections import Counter

    votes: Counter[str] = Counter()
    for it in submission_set.items:
        if not it.language:
            continue
        token = _LANG_ALIASES.get(it.language.lower().strip())
        if token:
            votes[token] += 1
    if not votes:
        return None
    return votes.most_common(1)[0][0]


def _materialize(submission_set: SubmissionSet, root: Path) -> dict[str, str]:
    index: dict[str, str] = {}
    for item in submission_set.items:
        folder = root / item.submission_id
        folder.mkdir(parents=True, exist_ok=True)
        for f in item.files:
            target = folder / f.path
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_text(f.content, encoding="utf-8")
        index[item.submission_id] = item.submission_id
    return index


def _run_dolos(state: _DolosState, language: str | None) -> None:
    """Invoke the Dolos CLI on the already-materialised submission tree.

    Walks ``state.submission_dir`` for source files, passes them as
    relative-path arguments (so the CSV preserves the ``<sub_id>/<file>``
    grouping the parser relies on), invokes Dolos from inside the
    submissions root, and harvests ``out/pairs.csv`` + ``out/*.html``.

    On non-zero exit we copy stderr/stdout into ``state.error`` —
    ``str(CalledProcessError)`` by itself just says "returned non-zero
    exit status N" and the user is left guessing whether they hit a
    language-mismatch, an empty corpus, an OOM, or the binary itself.
    """
    import subprocess

    # Gather every materialised file as a path RELATIVE to the
    # ``submissions/`` root. Skip the output dir (in case some past run
    # left it there) and any dotfiles.
    submission_dir = state.submission_dir
    file_args: list[str] = []
    for f in sorted(submission_dir.rglob("*")):
        if not f.is_file():
            continue
        if f.name.startswith("."):
            continue
        rel = f.relative_to(submission_dir)
        file_args.append(str(rel))

    if not file_args:
        state.status = "failed"
        state.error = "no files materialised for Dolos run"
        state.finished_at = time.time()
        return

    out_dir = state.run_dir / "out"
    # Dolos v2 refuses to start if the output dir already exists. The
    # caller usually doesn't pre-create it, but a stray prior run can —
    # nuke it before invoking.
    if out_dir.exists():
        shutil.rmtree(out_dir, ignore_errors=True)

    cmd = [
        settings.dolos_bin,
        "run",
        "-f",
        "csv",
        "-l",
        (language or "python"),
        "-o",
        str(out_dir),
        *file_args,
    ]
    try:
        completed = subprocess.run(  # noqa: S603
            cmd,
            check=False,
            capture_output=True,
            timeout=settings.dolos_timeout_seconds,
            cwd=str(submission_dir),
        )
        if completed.returncode != 0:
            stderr = (completed.stderr or b"").decode("utf-8", errors="replace")
            stdout = (completed.stdout or b"").decode("utf-8", errors="replace")
            state.status = "failed"
            tail = (stderr or stdout or "").strip().splitlines()
            tail_msg = " | ".join(tail[-5:]) if tail else "(no stderr)"
            state.error = (
                f"dolos exit {completed.returncode}: {tail_msg}"
            )
            return

        candidates = list(out_dir.glob("*pairs*.csv")) if out_dir.exists() else []
        if candidates:
            state.csv_path = candidates[0]
        html_candidates = list(out_dir.glob("*.html")) if out_dir.exists() else []
        if html_candidates:
            state.report_html = html_candidates[0].read_bytes()
        state.status = "completed"
    except FileNotFoundError as exc:
        state.status = "failed"
        state.error = f"dolos binary missing: {exc}"
    except subprocess.TimeoutExpired:
        state.status = "failed"
        state.error = (
            f"dolos timed out after {settings.dolos_timeout_seconds}s"
        )
    except Exception as exc:  # noqa: BLE001
        state.status = "failed"
        state.error = str(exc)
    finally:
        state.finished_at = time.time()


def _parse_pairs_csv(csv_path: Path, index: dict[str, str]) -> list[ResultPair]:
    pairs: list[ResultPair] = []
    if not csv_path.exists():
        return pairs
    with csv_path.open(encoding="utf-8") as fh:
        reader = csv.DictReader(fh)
        for row in reader:
            # v2 emits ``leftFilePath`` / ``rightFilePath``; v1 used
            # ``leftFileName`` / ``rightFileName``. Some custom exports
            # just use ``left`` / ``right``. Try all three.
            left = (
                row.get("leftFilePath")
                or row.get("leftFileName")
                or row.get("left")
                or ""
            )
            right = (
                row.get("rightFilePath")
                or row.get("rightFileName")
                or row.get("right")
                or ""
            )
            sim_raw = row.get("similarity") or row.get("score") or "0"
            try:
                sim = float(sim_raw)
            except ValueError:
                sim = 0.0
            if sim > 1:
                sim /= 100.0
            try:
                tokens = int(row.get("totalOverlap") or row.get("matched_tokens") or 0)
            except ValueError:
                tokens = 0
            # Path is "<submission_id>/file" — extract submission_id
            a_id = left.split("/")[0] if "/" in left else left
            b_id = right.split("/")[0] if "/" in right else right
            a_id = index.get(a_id, a_id)
            b_id = index.get(b_id, b_id)
            if a_id and b_id and a_id != b_id:
                pairs.append(
                    ResultPair(
                        a_submission_id=a_id,
                        b_submission_id=b_id,
                        similarity=sim,
                        matched_tokens=tokens,
                    )
                )
    return pairs


class DolosProvider(PlagiarismProvider):
    name = "dolos"
    capabilities = ProviderCapabilities(
        name="dolos",
        languages=[
            "python", "java", "javascript", "typescript", "c",
            "cpp", "csharp", "go", "rust", "kotlin",
        ],
        supports_clusters=False,
        supports_cancel=False,
        polling_interval_seconds=2,
    )

    async def submit(self, submission_set: SubmissionSet) -> ProviderRunId:
        run_dir = Path(tempfile.mkdtemp(prefix=f"dolos-{submission_set.run_id}-"))
        sub_dir = run_dir / "submissions"
        sub_dir.mkdir()
        index = _materialize(submission_set, sub_dir)
        state = _DolosState(
            run_dir=run_dir,
            submission_dir=sub_dir,
            options=submission_set.options,
            started_at=time.time(),
            submission_index=index,
        )
        with _LOCK:
            _RUNS[submission_set.run_id] = state
        # Pick the language Dolos should parse with. SubmissionSet.language
        # may be ``None`` (the orchestrator only sets it when the caller
        # explicitly passed ``options.language``). When that's the case,
        # vote across the items: each carries its own ``language`` hint
        # from upload / YC import (e.g. ``cpp`` for a C++ submission).
        # Pre-fix this fell through to ``"python"`` for every contest,
        # so Dolos parsed C++ source as Python and produced empty pairs.
        chosen_language = submission_set.language or _dominant_language(
            submission_set
        )
        thread = threading.Thread(
            target=_run_dolos, args=(state, chosen_language), daemon=True
        )
        thread.start()
        return ProviderRunId(submission_set.run_id)

    async def poll(self, run_id: ProviderRunId) -> ProviderResult:
        state = _RUNS.get(str(run_id))
        if state is None:
            return ProviderResult(status="failed", error="run not found")
        if state.status == "running":
            return ProviderResult(status="running")
        if state.status == "failed":
            return ProviderResult(status="failed", error=state.error)
        pairs = _parse_pairs_csv(
            state.csv_path or state.run_dir / "out" / "pairs.csv",
            state.submission_index,
        )
        return ProviderResult(status="completed", pairs=pairs)

    async def cancel(self, run_id: ProviderRunId) -> None:
        state = _RUNS.pop(str(run_id), None)
        if state is not None:
            try:
                shutil.rmtree(state.run_dir, ignore_errors=True)
            except Exception:
                pass

    async def fetch_artifact(self, run_id: ProviderRunId, kind: str) -> ProviderArtifact:
        state = _RUNS.get(str(run_id))
        if state is None:
            return ProviderArtifact(kind=kind, content=b"", content_type="application/octet-stream")
        if kind == "html" and state.report_html:
            return ProviderArtifact(
                kind="html", content=state.report_html, content_type="text/html"
            )
        if kind == "json":
            import json

            payload = {"pairs": []}
            if state.csv_path and state.csv_path.exists():
                pairs = _parse_pairs_csv(state.csv_path, state.submission_index)
                payload = {
                    "pairs": [
                        {
                            "a": p.a_submission_id,
                            "b": p.b_submission_id,
                            "similarity": p.similarity,
                            "matched_tokens": p.matched_tokens,
                        }
                        for p in pairs
                    ]
                }
            return ProviderArtifact(
                kind="json",
                content=json.dumps(payload).encode(),
                content_type="application/json",
            )
        if kind == "archive":
            buf = io.BytesIO()
            import zipfile

            out_dir = state.run_dir / "out"
            with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
                if out_dir.exists():
                    for p in out_dir.rglob("*"):
                        if p.is_file():
                            zf.write(p, arcname=str(p.relative_to(out_dir)))
            return ProviderArtifact(
                kind="archive",
                content=buf.getvalue(),
                content_type="application/zip",
                filename=f"dolos-{run_id}.zip",
            )
        return ProviderArtifact(kind=kind, content=b"", content_type="application/octet-stream")
