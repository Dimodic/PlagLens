"""Cross-course corpus service.

Fingerprint scheme (MVP):
- Tokenize source by simple identifier/operator extraction.
- Make 5-token shingles.
- For each shingle, compute SHA-256 → keep the **first 8 bytes** (64 bits) as
  one fingerprint, packed into bytes.

This keeps memory under control while still letting us do approximate
similarity via Jaccard distance over the fingerprint sets.
"""
from __future__ import annotations

import hashlib
import re
from collections.abc import Iterable
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from ..common.ids import corpus_id
from ..config import settings
from ..models.plagiarism import CorpusEntry
from ..repositories.corpus_repo import CorpusRepository

_TOKEN_RE = re.compile(r"[A-Za-z_][A-Za-z0-9_]*|[0-9]+|[+\-*/=<>!&|^%~]+|[(){}\[\];,.]")
_FP_BYTES = 8  # keep 8 bytes per shingle


def tokenize(source: str) -> list[str]:
    return _TOKEN_RE.findall(source or "")


def shingles(tokens: list[str], k: int) -> list[bytes]:
    if k <= 0:
        return []
    out: list[bytes] = []
    for i in range(len(tokens) - k + 1):
        chunk = " ".join(tokens[i : i + k]).encode("utf-8")
        out.append(hashlib.sha256(chunk).digest()[:_FP_BYTES])
    return out


def fingerprint(source: str, *, k: int = 5) -> tuple[bytes, int]:
    tokens = tokenize(source)
    fps = shingles(tokens, k)
    return b"".join(fps), len(tokens)


def unpack(fingerprints: bytes) -> set[bytes]:
    return {fingerprints[i : i + _FP_BYTES] for i in range(0, len(fingerprints), _FP_BYTES)}


def jaccard(a: bytes, b: bytes) -> float:
    sa = unpack(a)
    sb = unpack(b)
    if not sa or not sb:
        return 0.0
    inter = len(sa & sb)
    union = len(sa | sb)
    return inter / union if union else 0.0


class CorpusService:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session
        self.repo = CorpusRepository(session)

    async def add_submission(
        self,
        *,
        tenant_id: str,
        course_id: str | None,
        assignment_id: str | None,
        submission_id: str,
        language: str | None,
        source: str,
    ) -> CorpusEntry | None:
        if not source:
            return None
        fp, token_count = fingerprint(source, k=settings.corpus_shingle_size)
        if token_count < settings.corpus_min_token_count:
            return None
        return await self.repo.upsert(
            entry_id=corpus_id(),
            tenant_id=tenant_id,
            course_id=course_id,
            assignment_id=assignment_id,
            submission_id=submission_id,
            language=language,
            fingerprints=fp,
            token_count=token_count,
        )

    async def remove_submission(self, submission_id: str) -> bool:
        return await self.repo.soft_delete_by_submission(submission_id)

    async def search_similar(
        self,
        *,
        tenant_id: str,
        query_fingerprint: bytes,
        language: str | None,
        top_k: int = 20,
        min_similarity: float = 0.4,
        exclude_submission_ids: Iterable[str] = (),
    ) -> list[tuple[CorpusEntry, float]]:
        # CRITICAL: tenant filter is hard — never cross-tenant.
        candidates = await self.repo.list_for_tenant(
            tenant_id=tenant_id, language=language, limit=settings.corpus_top_k_candidates * 4
        )
        excluded = set(exclude_submission_ids)
        scored: list[tuple[CorpusEntry, float]] = []
        for entry in candidates:
            if entry.submission_id in excluded:
                continue
            sim = jaccard(query_fingerprint, entry.fingerprints)
            if sim >= min_similarity:
                scored.append((entry, sim))
        scored.sort(key=lambda x: x[1], reverse=True)
        return scored[:top_k]

    async def stats(self, tenant_id: str) -> dict[str, Any]:
        total, by_lang, by_course, last = await self.repo.stats(tenant_id)
        return {
            "tenant_id": tenant_id,
            "total_entries": total,
            "by_language": by_lang,
            "by_course": by_course,
            "last_added_at": last,
        }
