"""Root conftest: extend sys.path with src/ so 'reporting_service' is importable."""
from __future__ import annotations

import sys
from pathlib import Path

_HERE = Path(__file__).resolve().parent
_SRC = _HERE / "src"
if str(_SRC) not in sys.path:
    sys.path.insert(0, str(_SRC))
