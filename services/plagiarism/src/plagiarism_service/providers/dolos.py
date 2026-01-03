"""Dolos provider — CLI subprocess skeleton.

Real Dolos is invoked as ``dolos run -f csv -l <lang> <dir>``. We materialize the
submission set into a tmp dir, shell out, then read ``dolos-report-pairs.csv``
which has columns ``leftFileName,rightFileName,similarity,longestFragment,
totalOverlap``. In tests ``_run_dolos`` is monkey-patched so no Dolos binary is
needed.
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
    import subprocess

    cmd = [
        settings.dolos_bin,
        "run",
        "-f",
        "csv",
        "-l",
        (language or "python"),
        "-o",
        str(state.run_dir / "out"),
        str(state.submission_dir),
    ]
    try:
        subprocess.run(  # noqa: S603
            cmd,
            check=True,
            capture_output=True,
            timeout=settings.dolos_timeout_seconds,
        )
        out_dir = state.run_dir / "out"
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
            left = row.get("leftFileName") or row.get("left") or ""
            right = row.get("rightFileName") or row.get("right") or ""
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
        thread = threading.Thread(
            target=_run_dolos, args=(state, submission_set.language), daemon=True
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
