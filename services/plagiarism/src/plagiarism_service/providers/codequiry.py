"""Codequiry HTTP provider — functional implementation of 4-step flow.

1. ``POST /check/create``       → ``{ "check_id": ... }``
2. ``POST /check/{id}/upload``  (multipart per file)
3. ``POST /check/{id}/start``
4. ``GET  /check/{id}/status``  → poll until ``status == "completed"``
5. ``GET  /check/{id}/results`` → final pair list

The implementation is robust to several response shapes (Codequiry has changed
the JSON schema between API versions). All HTTP calls go through ``httpx`` and
are mockable via ``respx`` in tests.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

import httpx

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
class _CqState:
    api_base: str
    api_key: str
    check_id: str
    status: str = "running"
    error: str | None = None
    pairs: list[ResultPair] = field(default_factory=list)
    raw_results: dict[str, Any] = field(default_factory=dict)


_RUNS: dict[str, _CqState] = {}


def _client(api_key: str) -> httpx.AsyncClient:
    return httpx.AsyncClient(
        timeout=30.0,
        headers={"Authorization": f"Bearer {api_key}", "Accept": "application/json"},
    )


class CodequiryProvider(PlagiarismProvider):
    name = "codequiry"
    capabilities = ProviderCapabilities(
        name="codequiry",
        languages=[
            "python", "java", "cpp", "csharp", "javascript",
            "typescript", "ruby", "go", "rust", "kotlin",
        ],
        supports_clusters=False,
        supports_cancel=True,
        supports_webhook=True,
        polling_interval_seconds=10,
    )

    async def submit(self, submission_set: SubmissionSet) -> ProviderRunId:
        api_key = (
            submission_set.options.get("api_key") or settings.codequiry_api_key
        )
        api_base = (
            submission_set.options.get("api_base") or settings.codequiry_api_base
        ).rstrip("/")
        async with _client(api_key) as client:
            # 1. create
            resp = await client.post(
                f"{api_base}/check/create",
                json={
                    "name": f"plaglens-{submission_set.run_id}",
                    "language": submission_set.language or "python",
                },
            )
            resp.raise_for_status()
            payload = resp.json()
            check_id = str(payload.get("check_id") or payload.get("id") or payload.get("data", {}).get("id"))
            if not check_id or check_id == "None":
                raise RuntimeError(f"codequiry: missing check_id in response: {payload}")
            # 2. upload
            for item in submission_set.items:
                for f in item.files:
                    files = {
                        "file": (
                            f"{item.submission_id}/{f.path}",
                            f.content.encode(),
                            "text/plain",
                        )
                    }
                    up = await client.post(
                        f"{api_base}/check/{check_id}/upload",
                        files=files,
                        data={"submission_id": item.submission_id},
                    )
                    up.raise_for_status()
            # 3. start
            start = await client.post(f"{api_base}/check/{check_id}/start", json={})
            start.raise_for_status()

        _RUNS[submission_set.run_id] = _CqState(
            api_base=api_base, api_key=api_key, check_id=check_id
        )
        return ProviderRunId(submission_set.run_id)

    async def poll(self, run_id: ProviderRunId) -> ProviderResult:
        state = _RUNS.get(str(run_id))
        if state is None:
            return ProviderResult(status="failed", error="run not found")
        async with _client(state.api_key) as client:
            try:
                resp = await client.get(f"{state.api_base}/check/{state.check_id}/status")
                resp.raise_for_status()
                doc = resp.json()
            except httpx.HTTPError as exc:
                return ProviderResult(status="running", progress_percent=None, error=str(exc))
        status = (doc.get("status") or doc.get("state") or "running").lower()
        if status in ("queued", "running", "pending", "processing", "in_progress"):
            return ProviderResult(
                status="running",
                progress_percent=float(doc.get("progress", 0) or 0),
            )
        if status in ("failed", "error"):
            return ProviderResult(status="failed", error=str(doc.get("error") or status))
        # completed → fetch results
        async with _client(state.api_key) as client:
            r = await client.get(f"{state.api_base}/check/{state.check_id}/results")
            r.raise_for_status()
            results = r.json()
        state.raw_results = results
        pairs: list[ResultPair] = []
        for entry in results.get("pairs") or results.get("matches") or []:
            a = (
                entry.get("a_submission_id")
                or entry.get("file_a")
                or entry.get("submission_a")
                or ""
            )
            b = (
                entry.get("b_submission_id")
                or entry.get("file_b")
                or entry.get("submission_b")
                or ""
            )
            sim = float(entry.get("similarity") or entry.get("score") or 0)
            if sim > 1:
                sim /= 100.0
            tokens = int(entry.get("matched_tokens") or 0)
            if a and b:
                pairs.append(
                    ResultPair(
                        a_submission_id=str(a),
                        b_submission_id=str(b),
                        similarity=sim,
                        matched_tokens=tokens,
                    )
                )
        state.pairs = pairs
        state.status = "completed"
        return ProviderResult(status="completed", pairs=pairs)

    async def cancel(self, run_id: ProviderRunId) -> None:
        state = _RUNS.get(str(run_id))
        if state is None:
            return
        try:
            async with _client(state.api_key) as client:
                await client.post(f"{state.api_base}/check/{state.check_id}/cancel", json={})
        except httpx.HTTPError:
            pass
        state.status = "cancelled"

    async def fetch_artifact(self, run_id: ProviderRunId, kind: str) -> ProviderArtifact:
        state = _RUNS.get(str(run_id))
        if state is None:
            return ProviderArtifact(kind=kind, content=b"", content_type="application/octet-stream")
        if kind == "json":
            import json

            return ProviderArtifact(
                kind="json",
                content=json.dumps(state.raw_results).encode(),
                content_type="application/json",
            )
        if kind == "html":
            html = (
                f"<html><body><a href=\"{state.api_base}/check/{state.check_id}/report\">"
                f"Codequiry report</a></body></html>"
            ).encode()
            return ProviderArtifact(kind="html", content=html, content_type="text/html")
        if kind == "archive":
            try:
                async with _client(state.api_key) as client:
                    r = await client.get(
                        f"{state.api_base}/check/{state.check_id}/archive"
                    )
                    r.raise_for_status()
                    return ProviderArtifact(
                        kind="archive",
                        content=r.content,
                        content_type=r.headers.get("content-type", "application/zip"),
                        filename=f"codequiry-{state.check_id}.zip",
                    )
            except httpx.HTTPError:
                return ProviderArtifact(kind=kind, content=b"", content_type="application/zip")
        return ProviderArtifact(kind=kind, content=b"", content_type="application/octet-stream")
