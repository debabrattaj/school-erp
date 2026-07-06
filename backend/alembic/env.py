"""Alembic environment for the tenant school schema (app.models / Base).

The target database is chosen per-invocation:
  alembic -x db_url=sqlite:///./school_erp.db upgrade head

If no db_url is given it falls back to DEFAULT_SCHOOL_DATABASE_URL. Use
manage_migrations.py to run a command across every tenant database.

Batch mode is enabled so SQLite (which can't ALTER most things in place) gets
correct table-rebuild migrations.
"""

import os
import sys
from logging.config import fileConfig

from sqlalchemy import engine_from_config, pool

from alembic import context

# Make the app package importable.
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# Import Base and all models so metadata is fully populated.
from app.database import Base  # noqa: E402
import app.models  # noqa: E402,F401

config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata


def _resolve_url() -> str:
    x_args = context.get_x_argument(as_dictionary=True)
    return (
        x_args.get("db_url")
        or config.attributes.get("db_url")  # set when invoked programmatically
        or os.getenv("DEFAULT_SCHOOL_DATABASE_URL")
        or "sqlite:///./school_erp.db"
    )


def run_migrations_offline() -> None:
    context.configure(
        url=_resolve_url(),
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        render_as_batch=True,
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    section = config.get_section(config.config_ini_section, {})
    section["sqlalchemy.url"] = _resolve_url()
    connectable = engine_from_config(
        section,
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            render_as_batch=True,
        )
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
