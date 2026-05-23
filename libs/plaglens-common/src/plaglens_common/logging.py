"""structlog JSON logging configuration.

"""

from __future__ import annotations

import logging
import sys
from typing import Any

try:
    import structlog  # type: ignore[import-not-found]
except ImportError:  # pragma: no cover
    structlog = None  # type: ignore[assignment]

SENSITIVE_KEYS: frozenset[str] = frozenset(
    {"password", "token", "access_token", "refresh_token", "authorization", "secret", "api_key"}
)

def _redact_sensitive(_logger: Any, _name: str, event_dict: dict[str, Any]) -> dict[str, Any]:
    for k in list(event_dict.keys()):
        if k.lower() in SENSITIVE_KEYS:
            event_dict[k] = "[REDACTED]"
    return event_dict

def configure_structlog(
    service_name: str,
    *,
    level: str | int = "INFO",
    add_caller: bool = False,
) -> None:
    """Configure stdlib + structlog for JSON output to stdout.

    Idempotent: calling twice replaces processors.
    """

    if structlog is None:
        # Fall back to stdlib JSON-ish formatting.
        logging.basicConfig(
            level=level,
            stream=sys.stdout,
            format='{"level":"%(levelname)s","message":%(message)r,"logger":"%(name)s"}',
        )
        return

    log_level = logging.getLevelName(level) if isinstance(level, str) else level
    logging.basicConfig(level=log_level, stream=sys.stdout, format="%(message)s")

    timestamper = structlog.processors.TimeStamper(fmt="iso", utc=True)

    processors: list[Any] = [
        structlog.contextvars.merge_contextvars,
        structlog.processors.add_log_level,
        timestamper,
        _redact_sensitive,
        structlog.processors.StackInfoRenderer(),
        structlog.processors.format_exc_info,
        structlog.processors.JSONRenderer(),
    ]
    if add_caller:
        processors.insert(
            -1,
            structlog.processors.CallsiteParameterAdder(
                {
                    structlog.processors.CallsiteParameter.FILENAME,
                    structlog.processors.CallsiteParameter.LINENO,
                    structlog.processors.CallsiteParameter.FUNC_NAME,
                }
            ),
        )

    structlog.configure(
        processors=processors,
        wrapper_class=structlog.make_filtering_bound_logger(log_level),
        logger_factory=structlog.PrintLoggerFactory(file=sys.stdout),
        cache_logger_on_first_use=True,
    )
    structlog.contextvars.bind_contextvars(service=service_name)

def get_logger(name: str | None = None) -> Any:
    """Return a structlog logger (falls back to stdlib if structlog is absent)."""
    if structlog is None:  # pragma: no cover
        return logging.getLogger(name)
    return structlog.get_logger(name)

__all__ = ["SENSITIVE_KEYS", "configure_structlog", "get_logger"]
