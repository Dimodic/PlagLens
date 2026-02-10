"""structlog setup — delegates to :mod:`plaglens_common.logging`."""

from __future__ import annotations

from plaglens_common.logging import configure_structlog, get_logger


def configure_logging(level: str = "INFO") -> None:
    configure_structlog("plagiarism", level=level)


__all__ = ["configure_logging", "get_logger"]
