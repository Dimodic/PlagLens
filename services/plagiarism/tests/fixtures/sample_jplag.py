"""Helpers to generate a realistic JPlag v5 ``result.jplag`` zip in-memory.

We avoid checking a binary fixture into the repo (small, but blobby) and
instead build the zip programmatically from JSON snippets that mirror the v5
layout. The shapes are taken from the JPlag v5.1 source under
``de.jplag.reporting.reportobject.model``.
"""
from __future__ import annotations

import io
import json
import zipfile
from pathlib import Path


def build_jplag_v5_zip(
    *,
    pair_a: str = "sub_alpha",
    pair_b: str = "sub_beta",
    pair_c: str = "sub_gamma",
    similarity_ab: float = 0.82,
    similarity_ac: float = 0.31,
    matched_tokens_ab: int = 412,
) -> bytes:
    """Return a complete ``.jplag`` zip with two top comparisons + clusters."""
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.writestr(
            "options.json",
            json.dumps({"language": "python3", "minimum_token_match": 9}),
        )
        zf.writestr(
            "submissionFileIndex.json",
            json.dumps(
                {
                    "submissions": {
                        pair_a: {
                            "files": [
                                {"name": "main.py", "length": 35},
                                {"name": "util.py", "length": 12},
                            ]
                        },
                        pair_b: {
                            "files": [
                                {"name": "solution.py", "length": 37},
                            ]
                        },
                        pair_c: {
                            "files": [
                                {"name": "answer.py", "length": 22},
                            ]
                        },
                    }
                }
            ),
        )
        zf.writestr(
            "topComparisons.json",
            json.dumps(
                [
                    {
                        "first_submission": pair_a,
                        "second_submission": pair_b,
                        "similarities": {
                            "AVG": similarity_ab,
                            "MAX": similarity_ab + 0.05,
                        },
                        "matchedTokens": matched_tokens_ab,
                    },
                    {
                        "first_submission": pair_a,
                        "second_submission": pair_c,
                        "similarities": {"AVG": similarity_ac, "MAX": similarity_ac},
                        "matchedTokens": 60,
                    },
                ]
            ),
        )
        zf.writestr(
            f"{pair_a}-{pair_b}.json",
            json.dumps(
                {
                    "first_submission": pair_a,
                    "second_submission": pair_b,
                    "similarities": {"AVG": similarity_ab},
                    "matched_tokens": matched_tokens_ab,
                    "matches": [
                        {
                            "first_file_name": "main.py",
                            "second_file_name": "solution.py",
                            "start_in_first": 10,
                            "end_in_first": 35,
                            "start_in_second": 12,
                            "end_in_second": 37,
                            "length": 25,
                        },
                        {
                            "first_file_name": "util.py",
                            "second_file_name": "solution.py",
                            "start_in_first": 1,
                            "end_in_first": 8,
                            "start_in_second": 38,
                            "end_in_second": 45,
                            "length": 7,
                        },
                    ],
                }
            ),
        )
        zf.writestr(
            f"{pair_a}-{pair_c}.json",
            json.dumps(
                {
                    "first_submission": pair_a,
                    "second_submission": pair_c,
                    "similarities": {"AVG": similarity_ac},
                    "matched_tokens": 60,
                    "matches": [
                        {
                            "first_file_name": "main.py",
                            "second_file_name": "answer.py",
                            "start_in_first": 22,
                            "end_in_first": 30,
                            "start_in_second": 1,
                            "end_in_second": 9,
                            "length": 8,
                        }
                    ],
                }
            ),
        )
        zf.writestr(
            "overview.json",
            json.dumps(
                {
                    "submissionsCount": 3,
                    "totalComparisons": 3,
                    "clusters": [
                        {
                            "members": [pair_a, pair_b],
                            "avg_similarity": similarity_ab,
                            "language": "python3",
                        }
                    ],
                }
            ),
        )
    return buf.getvalue()


def write_jplag_v5_zip_to(path: Path) -> Path:
    """Persist the fixture to ``path`` and return it. Useful for debugging."""
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(build_jplag_v5_zip())
    return path
