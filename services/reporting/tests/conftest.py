"""Test fixtures for the merged reporting+audit+notification service.

Assembly tests only build the app (no DB / Kafka / Redis), so we just set
conservative env defaults that keep the sub-services' background machinery off
if a future test ever enters the lifespan.
"""

from __future__ import annotations

import os

os.environ.setdefault("RUN_BACKGROUND_JOBS", "false")
os.environ.setdefault("KAFKA_DISABLED", "true")
os.environ.setdefault("SCHEDULER_DISABLED", "true")
os.environ.setdefault("REDIS_DISABLED", "true")
os.environ.setdefault("DATABASE_URL", "sqlite+aiosqlite:///:memory:")
