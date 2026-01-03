"""JSON encoder. Streaming variant for large datasets."""
from __future__ import annotations

import json as _json
from typing import AsyncIterator, Iterator

from ..builders.base import BuilderResult


def to_json(result: BuilderResult) -> tuple[bytes, str]:
    body = {
        "title": result.title,
        "columns": result.columns,
        "rows": result.rows,
        "metadata": result.metadata,
    }
    return _json.dumps(body, default=str, ensure_ascii=False).encode("utf-8"), "application/json"


def stream_json(result: BuilderResult) -> Iterator[bytes]:
    """Synchronous streaming variant: emits JSON in chunks."""
    yield b'{"title": '
    yield _json.dumps(result.title).encode()
    yield b', "columns": '
    yield _json.dumps(result.columns).encode()
    yield b', "rows": ['
    for i, row in enumerate(result.rows):
        if i:
            yield b","
        yield _json.dumps(row, default=str, ensure_ascii=False).encode()
    yield b'], "metadata": '
    yield _json.dumps(result.metadata, default=str).encode()
    yield b"}"


async def astream_json(result: BuilderResult) -> AsyncIterator[bytes]:
    for chunk in stream_json(result):
        yield chunk
