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

## 3b. Bulk demo data (seed_bulk.py)

Fills every module with demo records so screens aren't empty when demoing or
when testing pagination, filters and sorting against realistic volumes.

```bash
cd backend
python seed_bulk.py --dry-run          # show current counts, change nothing
python seed_bulk.py --count 100 --yes  # top every module up to 100 rows
python seed_bulk.py --purge --yes      # remove only what this script created
```

**It refuses to run without `--yes`,** and always prints the database URL it
resolved first — read that line before confirming. Pointing it at a tenant
with real students in it would mix hundreds of fake records into live data.

- **Idempotent.** It counts what a table already has and creates only the
  shortfall, so running it twice adds nothing the second time, and existing
  real data is left alone rather than duplicated.
- **Reversible.** Every generated row carries `[bulk-seed]` in a text column,
  and `--purge` deletes on that marker, so it removes its own rows and nothing
  else. Child tables with no free-text column (payslips, salary structures,
  online-test questions) are cleared by following the link to a deleted parent
   — SQLite does not enforce `ON DELETE CASCADE` unless `PRAGMA foreign_keys`
  is on, so that sweep is explicit rather than left to the database.
- **Classes and Subjects survive a purge** on purpose: they are reference data
  the rest of the app points at, and a re-seed reuses them.

Two deliberate departures from "100 of everything":

- **Institution Settings and Biometric Attendance Rules stay single rows.**
  They are configuration, not lists — 100 of either is meaningless.
- **Sections run A–I.** A real school runs A–C, but 12 grades × 3 sections
  caps Classes at 36, short of a 100 target. Students and exams are still
  assigned within A–C so the data reads normally.

This is separate from `seed_full_data.py`, which is a one-shot script building
a single internally-consistent demo school. Use that one for a realistic
narrative; use this one for volume.

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

## 6. Running the tests

The backend has a pytest suite covering the security-critical and core logic
(TOTP/MFA, login rate limiting, password policy, payment-signature
verification, WhatsApp number normalization, email log-mode, audit helpers,
PDF receipts, and SQLite backups):

```bash
cd backend
./run_tests.sh            # or: PYTHONPATH=.pylibs python -m pytest
```

In CI/production just `pip install pytest` and run `python -m pytest`.

## 7. Known rough edges (see full analysis)

- Stray Windows artifacts (`backend/Command Prompt.lnk`, `backend/desktop.ini`)
  should be removed and gitignored.
- Self-serve school signup (`POST /platform/schools`) and admin-created accounts
  (`POST /accounts/`) generate their own tenant database automatically — one
  Postgres database per school on the same server when `DEFAULT_SCHOOL_DATABASE_URL`
  is Postgres, or a SQLite file otherwise. There is no schema-per-tenant mode.
- Uploaded files (`UPLOAD_DIR`) and local backups (`BACKUP_DIR`) live on local
  disk — fine on a single persistent host, but lost on redeploy on platforms
  with an ephemeral filesystem unless you attach persistent storage or move to
  object storage (S3/R2).

## 8. Deploying: Vercel (frontend) + Render (backend) + Postgres

- **Frontend**: set `VITE_API_BASE_URL` to the backend's public URL in the
  Vercel project's environment variables (see `frontend/.env.example`).
  `frontend/vercel.json` adds the SPA rewrite `BrowserRouter` needs so deep
  links don't 404.
- **Backend**: `render.yaml` (repo root) and `backend/Procfile` define the web
  service (`uvicorn app.main:app --host 0.0.0.0 --port $PORT`). Set
  `CENTRAL_DATABASE_URL` and `DEFAULT_SCHOOL_DATABASE_URL` to your Postgres
  connection string — **note Render's auto-generated `DATABASE_URL` uses the
  `postgres://` scheme; rewrite it to `postgresql+psycopg://...` before using
  it**, since both the app code and the psycopg3 driver expect that prefix.
  Also set `CORS_ALLOWED_ORIGINS` and `FRONTEND_BASE_URL` to your Vercel domain.
- After the first deploy, run `python manage_migrations.py upgrade head`
  against the production registry to bring every tenant DB to the latest schema.

## 9. Scheduled fee auto-generation

Fee Structures (`/fee-structures`) can bill themselves automatically on a
schedule instead of a staff member running "Bulk Class" fee creation by
hand. Three fields on a Fee Structure control it:

- `auto_generate` (bool) — turn the schedule on/off.
- `recurrence` — `monthly` | `quarterly` | `annually` | `once`.
- `next_run_date` — the next date it should fire; day-of-month must be ≤ 28
  (avoids "the 31st" ambiguity in shorter months). Advances automatically
  after each run — or, for `once`, flips `auto_generate` back off so it
  doesn't fire again.

A structure with `class_name` set only bills that class; one with
`class_name` left blank ("All Classes") bills every class that currently
has an active student, resolving each class's own Fee Structure
individually — so a more specific per-class override still wins, same as
manual "Bulk Class" billing does today.

**Off by default, platform-owner gated.** A school's own Admin/Accounts can
set `auto_generate`/`recurrence`/`next_run_date` on a Fee Structure freely,
but `run_scheduled_fees.py` still won't bill anyone for that school until
the platform owner has switched on the `fee_auto_generation` feature for it
— from the Platform Console (`/platform` login → Manage Modules → Automatic
Fee Billing) or `PUT /platform/schools/{id}/features` with
`{"fee_auto_generation": true}`. Defaults to `False` for every school,
including ones that existed before this gate was added.

### Running it

```bash
cd backend
python run_scheduled_fees.py             # process every due cycle, for every school
python run_scheduled_fees.py --dry-run   # log what would happen, change nothing
```

Safe to run more than once: fees it creates are tagged with a
`billing_period` (e.g. `"2026-08"`), and a student who already has a fee for
that period is never billed again — so a cron job that fires twice, or gets
re-run by hand, won't double-charge anyone. If it hasn't run in a while, it
catches up one cycle at a time (May, then June, then July...) rather than
skipping straight to the current month.

Each attempt is logged to `fee_generation_runs` — check recent runs without
SSHing in via `GET /fee-structures/generation-runs`.

**Before relying on the schedule**, apply the migration on every tenant DB
(§4): `python manage_migrations.py upgrade head`. The script itself creates
missing *tables* on the DBs it touches, but not missing *columns* on
existing tables — the migration is what adds the new columns. Then have the
platform owner enable `fee_auto_generation` for each school that should use
it — the cron job will otherwise skip every school and log why.

### Wiring it up in cPanel

If the backend runs on cPanel itself (via "Setup Python App" / Passenger),
getting scheduled fee generation live is two separate things: getting this
*code* onto the server, then telling cron to *run* it.

**0. Deploy the code.** If you deploy via cPanel's Git Version Control
feature, the repo root's `.cpanel.yml` automates this — "Deploy HEAD
Commit" installs dependencies, runs `manage_migrations.py upgrade head`,
and restarts the app. If you deploy some other way (manual `git pull` over
SSH, FTP, etc.), just make sure those same steps happen once before
continuing.

Then add a Cron Job that calls the script directly in the app's own
virtualenv — no HTTP round-trip or auth token needed. For schoolment.com's
account (`schoolm1`), that command is:

```
source /home/schoolm1/virtualenv/repositories/school-erp/backend/3.11/bin/activate && cd /home/schoolm1/repositories/school-erp/backend && python run_scheduled_fees.py >> /home/schoolm1/logs/fee_cron.log 2>&1
```

1. Create the log directory once (cPanel Terminal, or File Manager):
   `mkdir -p /home/schoolm1/logs` — the cron command above redirects into
   it, which silently fails if the directory doesn't exist yet.
2. cPanel → Advanced → **Cron Jobs** → Add New Cron Job. Once a day is
   plenty (the catch-up logic covers any gaps) — command as above.
3. Cron fires on the **server's** clock — compare the time cPanel's Cron
   Jobs page shows against the school's local time and offset the
   hour/minute fields if they differ.
4. Test by hand first: run the same command from cPanel's Terminal (or SSH)
   with `--dry-run` appended, check the logged cycles look right, then run
   it for real once before trusting the schedule to fire unattended.

## 10. Online admission form

Prospective parents can submit an admission inquiry themselves, without an
account, at `/apply` (e.g. `https://schoolment.com/school-admin/apply`) —
no login, no bearer token. Staff previously had to key every inquiry into
the Admissions CRM by hand; this is the same `AdmissionInquiry` record,
just self-served.

- **Frontend:** `frontend/src/pages/ApplyOnline.jsx`, routed at `/apply`
  alongside `/login` — outside `ProtectedLayout`, so it renders with no
  sidebar and no auth check. The target school comes from a required
  `?school=` query param; the Admissions CRM page has a "Copy Apply Link"
  button that builds this URL for the logged-in school automatically. The
  page is school-specific by design (this is a white-labeled multi-tenant
  app) — it looks up that school via `GET /admissions/public/school-info`
  and shows its actual name/tagline/logo instead of generic branding, and
  a missing or unrecognized `?school=` shows "this admission link isn't
  valid" rather than silently falling back to some default tenant.
- **Backend:** `POST /admissions/public` (`backend/app/routes/admissions.py`).
  Resolves the tenant from `account_code` in the request body — the same
  pre-auth pattern `/auth/login` and `/auth/forgot-password` use — rather
  than a session header, since a first-time visitor has no session yet.
  Only accepts the fields a parent should set (student/guardian details);
  `stage`, `assigned_to`, `converted_student_id`, and `inquiry_no` are
  always server-assigned, never taken from the request.
- **Abuse protection:** a hidden honeypot field (`website`) — real
  browsers never fill it, so a submission with it set is dropped silently
  while still returning a normal-looking success response — plus the same
  per-IP rate limiter `/auth/login` uses (`LOGIN_MAX_ATTEMPTS` /
  `LOGIN_WINDOW_SECONDS`, §backend env vars).
- On success it sends the same confirmation email the internal CRM's "Add
  Inquiry" already triggers (`notify_admission_inquiry_received`) and
  returns the generated `inquiry_no` as a reference number.

## 11. Payroll

Per-teacher salary structures (`/payroll/salary-structures/{teacher_id}`,
Admin/Accounts only) plus monthly payslip generation
(`POST /payroll/generate` with `{month, year}`, Admin/Accounts only —
Principal gets view access). Generating a period snapshots each teacher's
*current* salary structure into a `Payslip` row, so editing the structure
later never rewrites a payslip that already went out — same principle as
Fee auto-generation's `billing_period` snapshotting. Safe to re-run: a
teacher already billed for that month/year is skipped, not duplicated.

Payslips can be marked Paid (`PUT /payroll/payslips/{id}/mark-paid`) and
downloaded as a PDF (`GET /payroll/payslips/{id}/pdf`, via `app/pdf.py`'s
`payslip_pdf()`). Frontend: `frontend/src/pages/Payroll.jsx`, at `/payroll`.

No public payroll surface exists or is planned — this is an internal
finance tool only.

## 12. Richer parent/student portal: timetable, homework, messaging

Three additions to the existing parent/student portal (`/portal`), all in
`backend/app/routes/portal.py` alongside the existing per-student
endpoints, gated the same way (`ensure_student_access` — a guardian only
sees their own linked student's data):

- **Timetable** (`GET /portal/students/{id}/timetable`) — read-only view
  of the student's class timetable, reusing the existing `TimetableEntry`
  data teachers already maintain in `/timetable`.
- **Homework** (`GET /portal/students/{id}/homework`) — read-only view of
  `Assignment` rows matching the student's class + section. Teachers post
  assignments via `/homework` (`backend/app/routes/homework.py`,
  `frontend/src/pages/Homework.jsx`) and they show up in the portal
  immediately — no separate "publish" step.
- **Messages** (`GET`/`POST /portal/students/{id}/messages`) — a single
  flat, continuous message thread per student, shared by every guardian
  linked to that student and staff, not private per-guardian DMs. Parents
  use it from the Portal's "Messages" tab; staff reply from the same
  student's "Messages" tab in `StudentDetails.jsx`. Teachers aren't in
  `PORTAL_ROLES` (they're not linked via `ParentStudentLink`), so
  messaging uses its own `ensure_message_access()` that additionally
  grants Teachers staff-level access.

Deliberately out of scope here: online tests/quizzes. That's a full
assessment engine (question banks, grading, attempt tracking) — bolting a
half-built version onto this would be worse than not having it; treat it
as a separate, dedicated feature if it's wanted.

## 13. Online tests (quizzes)

Teacher-authored, auto-graded multiple-choice / true-false tests, taken by
students through the portal. `backend/app/routes/online_tests.py` (staff
authoring — Admin/Principal/Teacher) plus new endpoints on
`backend/app/routes/portal.py` (student-facing). Frontend:
`frontend/src/pages/OnlineTests.jsx` (`/online-tests`) and a new "Online
Tests" tab in `Portal.jsx`.

- **Only auto-gradable question types** (`mcq_single`, `true_false`) —
  every submission is scored immediately, so there's no manual-grading
  queue or "pending review" state. Subjective/short-answer questions are
  intentionally not supported for the same reason `Payslip`/homework
  avoided half-built states elsewhere in this app.
- **State machine:** `Draft` (invisible to students) → `Published`
  (students in the matching class + section can attempt it, subject to an
  optional `starts_at`/`ends_at` window) → `Closed` (no new attempts, past
  ones stay visible). One attempt per student per test — no retakes.
- **Only the `Student` role can start or submit an attempt** — a linked
  `Parent` account can view the test list and, once submitted, the
  reviewed result, but can't take the test on the student's behalf.

### Sold separately: the `online_tests` entitlement

This module is **off by default** (`DEFAULT_FEATURES["online_tests"] = False`
in `app/tenant.py`). The platform owner switches it on per school in the
Platform Console ("Online Exam (add-on)"), exactly like the automation flags.

The check is enforced **server-side**, not just by hiding the menu entry:
`require_feature("online_tests")` (`app/tenant.py`) sits on the
`/online-tests` router as a whole and on each of the four student-facing
`/portal/students/{id}/online-tests*` routes, which share the portal router
with everything else and so are gated individually. A school without the
entitlement gets a 403 from the API, not merely a hidden tab. Reach for the
same dependency for any future module that is optional or paid — a flag that
only hides UI is not an entitlement.

### Timer and window enforcement

The deadline for an attempt is the **earlier** of `started_at +
duration_minutes` and the test's own `ends_at` (`_attempt_deadline` in
`portal.py`). It is enforced on the server, in two places:

- **On submit** — past the deadline (plus `SUBMIT_GRACE_SECONDS`, 60s, to
  absorb clock skew and network latency) the submitted payload is *refused*
  and the attempt is scored on what was already saved.
- **On open** — an attempt left running past its deadline is closed when it
  is next loaded, rather than resumed. So walking away and coming back the
  next day does not buy extra time.

Either path stamps `OnlineTestAttempt.auto_submitted_reason`
(`time_expired` or `window_closed`), which the portal shows to the student
and which distinguishes an auto-closed attempt from a normal submission.

**This is why answers are saved as the student goes.** `POST
/portal/students/{id}/online-tests/{test_id}/answer` upserts one answer at a
time (ungraded — grading happens once, in `_grade_attempt`). Without it,
refusing a late payload would score a timed-out student on an empty sheet.
Any change to the submit path must keep that pairing intact.

### Shuffling

`OnlineTest.shuffle_questions` / `shuffle_options` (both default off) reorder
questions and MCQ options per student. The order is seeded from the attempt
id (`_shuffled_for_attempt`), so it is stable across reloads within one
attempt but differs between students; option shuffling additionally salts
with the question id so the two orderings don't correlate. The original
order is restored once the attempt is submitted, since at that point the
listing is a review aid rather than an anti-copying measure.

These are integrity fixes to the base module, **not** part of the paid
add-on — they apply to every school that has the module at all.

## 13b. Biometric attendance (add-on)

Punch data from physical terminals (fingerprint / face / RFID), turned into
`Attendance` rows. `backend/app/biometric.py` holds the logic,
`backend/app/routes/biometric.py` the endpoints, `backend/run_biometric_sync.py`
the scheduled puller.

**Sold separately.** `DEFAULT_FEATURES["biometric_attendance"]` is `False`; the
platform owner enables it per school in the Platform Console ("Biometric
Attendance (add-on)"). The gate covers the device ingest endpoint as well as
the staff routes, so a school whose subscription lapses stops accepting punches
rather than continuing to collect data it is no longer entitled to hold.

### The three ingest routes, and what "pull" can actually reach

A terminal on a school LAN has a private address and **cannot be dialled from
this server**. That constraint decides the whole design:

| Mode | Who initiates | Use when |
|---|---|---|
| `push` | Terminal / vendor middleware POSTs to `/biometric/ingest` | The device can make outbound HTTP calls (most ZKTeco / eSSL units) |
| `pull` | `run_biometric_sync.py` GETs `pull_endpoint` | The vendor has an internet-reachable cloud API |
| agent | A script inside the school reads the device and POSTs to `/biometric/ingest` | LAN-only device that cannot push |

`push` and the agent share one endpoint, so there is a single ingest path to
reason about. Registering a device with `mode="pull"` and no reachable
`pull_endpoint` will simply fail every run — that is the case that needs an
agent instead.

### Device authentication

A terminal cannot hold a login session, so each device gets a random bearer
token. Only the SHA-256 hash is stored; the plaintext is returned **once**, at
registration or rotation, and cannot be retrieved afterwards — reissue with
`POST /biometric/devices/{id}/rotate-token`, which invalidates the old one
immediately. Devices send:

```
X-Device-Serial: <serial_number>
X-Device-Token:  <token>
X-School-Code:   <account_code>
```

`X-School-Code` is required because there is no JWT to carry the tenant; the
shared resolver already honours that header for unauthenticated requests.

### Ingest is idempotent

Terminals retry, and each pull window deliberately overlaps the last by
`LOOKBACK_HOURS` (48) to close gaps left by a missed run. `BiometricPunch.dedupe_key`
hashes (device, user, second, direction), so a repeat is counted as a duplicate
and dropped. Re-POSTing a batch is always safe.

Punches are stored **before** they are interpreted. A punch from someone with
no enrollment mapping is kept, not discarded, and is attributed retroactively
when the mapping is added (`relink_unmatched_punches`). Raw punches are also
what allow attendance to be recomputed after correcting a mapping, without
asking the device for history it may no longer hold.

### Enrollment mapping

`BiometricEnrollment` maps a device-side user id to a student or teacher.
`device_id = NULL` means "on every terminal", which is the normal case where one
roster is pushed to all devices; a row naming a specific device wins over the
NULL one, so a single terminal that numbers people differently can be corrected
without disturbing the rest.

### Deriving attendance — deliberately conservative

`POST /biometric/derive` turns a day's punches into `Attendance` rows, and is
safe to re-run (it will not duplicate). Rules live in
`BiometricAttendanceConfig`, and every default is the cautious one:

- `derive_attendance` defaults **off** — punches are collected and visible, but
  nothing is written to attendance. Run a terminal alongside manual marking
  until you trust it, then switch this on.
- `overwrite_manual` defaults **off** — a mark made by a teacher is left alone.
  The job tags its own rows with a `Biometric:` remark prefix, and that prefix
  is how it tells its own work from a human's.
- `absent_if_no_punch` defaults **off** — otherwise a terminal that quietly
  stopped reporting would mark the entire school absent.
- `late_after` / `half_day_before` are unset by default: first punch after
  `late_after` is Late, last punch before `half_day_before` is Half Day.

### Wiring the puller

Only needed if some device uses `mode="pull"`. Add a cPanel Cron Job the same
way as the other schedulers:

```
cd /home/schoolm1/repositories/school-erp/backend && \
  /home/schoolm1/virtualenv/repositories/school-erp/backend/3.11/bin/python \
  run_biometric_sync.py >> /home/schoolm1/logs/biometric_sync.log 2>&1
```

`--dry-run` fetches and reports without writing. A device that is unreachable or
misconfigured records a Failed `BiometricSyncRun` and the loop continues to the
next device rather than aborting the run.

Vendor APIs that do not return a plain JSON list need their own adapter: add it
to `FETCHERS` in `run_biometric_sync.py`, keyed by `BiometricDevice.vendor`.
The shipped `fetch_generic_json` covers list-returning JSON APIs with optional
header auth.

### Privacy

Biometric identifiers of minors are sensitive personal data under the DPDP Act.
Note that this module stores the **device-side user id and punch times only** —
it never receives or stores fingerprint or face templates, which stay on the
terminal. That is a meaningful limit on exposure, but consent and retention
obligations for the attendance data still apply and are a legal question, not a
technical one.

## 14. Scheduled year-end promotion

`AcademicYear` (`/academic-years`) can process year-end promotion itself
instead of a staff member running "Year-End Processing" by hand. It reuses
the exact same promote/detain/graduate suggestion logic that screen's
"Suggestions" panel already computes (marks vs. the school's pass
percentage) — the schedule just applies those suggestions unattended on a
chosen date rather than waiting for someone to review and click through
them. A student with no marks recorded, or a "promote" suggestion the
suggestion logic can't confidently map to a target class (non-numeric class
names aren't auto-mapped — see `_suggest_next_class` in
`student_enrollments.py`), is left alone for staff to handle manually;
everything else is applied.

Fields on an Academic Year control it:

- `auto_promote_enabled` (bool) — turn the schedule on/off.
- `auto_promote_date` — the date it should fire.
- `auto_promote_to_year` — which academic year to promote students into;
  must already exist.
- `auto_promote_carry_forward_fees` (bool, default off) — carry forward
  unpaid fee balances into the new year, same as the manual screen's own
  checkbox.

**Off by default, platform-owner gated.** A school's own Admin/Principal can
set these fields on an Academic Year freely, but `run_scheduled_promotions.py`
still won't promote anyone for that school until the platform owner has
switched on the `promotion_auto_generation` feature for it — from the
Platform Console (Manage Modules → Automatic Year-End Promotion) or
`PUT /platform/schools/{id}/features` with `{"promotion_auto_generation": true}`.
Defaults to `False` for every school, including ones that existed before
this gate was added.

### Running it

```bash
cd backend
python run_scheduled_promotions.py             # process every due academic year, for every enabled school
python run_scheduled_promotions.py --dry-run   # log what would happen, change nothing
```

Safe to run more than once: the underlying promotion logic already skips a
student who's already enrolled in the target academic year, so re-running
(or a cron firing twice) never double-promotes anyone. Each attempt is
logged to `promotion_generation_runs` — check recent runs without SSHing in
via `GET /academic-years/promotion-runs`.

**Before relying on the schedule**, apply the migration on every tenant DB
(§4): `python manage_migrations.py upgrade head`. Then have the platform
owner enable `promotion_auto_generation` for each school that should use it
— the cron job will otherwise skip every school and log why.

### Wiring it up in cPanel

Same shape as §9's fee scheduler — a daily Cron Job calling the script
directly in the app's own virtualenv:

```
source /home/schoolm1/virtualenv/repositories/school-erp/backend/3.11/bin/activate && cd /home/schoolm1/repositories/school-erp/backend && python run_scheduled_promotions.py >> /home/schoolm1/logs/promotion_cron.log 2>&1
```

Test with `--dry-run` first, same as §9.

## 15. Scheduled exam creation

Exam Templates (`/exam-templates`) let a recurring exam type (e.g. "Unit
Test 1") auto-create that year's `Exam` record on schedule instead of
someone remembering to create it by hand every term — staff then adds
subjects/marks as usual.

**Off by default, platform-owner gated.** Unlike fee auto-generation and
scheduled promotion (which any school's own Admin can turn on for
themselves), this only fires for a school whose central
`exam_auto_generation` feature flag has been switched on by the *platform
owner* — a school's own Admin/Principal can create and edit Exam Templates
freely, but nothing actually auto-creates until the platform owner enables
it for that school from the Platform Console (`/platform` login, Manage
Modules → Automatic Exam Creation, or `PUT /platform/schools/{id}/features`
with `{"exam_auto_generation": true}`). Defaults to `False` for every school,
including ones that existed before this feature shipped.

Fields on an Exam Template:

- `name` — e.g. `"Unit Test 1"`. Must be unique.
- `next_run_date` — the date this exam should next be created. Required
  while the template is active. After a successful fire, this advances
  automatically to the same month/day next year — same "mutable date that
  moves itself forward" shape as `FeeStructure.next_run_date` — so you only
  set it once, ever.
- `is_active` (bool, defaults to `False`) — a template must be explicitly
  switched on, not just created, before it's eligible to fire — same as
  `FeeStructure.auto_generate`/`AcademicYear.auto_promote_enabled` — on top
  of the separate platform-owner gate below. A template can sit inactive
  with no `next_run_date` set while it's being prepared.

Because `Exam.exam_name` must be unique across the whole `exams` table (a
pre-existing rule this doesn't change), the exam this creates is named
`"{template name} ({academic year})"` — e.g. `"Unit Test 1 (2026-27)"` — so
the same template can fire every year without colliding with itself. The
academic year is resolved automatically: whichever `AcademicYear` row's
`start_date`/`end_date` range covers the template's `next_run_date`. If none
does yet (staff hasn't created that year), the date is left where it is and
retried on the next run rather than skipped or silently backed up — the
exam still gets created once the year exists.

**Bootstrapping from history:** `POST /exam-templates/seed-from-year` with
`{"academic_year": "2025-26"}` copies that year's real exams into matching
templates, setting each one's `next_run_date` to the *next future*
occurrence of that exam's month/day (this year if it hasn't passed yet,
otherwise next year) — never a date already in the past. Lets a school with
exam history skip typing the calendar in from scratch. Seeded templates
start inactive too — staff review and switch each one on rather than a
single bulk action activating a whole calendar at once.

### Running it

```bash
cd backend
python run_scheduled_exams.py             # create every due exam, for every enabled school
python run_scheduled_exams.py --dry-run   # log what would happen, change nothing
```

Safe to run more than once: idempotency lives in `next_run_date` itself —
once it advances past today, that cycle won't fire again. If it hasn't run
in a while, it catches up one year at a time (capped at 5 missed cycles) the
same way the fee scheduler catches up missed months. Check recent runs
without SSHing in via `GET /exam-templates/generation-runs`.

**Before relying on the schedule**, apply the migration on every tenant DB
(§4): `python manage_migrations.py upgrade head`. Then have the platform
owner enable `exam_auto_generation` for each school that should use it —
the cron job will otherwise skip every school and log why.

### Wiring it up in cPanel

Same shape again — a daily Cron Job:

```
source /home/schoolm1/virtualenv/repositories/school-erp/backend/3.11/bin/activate && cd /home/schoolm1/repositories/school-erp/backend && python run_scheduled_exams.py >> /home/schoolm1/logs/exam_cron.log 2>&1
```

Test with `--dry-run` first, same as §9.

## 16. Marketing site deployment

`landing-page/` is the schoolment.com marketing site — plain static
HTML/CSS/JS (no npm, no build step, no Node process). It deploys through the
same cPanel Git Version Control repo as the backend, via the extra task at
the bottom of `.cpanel.yml`:

```
- export PUBLIC_HTML=/home/schoolm1/public_html
- /usr/bin/rsync -a --delete --exclude='.well-known' --exclude='cgi-bin' --exclude='school-admin' $DEPLOYPATH/landing-page/ $PUBLIC_HTML/
```

`rsync --delete` mirrors `landing-page/` into the docroot exactly — anything
removed from `landing-page/` in git disappears from the live site on the
next deploy too, not just anything added or changed. `.well-known`,
`cgi-bin`, and `school-admin` are excluded so this never deletes SSL/ACME
verification files, cPanel's own cgi-bin, or the admin app frontend.

**`PUBLIC_HTML` is shared with other things — the exclude list must cover
all of them, always.** The document root isn't exclusive to the marketing
site: the admin app frontend is deployed to `$PUBLIC_HTML/school-admin/`,
separately from this git-based flow. The first version of this task didn't
exclude `school-admin/`, and running it deleted the entire admin frontend
(everything under it except `.well-known`) on 2026-08-13 — recovered by
rebuilding and re-uploading `frontend/`'s dist. If anything else ever gets
deployed under `$PUBLIC_HTML` outside of `landing-page/`'s own files, add it
to `--exclude` in `.cpanel.yml` *before* the next deploy, not after.

**Before this will work, `PUBLIC_HTML` must point at schoolment.com's real
document root** — `/home/schoolm1/public_html` is only correct if
schoolment.com is the account's primary domain. If it's an addon domain or
subdomain instead, cPanel → **Domains** shows its actual document root
(usually something like `/home/schoolm1/public_html/schoolment.com` or
`/home/schoolm1/schoolment.com`) — update the `export PUBLIC_HTML=` line in
`.cpanel.yml` to match before deploying, or the site will land in the wrong
place (or the deploy will fail if the path doesn't exist).

### Deploying

Same two options as the backend, since it's the same repo and the same
Git Version Control checkout:

- **cPanel UI**: Git Version Control page → **Update from Remote**, then
  **Deploy HEAD Commit**. Runs the backend steps and the marketing-site
  rsync in one go, since they're both tasks in the same `.cpanel.yml`.
- **SSH**, if you'd rather not click through the UI:

```bash
export DEPLOYPATH=/home/schoolm1/repositories/school-erp/ && \
cd $DEPLOYPATH && git pull origin main && \
export PUBLIC_HTML=/home/schoolm1/public_html && \
rsync -a --delete --exclude='.well-known' --exclude='cgi-bin' --exclude='school-admin' $DEPLOYPATH/landing-page/ $PUBLIC_HTML/
```

(This is the static-site half only — see §9 "Wiring it up in cPanel" for the
full command that also updates backend dependencies and runs migrations.)

No cron job, no restart file, no virtualenv — it's static files, so once
they're copied into the docroot they're live immediately.

## 17. cPanel gotcha: recreating the Python App overwrites `passenger_wsgi.py`

If the backend's Python App registration (`schoolment.com/school-erp` in
cPanel → Setup Python App) is ever destroyed and recreated — e.g. to
recover from a broken/orphaned registration — **cPanel silently overwrites
`backend/passenger_wsgi.py`** with its own generic boilerplate:

```python
import imp
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))

wsgi = imp.load_source('wsgi', 'passenger_wsgi.py')
application = wsgi.application
```

That boilerplate is broken on its own terms: it tries to load
`passenger_wsgi.py` as a module named `wsgi` *from within
`passenger_wsgi.py` itself*, which re-executes the whole file, hits the
same line again, and recurses until Python gives up
(`RecursionError: maximum recursion depth exceeded`). Every request 500s
because the app can't even be imported — this happened live on
2026-08-13, recovered by just restoring the tracked file:

```bash
cd /home/schoolm1/repositories/school-erp
git status                           # confirms backend/passenger_wsgi.py shows modified
git checkout -- backend/passenger_wsgi.py
touch backend/tmp/restart.txt
```

The real `passenger_wsgi.py` (committed in git) bridges FastAPI's ASGI app
to the WSGI interface Passenger expects, via `sync_asgi.py`'s
`make_wsgi_app()` — see both files' docstrings. **If the Python App is ever
destroyed and recreated again, re-run the `git checkout` above immediately
after** — don't assume the file survived just because Create succeeded
without an error.

To verify `passenger_wsgi.py` is actually working (not just present) after
any change to the Python App registration, reproduce Passenger's own call
directly rather than trusting a browser 500 page or manual `uvicorn`/`python
-c "from app.main import app"` runs — those don't exercise
`passenger_wsgi.py` at all and will look healthy even when it's broken:

```python
import io, sys, traceback
sys.path.insert(0, "/home/schoolm1/repositories/school-erp/backend")
import passenger_wsgi

environ = {
    "REQUEST_METHOD": "GET", "PATH_INFO": "/docs", "SCRIPT_NAME": "",
    "QUERY_STRING": "", "CONTENT_TYPE": "", "CONTENT_LENGTH": "",
    "SERVER_NAME": "schoolment.com", "SERVER_PORT": "443",
    "SERVER_PROTOCOL": "HTTP/1.1", "wsgi.version": (1, 0),
    "wsgi.url_scheme": "https", "wsgi.input": io.BytesIO(b""),
    "wsgi.errors": sys.stderr, "wsgi.multithread": False,
    "wsgi.multiprocess": False, "wsgi.run_once": False,
}
captured = {}
def start_response(status, headers, exc_info=None):
    captured["status"] = status

try:
    body = b"".join(passenger_wsgi.application(environ, start_response))
    print("SUCCESS", captured["status"], body[:200])
except Exception:
    traceback.print_exc()
```

A clean `SUCCESS 200 OK` means Passenger's actual code path works; a
traceback shows the real error directly, which log-hunting often doesn't
(this server had no `stderr.log` or per-domain `error_log` at all for this
app — the traceback only surfaces by reproducing the call directly like
this).

## 18. Admin app (frontend/) build + deploy in cPanel

> **This app is NOT built on the server.** The build tasks were removed from
> `.cpanel.yml` after three separate hard limits of the shared CloudLinux
> account made a server-side build impossible. Build it elsewhere and upload
> `dist/` by hand — see "Why the build was moved off-server" below.

### Deploying the admin app

1. Build wherever Node runs properly (a laptop, CI, any normal host):

   ```bash
   cd frontend
   VITE_API_BASE_URL=https://schoolment.com/school-erp npm run build
   ```

2. Upload the **contents** of `frontend/dist/` into
   `public_html/school-admin/`, replacing what's there.

   **Include the hidden `.htaccess`.** File managers and zip tools routinely
   skip dotfiles. Without it every deep link (`/platform-login`, and any
   route reached by refresh rather than in-app navigation) returns 404,
   because React Router's routes have no matching file on disk. This has
   already caught us once.

3. Nothing to restart — it's static files.

### Why the build was moved off-server

Each of these is a limit of the hosting account, not a misconfiguration:

1. **Node too old for Vite 8.** Its `rolldown` bundler needs Node >= 20.19;
   the host caps at 20.18.3. Genuinely fixed, by downgrading to Vite 5 —
   that part was solvable.
2. **LVE process cap.** esbuild's Go runtime could not spawn its threads:
   `failed to create new OS thread (have 17 already; errno=11)`.
3. **LVE memory cap.** The build then died on
   `WebAssembly.instantiate(): Out of memory: Cannot allocate Wasm memory`.

The tasks were **removed** rather than left in to fail, because a failing
task aborts the entire deploy: cPanel marks the deployment failed and never
updates "Last Deployed", even though the backend, the tenant migrations and
the marketing site had all already applied. That made every deploy look
broken when only the last step was.

If this account ever moves to a host without LVE limits, the build tasks can
go straight back in — the Vite 5 toolchain itself is fine, and builds in
under 10 seconds on ordinary hardware.

### Historical note

Previously `frontend/` built and deployed through the same cPanel Git
Version Control flow as everything else, via the last tasks in
`.cpanel.yml`. Unlike the backend, it never runs as a live Node
process — Node/npm are only needed to *build* it (`npm ci && npm run
build`), and the resulting static `dist/` output is rsynced into
`school-admin/`, same as any other static site.

**Where the Node environment comes from.** A dedicated `nodebuild.schoolment.com`
subdomain was created (cPanel → Domains → Create A New Domain) purely to
get a "Setup Node.js App" entry provisioned:

- Application root: `repositories/school-erp/frontend`
- Node.js version: 20.x (Vite 8 + React 19 need 20.19+/22.12+; pick the
  highest available)
- Application URL: `nodebuild.schoolment.com` (its own dedicated,
  previously-unused subdomain — **do not** point this at `schoolment.com`,
  `login.schoolment.com`, or any domain that already serves real content;
  cPanel's Node App setup takes over the *entire* target domain's routing,
  not just a subpath, which nearly repointed `login.schoolment.com` away
  from the admin app during setup)
- The app itself is left **stopped** — nothing should ever serve live
  traffic through it, it exists only so its nodevenv (`npm`/`node`) is
  available for `.cpanel.yml`'s build task to `source`.

If this Node App entry is ever recreated, the exact `source .../activate`
path depends on the Node version chosen — get it from the app's detail
page in Setup Node.js App and update `.cpanel.yml` to match. `nodebuild/`
(the subdomain's docroot, physically `$PUBLIC_HTML/nodebuild` since it's
nested inside the same account) is directory-listable from both
`nodebuild.schoolment.com/` and `schoolment.com/nodebuild/` — harmless
(nothing sensitive lives there), but worth locking down with an empty
`index.html` or `Options -Indexes` off if it bothers you.

**Where it's actually served.** `login.schoolment.com`'s document root
*is* `$PUBLIC_HTML/school-admin` directly — that's the real, canonical URL
for the admin app, not a `/school-admin/` path under the main domain
(which is also technically reachable, since `school-admin/` is physically
nested inside `public_html/`, but isn't the intended access point). This
is why the build does **not** set `VITE_BASE_PATH`: Vite's default
`base: '/'` is correct for a subdomain-root deployment. Setting it to
`/school-admin/` would break asset loading on `login.schoolment.com`,
since the HTML would reference `/school-admin/assets/...` from a docroot
that's already *inside* `school-admin/` — see `frontend/vite.config.js`'s
comment for the subpath case this option exists for, which doesn't apply
here.

**`VITE_API_BASE_URL`** is set to `https://schoolment.com/school-erp` at
build time (the backend Python App's real URL — see §17) and baked
directly into the built JS as `axios`'s `baseURL` (`frontend/src/api.js`,
`platformApi.js`) — there's no proxy or rewrite involved, so this must be
the exact public API URL.

**Before this works end to end, confirm backend CORS allows the admin
app's origin.** The backend's `CORS_ALLOWED_ORIGINS` env var (in
`backend/.env` on the server) needs `https://login.schoolment.com` in its
comma-separated list, or the deployed frontend's API calls will be
blocked by the browser even though the backend itself is healthy. This
wasn't verified as part of the initial build+deploy task setup — check
it before assuming a blank/broken-looking admin app is a build problem
rather than a CORS one.

**`school-admin/.well-known` must survive this too** — same reasoning as
the marketing-site rsync, it holds SSL/ACME files and is excluded from
the `dist/` → `school-admin/` sync for the same reason.
