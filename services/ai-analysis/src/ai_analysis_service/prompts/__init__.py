"""Built-in default prompt versions + registry."""
from .registry import (
    DEFAULT_PROMPT_VERSION,
    builtin_prompt_versions,
    get_builtin,
    plaglens_report_schema,
)

__all__ = [
    "DEFAULT_PROMPT_VERSION",
    "builtin_prompt_versions",
    "get_builtin",
    "plaglens_report_schema",
]
