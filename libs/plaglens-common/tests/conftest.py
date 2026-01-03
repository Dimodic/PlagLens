"""Shared pytest fixtures."""

from __future__ import annotations

import os
import sys

# Ensure src/ is on sys.path when running pytest without an installed package.
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "src")
if SRC not in sys.path:
    sys.path.insert(0, SRC)
