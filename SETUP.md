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

## 4. Known rough edges (see full analysis)

- `.db` files are committed to git — consider gitignoring them and adding a
  seed/reset script instead, especially before this goes anywhere near production.
- CORS is currently `allow_origins=["*"]` in `main.py` — fine for local dev,
  tighten before deploying.
- Stray Windows artifacts (`backend/Command Prompt.lnk`, `backend/desktop.ini`)
  should be removed and gitignored.
