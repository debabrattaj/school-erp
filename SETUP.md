# Local Setup Guide

Verified working on: Python 3 + pip, Node.js + npm.

## 1. Backend (FastAPI)

```bash
cd backend
python -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate
pip install -r requirements.txt

cp .env.example .env
# Edit .env and set SECRET_KEY to a real random value, e.g.:
python -c "import secrets; print(secrets.token_hex(32))"

uvicorn app.main:app --reload --port 8000
```

Backend will be live at http://localhost:8000 (docs at /docs).

**Note:** the app raises `RuntimeError: SECRET_KEY is missing` and refuses to start
until `.env` exists with `SECRET_KEY` set. This is intentional (security.py) but
easy to miss on first clone — that's why `.env.example` above exists now.

## 2. Frontend (React + Vite)

```bash
cd frontend
npm install
npm run dev
```

Frontend will be live at http://localhost:5173 and expects the backend on
http://localhost:8000 (check `frontend/src/api.js` if you change the backend port).

## 3. Data

The repo currently ships with pre-existing SQLite database files
(`backend/school_erp.db`, `backend/school_accounts.db`,
`backend/school_erp_test_school_040751.db`) already containing data/schema.
Nothing extra is required to get a working dataset locally — the app will use
these as-is. If you want a clean slate, delete the `.db` files before first run
and let `Base.metadata.create_all()` / `seed.py` recreate them.

## 4. Database migrations (Alembic)

The tenant school schema (`app/models.py`) is managed by Alembic. Because each
school has its own database, migrations are applied to every tenant DB via a
wrapper script:

```bash
cd backend
# apply any new migrations to the default + all registered tenant schools
python manage_migrations.py upgrade head
# see each database's current revision
python manage_migrations.py current
```

To change the schema: edit the models, then autogenerate a migration against a
throwaway empty DB and apply it everywhere:

```bash
python -m alembic -x db_url=sqlite:////tmp/scratch.db revision --autogenerate -m "add X"
python manage_migrations.py upgrade head
```

Newly-created schools are automatically stamped at the latest revision. The
central registry DB (`school_accounts.db`) is not under Alembic — it's small and
additive and handled by `create_all` at startup.

## 5. Using Postgres instead of SQLite

The app is dialect-aware. To run on Postgres, install the driver and point the
database URLs at your server:

```bash
pip install "psycopg[binary]"   # already in requirements.txt
# in backend/.env
CENTRAL_DATABASE_URL=postgresql+psycopg://user:pass@localhost:5432/school_accounts
DEFAULT_SCHOOL_DATABASE_URL=postgresql+psycopg://user:pass@localhost:5432/school_erp
```

Notes:
- Engine settings switch automatically (SQLite `check_same_thread` vs Postgres
  `pool_pre_ping`); Alembic batch mode is used only for SQLite.
- New tenant databases are auto-created (`CREATE DATABASE`) when the connecting
  role has permission; otherwise create them first.
- Apply migrations across all tenant DBs: `python manage_migrations.py upgrade head`.
- Backups use `pg_dump` for Postgres (`.sql` files) and the SQLite online backup
  API for SQLite (`.db` files) — see the Owner Console → Backups tab.

## 6. Known rough edges (see full analysis)

- `.db` files are committed to git — consider gitignoring them and adding a
  seed/reset script instead, especially before this goes anywhere near production.
- CORS is currently `allow_origins=["*"]` in `main.py` — fine for local dev,
  tighten before deploying.
- Stray Windows artifacts (`backend/Command Prompt.lnk`, `backend/desktop.ini`)
  should be removed and gitignored.
