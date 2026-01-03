"""MOSS (Stanford Measure Of Software Similarity) provider — skeleton.

The real MOSS protocol is a minimal text protocol over TCP (port 7690). The
classic perl client (``moss.pl``) opens a socket, exchanges greeting / language
/ uploads files line-by-line and finally returns a results URL.

This implementation is a *functional skeleton*: it spits out a deterministic
synthetic result (pairs derived from input similarity heuristics) instead of
hitting Stanford's network. Tests rely on the same monkey-patch hook pattern as
``jplag.py`` (``_run_moss``).
"""
from __future__ import annotations

import hashlib
import threading
import time
from dataclasses import dataclass
from typing import Any

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
class _MossState:
    options: dict[str, Any]
    started_at: float
    finished_at: float | None = None
    status: str = "running"
    pairs: list[ResultPair] = None  # type: ignore[assignment]
    report_url: str | None = None
    error: str | None = None


_RUNS: dict[str, _MossState] = {}
_LOCK = threading.Lock()


def _run_moss(submission_set: SubmissionSet, state: _MossState) -> None:
    """Synchronous MOSS run. Replaceable in tests.

    For the skeleton we only emit pairs when files share a sha256 prefix —
    a stand-in for the real n-gram fingerprint protocol.
    """
    try:
        items = submission_set.items
        pairs: list[ResultPair] = []
        for i in range(len(items)):
            for j in range(i + 1, len(items)):
                a, b = items[i], items[j]
                a_text = "\n".join(f.content for f in a.files)
                b_text = "\n".join(f.content for f in b.files)
                a_h = hashlib.sha256(a_text.encode()).hexdigest()
                b_h = hashlib.sha256(b_text.encode()).hexdigest()
                shared = sum(1 for x, y in zip(a_h, b_h, strict=False) if x == y)
                similarity = shared / 64.0
                if similarity > 0.0:
                    pairs.append(
                        ResultPair(
                            a_submission_id=a.submission_id,
                            b_submission_id=b.submission_id,
                            similarity=similarity,
                            matched_tokens=int(similarity * 100),
                        )
                    )
        state.pairs = pairs
        state.report_url = f"https://moss.stanford.edu/results/{submission_set.run_id}/"
        state.status = "completed"
    except Exception as exc:  # noqa: BLE001
        state.status = "failed"
        state.error = str(exc)
    finally:
        state.finished_at = time.time()


class MossProvider(PlagiarismProvider):
    name = "moss"
    capabilities = ProviderCapabilities(
        name="moss",
        languages=["c", "cpp", "java", "python", "javascript", "ruby"],
        supports_clusters=False,
        supports_cancel=False,
        polling_interval_seconds=10,
    )

    async def submit(self, submission_set: SubmissionSet) -> ProviderRunId:
        state = _MossState(options=submission_set.options, started_at=time.time(), pairs=[])
        with _LOCK:
            _RUNS[submission_set.run_id] = state
        thread = threading.Thread(
            target=_run_moss, args=(submission_set, state), daemon=True
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
        return ProviderResult(status="completed", pairs=state.pairs or [])

    async def cancel(self, run_id: ProviderRunId) -> None:
        _RUNS.pop(str(run_id), None)

    async def fetch_artifact(self, run_id: ProviderRunId, kind: str) -> ProviderArtifact:
        state = _RUNS.get(str(run_id))
        if state is None or state.report_url is None:
            return ProviderArtifact(kind=kind, content=b"", content_type="application/json")
        if kind == "html":
            html = (
                f"<html><body><a href=\"{state.report_url}\">MOSS report</a></body></html>"
            ).encode()
            return ProviderArtifact(kind="html", content=html, content_type="text/html")
        if kind == "json":
            import json

            payload = {
                "report_url": state.report_url,
                "pairs": [
                    {
                        "a": p.a_submission_id,
                        "b": p.b_submission_id,
                        "similarity": p.similarity,
                    }
                    for p in (state.pairs or [])
                ],
            }
            return ProviderArtifact(
                kind="json",
                content=json.dumps(payload).encode(),
                content_type="application/json",
            )
        return ProviderArtifact(kind=kind, content=b"", content_type="application/octet-stream")
