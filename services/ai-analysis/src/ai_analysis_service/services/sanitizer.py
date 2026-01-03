"""Prompt-injection sanity checks on LLM output."""
from __future__ import annotations

import re

from ..schemas import PlagLensReport

_TOKENS = (
    r"ignore previous instructions",
    r"disregard (the|all) (above|prior) instructions",
    r"forget the above",
    r"system\s*:",
    r"<system",
    r"</system",
    r"<\|im_start\|>",
    r"<\|im_end\|>",
    r"\bjailbreak\b",
    r"override\s+the\s+rules",
    r"reveal\s+your\s+system\s+prompt",
)
_PATTERN = re.compile("|".join(_TOKENS), re.IGNORECASE)
_TAG = re.compile(r"<\s*/?\s*(student_code|system|assistant|user)\b", re.IGNORECASE)


def is_injection_suspected(report: PlagLensReport, raw: str | None = None) -> bool:
    fields = [report.summary, *report.questions, *report.recommendations]
    for sig in report.risk_signals:
        fields.append(sig.details)
    sample = " \n ".join(fields)
    if raw:
        sample = sample + " \n " + raw
    if _PATTERN.search(sample):
        return True
    if _TAG.search(sample):
        return True
    return False


def wrap_student_code(code: str) -> str:
    """Always wrap, even if the student tries clever quoting."""
    return f"<student_code>\n{code}\n</student_code>"
