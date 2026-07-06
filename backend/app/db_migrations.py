"""Helpers to keep freshly-created tenant databases migration-aware.

When a new school DB is created it gets the full current schema via
``Base.metadata.create_all``. We then stamp it at the latest Alembic revision so
a later ``alembic upgrade head`` only applies genuinely new migrations rather
than trying to recreate existing tables.

Everything here is best-effort: school creation must never fail because Alembic
is unavailable, so failures are logged and swallowed.
"""

import os
import sys
import logging

logger = logging.getLogger("migrations")

_BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
_PYLIBS = os.path.join(_BACKEND_DIR, ".pylibs")
# In dev, alembic is installed under .pylibs (the venv site-packages is
# read-only here); in production it's a normal dependency on sys.path already.
if os.path.isdir(_PYLIBS) and _PYLIBS not in sys.path:
    sys.path.insert(0, _PYLIBS)


def _alembic_config(database_url: str):
    from alembic.config import Config

    cfg = Config(os.path.join(_BACKEND_DIR, "alembic.ini"))
    cfg.set_main_option("script_location", os.path.join(_BACKEND_DIR, "alembic"))
    cfg.attributes["db_url"] = database_url
    return cfg


def stamp_tenant_db(database_url: str) -> None:
    """Mark a newly-created tenant DB as being at the latest migration head."""
    try:
        from alembic import command

        command.stamp(_alembic_config(database_url), "head")
        logger.info("Stamped new tenant DB at head: %s", database_url)
    except Exception as exc:
        logger.warning("Could not stamp tenant DB %s: %s", database_url, exc)
