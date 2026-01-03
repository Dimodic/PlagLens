"""CSV encoder. UTF-8 with BOM for Excel compatibility."""
from __future__ import annotations

import csv
import io

from ..builders.base import BuilderResult


def to_csv(result: BuilderResult) -> tuple[bytes, str]:
    buf = io.StringIO()
    buf.write("﻿")  # BOM
    w = csv.writer(buf, lineterminator="\n")
    w.writerow(result.columns)
    for row in result.rows:
        w.writerow([_render(row.get(c)) for c in result.columns])
    return buf.getvalue().encode("utf-8"), "text/csv; charset=utf-8"


def _render(value):
    if value is None:
        return ""
    if isinstance(value, (list, tuple, dict)):
        return str(value)
    return value
