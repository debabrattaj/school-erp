# School Assistant (Chatbot) — Implementation Notes

## Install on your machine
Two options:
1. Re-extract the fresh `school-erp-updated.zip` (contains everything to date), OR
2. Add just these to your existing setup:
   - NEW file: `backend/app/routes/chatbot.py`
   - NEW file: `frontend/src/pages/Assistant.jsx`
   - In `backend/app/main.py`: add `from app.routes import chatbot` and
     `app.include_router(chatbot.router)`
   - In `backend/app/tenant.py`: add `"ai_chatbot": True,` to DEFAULT_FEATURES
   - In `frontend/src/App.jsx`: import Assistant and add a `/assistant` route
     (all roles)
   - In `frontend/src/components/Sidebar.jsx`: add an "Assistant" entry
     (all roles, feature `ai_chatbot`)
   The zip already has all six changes applied.

Restart the backend; the `ai_chatbot` feature flag is backfilled automatically.

## What it does
"Assistant" appears in the sidebar for every role. It answers, from your live
database:
- Attendance ("what is the attendance?") — percentage + present/absent/late counts
- Fees ("how much fee is pending?") — total due, paid, and a per-fee breakdown
- Marks ("show exam results") — per-exam totals and percentages
- Class details ("which class is she in?") — class, section, roll no, house, status
- Academic history ("previous years") — year-by-year classes and promotion outcomes
- Current academic year and school contact info
- Greetings, help menu, and quick-reply buttons under each answer

## How it resolves WHICH student
- Parent with one child → automatic
- Parent with multiple children → child-picker buttons appear in the chat
  (and it remembers the picked child for follow-up questions), or the parent
  can just say the name: "fees for Anaya"
- Student account → always their own record
- Staff → mention a name ("attendance of Anaya") or admission number
  ("fees for ADM2026010")

## Security (tested)
Same rules as the portal, enforced server-side:
- A parent asking about a child NOT linked to them — whether by name
  ("attendance of Rohan") or by forcing a student_id in the request — never
  gets that student's data; name search is restricted to their linked
  children only.
- All endpoints require login; roles are enforced by the same require_roles
  guard as the rest of the app.

## LLM upgrade path (Option A later)
`chatbot.py` has a clearly marked `llm_fallback()` function. Today it returns
None (unmatched questions get the help menu). When you're ready for a real
LLM: put `LLM_API_KEY=...` in `backend/.env` and implement the API call inside
that one function — the routing, security, and UI need no changes.

## Verified by live tests (all passing)
- greeting, help, unmatched question → help menu
- parent with 2 children asked "fees pending" → child picker returned
- "fees pending for Anaya" → correct 3-fee breakdown including the carried-
  forward balance from the promotion feature
- attendance via child-picker selection, marks by name
- staff lookup by admission number and by name; promotion history answer
- current-year answer (from the AcademicYear table) and school contact
- both security probes correctly deflected
- intent-priority bug found in testing ("school contact details" matched the
  wrong intent) — fixed and retested
- frontend `npm run build` passes

## Wishlist status: COMPLETE ✔
International ERP core, academic year history, promotion, report card, fees,
attendance, parent/student portal, AI chatbot — all present. Next phase when
you're ready: security & production hardening (CORS, secrets, DB files out of
git, Postgres option, backups, tests) before going live.
