"""Alembic env: supports both async (asyncpg) and sync (sqlite) engines.

The ``COURSE_DB_SCHEMA`` env var controls whether tables live in the ``course``
schema (default for Postgres) or the default schema (set to empty for SQLite/tests).
The ORM models in :mod:`course_service.models` honour the same variable.
"""

from __future__ import annotations

import asyncio
import os
from logging.config import fileConfig

from alembic import context
from sqlalchemy import engine_from_config, pool
from sqlalchemy.ext.asyncio import async_engine_from_config

from course_service.config import get_settings
from course_service.models import Base

config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

settings = get_settings()
if settings.database_url:
    config.set_main_option("sqlalchemy.url", settings.database_url)

target_metadata = Base.metadata


def _is_async_url(url: str) -> bool:
    return "+asyncpg" in url or "+aiosqlite" in url


def _schema() -> str | None:
    raw = os.environ.get("COURSE_DB_SCHEMA")
    if raw is None:
        return "course"
    return raw or None


def run_migrations_offline() -> None:
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        include_schemas=bool(_schema()),
        version_table_schema=_schema(),
    )
    with context.begin_transaction():
        context.run_migrations()


def _do_run_migrations(connection) -> None:
    context.configure(
        connection=connection,
        target_metadata=target_metadata,
        include_schemas=bool(_schema()),
        version_table_schema=_schema(),
    )
    with context.begin_transaction():
        context.run_migrations()


async def _run_async_migrations() -> None:
    connectable = async_engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    async with connectable.connect() as connection:
        await connection.run_sync(_do_run_migrations)
    await connectable.dispose()


def run_migrations_online() -> None:
    url = config.get_main_option("sqlalchemy.url") or ""
    if _is_async_url(url):
        asyncio.run(_run_async_migrations())
        return
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    with connectable.connect() as connection:
        _do_run_migrations(connection)


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
