# School ERP Backend — Java (Spring Boot) replica

A from-scratch Java/Spring Boot port of `backend/` (FastAPI/Python), built to be
a drop-in replacement: same REST API paths, same JSON shapes (including
FastAPI's `{"detail": "..."}` error format), same JWT claims, same
multi-tenant architecture, so the existing `frontend/` can point at this
backend unmodified.

## Status: Phase 3 (foundation + auth + core academic/admin modules)

This is an in-progress replica, not yet feature-complete. The Python backend
has ~21,000 lines across 47 route modules; porting it all faithfully is a
large, multi-phase effort. **The foundation is fully working end-to-end**,
verified by booting the app and exercising real HTTP requests against real
SQLite databases:

- Multi-tenancy: a central registry DB (`SchoolAccount`/`SchoolFeature`/
  `PasswordResetToken`/...) plus per-school databases, using Hibernate's
  DATABASE multi-tenancy strategy (`TenantConnectionProvider` +
  `TenantIdentifierResolver`) with tenant databases created and
  schema-migrated on first access — mirrors `backend/app/tenant.py` +
  `database.py`.
- Tenant resolution per request: JWT `account_code` claim wins over the
  `X-School-Code` header (security-critical — see `TenantAccountService`),
  matching `get_account_code_from_request` exactly.
- Security: HS256 JWT (`JwtService`), Argon2id password hashing with the
  same parameters as `argon2-cffi` (`PasswordService`), TOTP MFA
  (`TotpService`, hand-rolled RFC 6238 to match `totp.py` exactly), and a
  role/permission system (`PermissionCatalog`, `PermissionService`) ported
  line-for-line from `permissions.py` — system roles keep hardcoded
  name-based checks, custom roles use their JSON permission map.
- `/auth/*`: login, me, mfa/status, mfa/setup, mfa/verify, mfa/disable,
  forgot-password, reset-password — full parity with `routes/auth.py`,
  including login throttling (`LoginRateLimiter`), the reset-token email
  flow (`MailerService`, log-only without SMTP config), and demo-user/
  master-data seeding (`SeedService`, ported from `seed.py`).
- Global error handling produces the exact `{"detail": "..."}` shape the
  frontend already expects (`error.response.data.detail`), so no frontend
  changes are needed for the endpoints implemented so far.
- Full CRUD parity for: `/students`, `/teachers`, `/classes`, `/subjects`
  (+ `/class-subjects`, `/class-exam-mappings`), `/attendance`, `/exams`,
  `/exam-components`, `/marks` (grade calculation, per-component scores),
  `/users`, `/roles`, `/settings`, `/master-data`, `/academic-years`,
  `/timetable` (teacher-clash + slot-clash validation), `/dashboard`
  (`/summary`, `/trends`, the whitelisted `/report` aggregation engine for
  students/fees/attendance/marks/teachers, and per-user `/layout`),
  `/fees` (billing, bulk class-fee creation resolved against fee
  structures, UPI payment link + confirmation), `/fee-structures`
  (specificity-ordered lookup, class-wide split-by-residential-type lookup),
  `/student-enrollments` (create/list/update/delete, sync-from-profile,
  class promotion, full year-end processing with promote/detain/graduate
  actions and optional fee carry-forward, and mark-based promotion
  suggestions), `/admissions` (inquiry CRUD, follow-ups, convert-to-student),
  `/admission-workflow-stages` (default-stage auto-seeding, in-use guard on
  delete, cascading a stage rename onto every inquiry in that stage), and
  `/admission-assessments` (with the inquiry-joined response fields).
  Both event-driven staff/guardian notification side effects are wired up
  too: creating a student best-effort emails/SMSes the resolved class
  teacher (`NotificationService.notifyClassTeacherNewStudent`, matching
  `find_class_teacher`'s three-tier resolution exactly), and creating a fee
  with an outstanding balance best-effort WhatsApps the guardian a signed,
  30-day-expiring UPI payment link (`notifyGuardianFeeAdded` +
  `PaymentLinkService`, a direct port of `app/payment_links.py`'s JWT
  scheme reusing `JwtService`'s signing key). Both routed through a new
  `CommunicationDeliveryService` extracted from `CommunicationController`
  so the delivery logic — Email/WhatsApp/SMS channel dispatch, subject
  fallback — is shared between the `/communications` endpoints and these
  notification hooks, exactly like the Python source's shared
  `deliver_message()` free function.
  `GET /marks/report-card`, `GET /timetable/pdf`, and `GET
  /fees/{id}/receipt` are ported too — see `PdfService` below. Not yet
  ported: students' CSV bulk-import endpoints, and `GET /fees/{id}/pay`
  (the public guardian payment page itself — the signed token it validates
  is ported and generated correctly, just not yet consumed by a page).
- `PdfService` — a full port of `app/pdf.py`'s seven PDF generators (fee
  receipt, report card, transcript, timetable grid, bonafide certificate,
  transfer certificate, student ID card) using iText7 instead of reportlab.
  Deliberately **not** pixel-matched to the Python original: it uses
  iText's high-level `Document`/`Table` layout API rather than replicating
  reportlab's manual mm-coordinate canvas positioning, because a PDF
  download is consumed as a document by a human, not parsed field-by-field
  like the JSON endpoints — content and data parity is what matters here,
  not byte-for-byte layout. `report_card_pdf`, `timetable_pdf`, and
  `fee_receipt_pdf` are wired into `GET /marks/report-card`, `GET
  /timetable/pdf`, and `GET /fees/{id}/receipt` respectively, each
  verified to return a real, valid, correctly-populated PDF. The other
  four generators (transcript, both certificates, ID card) are wired into
  `/students/{id}/bonafide`, `/students/{id}/transfer-certificate`,
  `/students/{id}/transcript`, and `/students/{id}/id-card`
  (`CertificateController`, a direct port of `app/routes/certificates.py`
  — same `/students` prefix so access is governed by the students
  permission, matching the Python source's routing comment). The
  transcript endpoint's multi-year/multi-exam grouping and grade
  calculation share `GradeService` (extracted from `MarkController`) with
  `/marks/report-card`, matching the Python source's shared
  `calculate_grade()` import between `marks.py` and `certificates.py`.
- `/portal` — the parent/student self-service portal, a direct port of
  `app/routes/portal.py`. Uses the *same* JWT auth as every other module
  (Parent/Student are just more entries in `PermissionCatalog`'s
  system-role table, already recognized) — no separate auth scheme was
  needed despite the module's size. The security-critical piece is
  `ensureStudentAccess`: Parent/Student users can only reach a student
  they're explicitly linked to via `ParentStudentLink` (Admin/Principal
  bypass the check), enforced on every single portal data endpoint
  (`/children`, `/students/{id}/summary`, `/attendance`, `/marks`,
  `/fees`, `/enrollments`, and both UPI-payment endpoints) exactly like
  the Python source's `ensure_student_access` call at the top of each
  handler. Also includes the admin-only `/portal/links` CRUD (with the
  Parent/Student role-only and duplicate-link and one-student-per-Student-
  account checks) and the UPI deep-link + confirm-payment flow, which
  shares `FeeService` (extracted from `FeeController`, matching the Python
  source's `calculate_fee_status`/`generate_receipt_no`/`get_settings`
  being imported by both `fees.py` and `portal.py`) so a portal-confirmed
  payment updates a fee identically to a staff-recorded one. The UPI URI's
  query-string encoding matches Python's `urllib.parse.quote` byte-for-
  byte (`%20` for spaces, not `URLEncoder`'s default `+`).
- `/communications` — template CRUD (`/templates/`) and message-log CRUD
  (`/logs/`, `/logs/{id}/send`, `/logs/{id}/status`) with real delivery
  routing: Email via `MailerService`, WhatsApp/SMS via the newly-ported
  `WhatsAppService` (`app/whatsapp.py`, Twilio API, log-only fallback when
  unconfigured), In App auto-marked Sent — matches `deliver_message`'s
  per-channel dispatch in `routes/communications.py` exactly, including
  `email_subject_for`'s template-subject → category → generic-fallback
  chain and the log response's joined `template_name` field.
- `/student-services` (support ticket CRUD with auto-numbered `SVC-nnnn`
  ticket numbers and student-joined response fields), `/counseling`
  (wellbeing case CRUD with a required student link, risk/confidentiality
  levels, and student+guardian-joined response fields), `/enrichment`
  (extracurricular activity CRUD with capacity/fee validation),
  `/compliance` (accreditation task CRUD across IB/Cambridge/CBSE/etc.),
  and `/alumni-withdrawals` (withdrawal/transfer/alumni record CRUD with
  `hydrate_student_snapshot`'s exact fallback chain — student name, admission
  no., "class section" last-class string, and guardian email/phone are
  pulled from the linked student only when not explicitly supplied).
- `/health-infirmary` (infirmary visit CRUD with student-joined response),
  `/mess` (menu CRUD unique per date+meal, attendance CRUD unique per
  student+date+meal — both composite constraints enforced with app-level
  pre-checks, not DB constraints), `/hostel` (blocks/rooms/allocations —
  room capacity vs. active-allocation-count validation, one-active-allocation-
  per-student, room-fill and bed-clash pre-checks, occupied/available-bed
  counts on the room response), and `/transport` (routes/vehicles/stops/
  assignments — vehicle-capacity vs. active-assignment-count validation,
  one-active-assignment-per-student, vehicle-fill checks, a stop's route
  must match the assignment's route, assigned/available-seat counts on the
  vehicle response). All four follow the same explicit find-before-insert
  uniqueness pattern established for composite constraints.
- `/library` (book CRUD, issue/return CRUD that decrements/increments
  `available_copies` exactly like the Python original, including the
  status-transition edge cases in `update_issue`), `/inventory` (item CRUD,
  stock-transaction CRUD implementing `apply_stock`'s three-way branch for
  IN/OUT/Adjustment transaction types, and `/bulk-issue` — the per-item,
  per-student cycle+academic-year duplicate-skip and insufficient-stock-skip
  logic, ported field-for-field including the required-quantity check
  before touching any stock), `/accounting` (`/summary` and `/ledger`
  aggregating fee payments + inventory purchases + manual entries into a
  unified income/expense view with a monthly breakdown, `/export/tally`
  generating the same Tally-import XML voucher format byte-for-byte
  including the Receipt/Payment debit-credit sign convention, and manual
  ledger-entry CRUD with a `Map<String,Object>` partial-update endpoint
  matching `exclude_unset=True`), `/international-documents` (passport/visa
  document CRUD with student-joined response), and `/multi-curriculum`
  (curriculum-plan CRUD across IB/Cambridge/CBSE/etc. tracks with an
  optional class link and computed `class_display` field).
- `/uploads` (multipart file upload with the same extension allow-list,
  size cap, and per-tenant-directory/UUID-filename scheme as `app/
  uploads.py`, served back at `/uploads/**` via a `WebMvcConfigurer`
  resource handler mirroring `main.py`'s `StaticFiles` mount), `/search`
  (global search across students/teachers/classes/exams, 6-results-per-
  module cap), `/module-custom-fields` and `/students/{id}/custom-fields`
  (arbitrary per-record custom field storage with upsert-by-field-key bulk
  save, existence-checked against the record's own module table — both
  routers are deliberately unauthenticated, matching the Python source),
  and `/module-layouts` (per-module drag-and-drop layout JSON storage,
  soft-deleted via `is_active`, also deliberately unauthenticated).

### Verified manually

```
POST /auth/login {"email":"admin@school.com","password":"admin123"}   -> 200, token + user + features
GET  /auth/me (Bearer token)                                           -> 200
POST /auth/login (wrong password)                                      -> 401 {"detail":"Invalid email or password"}
POST /auth/login (unknown account_code)                                -> 404 {"detail":"School account not found"}
POST /teachers (no Authorization header)                               -> 200 (teachers.py has no auth dependency)
POST /students (Bearer token)                                          -> 200, roll_no auto-assigned
GET  /students (no Authorization header)                               -> 401 {"detail":"Invalid or expired token"}
GET  /students/next-roll-no?class_name=5&section=A                     -> 200, correct next number
```

## What's not ported yet

Everything else in `backend/app/routes/`: chatbot.

`accounts` (school-account CRUD, feature-flag management) is deliberately
deferred together with `platform` (the ~1,100-line owner console it depends
on for `require_platform_owner` auth and tenant provisioning) — porting one
without the other isn't meaningful, and the pair is architecturally
significant enough to warrant its own dedicated pass rather than being
folded into a routine CRUD-module batch.

## Pattern for porting a module (and gotchas hit so far)

1. JPA `@Entity` in `entity/` — auto-picked up by `TenantEntityScan` for
   schema creation, no registration needed.
2. Spring Data repository in `repository/`.
3. A `@RestController` that mirrors the FastAPI route file directly: same
   paths, same order of validation, using `entity` objects as request/response
   bodies where Python does the same (no separate Response DTO needed —
   see the JSON naming note below). For partial updates (Python's
   `payload.model_dump(exclude_unset=True)`), take `Map<String, Object>`
   as the request body instead of a typed DTO and only touch keys that are
   present, exactly like the Python source — see `StudentController.updateStudent`.

**Auth is opt-in per route, not global.** FastAPI has no blanket
"require auth" layer — each endpoint calls `Depends(get_current_user)` /
`Depends(require_roles([...]))` or it doesn't (`teachers.py` doesn't, at
all). `SecurityConfig` therefore `permitAll()`s every request at the HTTP
layer; enforcement is entirely `PermissionService.requireRoles(...)` /
`.getCurrentUser()` calls placed exactly where the Python source places
`Depends(...)`. Do not add blanket `.authenticated()` rules — check the
Python route file for what it actually requires, endpoint by endpoint.

**Jackson's `SNAKE_CASE` naming strategy runs on the derived bean property
name, after Jackson's own `is`-prefix stripping — not on your field name.**
A primitive boolean getter `isActive()` becomes property `active` (Jackson
strips `is`), which then becomes JSON key `active`, not Python's `is_active`.
Fix: annotate the getter with `@JsonProperty("is_active")` explicitly. Boxed
`Boolean` DTOs avoid the trap entirely if you use `getIsActive()`/`setIsActive()`
naming instead of `isActive()` (see `TeacherCreate.isClassTeacher`).

**`@RequestParam` binds to the literal Java parameter name — Jackson's
naming strategy does not apply to query parameters at all**, only JSON
request/response bodies. A Python query param `class_name` needs
`@RequestParam(name = "class_name") String className` in Java, not just
`@RequestParam String className` (which binds to `?className=`, silently
leaving it null against real traffic). Check every `@RequestParam` with an
underscore in the Python source.

**A Python `@property` alias (e.g. `SchoolClass.room_no` aliasing the
`room_number` column) needs the underlying column's getter `@JsonIgnore`-d
and only the alias name exposed via `@JsonProperty`**, or both names leak
into the JSON body. See `SchoolClass.getRoomNumber()`/`getRoomNo()`.

**Never set `spring.jackson.default-property-inclusion: non_null`** (this
was set briefly and then reverted). FastAPI/Pydantic includes `Optional`
fields with a `None` value in the response body by default — no route here
sets `response_model_exclude_none=True` — so every entity/DTO response
should too. That setting silently drops null fields instead, shrinking
every response body relative to the Python original (caught via
`GET /dashboard/layout` returning `{}` instead of `{"widgets": null}`).

**Two Hibernate naming/exception-translation traps that silently produced
wrong behavior in manual testing, not compile errors — worth re-reading if
something Just Doesn't Work:**

1. *Column naming.* Spring Boot's Hibernate auto-configuration (which wires
   in `SpringImplicitNamingStrategy` + `CamelCaseToUnderscoresNamingStrategy`
   so `dayOfWeek` → `day_of_week`) is disabled here in favor of the manual
   multi-tenant EMF setup, so **both** `CentralPersistenceConfig` and
   `TenantPersistenceConfig` — and the schema-bootstrap `SessionFactory` in
   `TenantDataSourceManager` (must match exactly, or a freshly-created tenant
   DB gets different DDL than what the runtime EMF expects) — set
   `hibernate.physical_naming_strategy` / `implicit_naming_strategy`
   explicitly. Without it, unannotated columns get raw camelCase names, and
   any `@UniqueConstraint`/`@Column(name=...)` written assuming snake_case
   silently fails to apply (Hibernate can't find a column called
   `academic_year` when the real column is `academicYear`).
2. *Composite unique constraints are unreliable with hbm2ddl `update` +
   SQLite.* Single-column `@Column(unique = true)` works fine (verified:
   shows up as `... unique` in the generated DDL). Multi-column
   `@Table(uniqueConstraints = ...)` does **not** get created at all under
   schema-update mode — confirmed by inspecting `sqlite_master` directly, no
   compile or runtime error, the constraint is just silently absent. On top
   of that, SQLite's JDBC driver returns no usable SQLState, so even when a
   constraint *does* fire, Hibernate can't classify it as
   `DataIntegrityViolationException` (it surfaces as a generic
   `JpaSystemException` instead) — so `catch (DataIntegrityViolationException)`
   is not reliable here the way `except IntegrityError` is in the Python/
   SQLAlchemy original. **Every duplicate check needs an explicit
   find-before-insert pre-check in the controller** (see
   `SubjectController`'s `requireNoClassSubjectClash`/`requireNoClassExamClash`,
   `TimetableController.checkSlotClash`) — don't rely on the database or the
   exception handler alone. `GlobalExceptionHandler` catches
   `DataIntegrityViolationException`/`JpaSystemException` as a generic 400
   safety net, but that net has a generic, non-Python-matching message, so
   treat hitting it as a bug to fix with a proper pre-check, not a working
   feature.

**SQLite's compound-SELECT term limit breaks schema bootstrap once the
entity count grows large enough — hit at ~49 entities, will recur if more
are added and this setting is ever lost.** Hibernate's schema migrator
fetches every table's column metadata in one batch by default ("grouped"
mode), which on SQLite means the JDBC driver builds a single SQL statement
that's effectively a UNION across every table. Past a certain entity count
this exceeds SQLite's `SQLITE_LIMIT_COMPOUND_SELECT`, and the app fails to
boot with `[SQLITE_ERROR] SQL error or missing database (too many terms in
compound SELECT)`. Fixed by setting
`hibernate.hbm2ddl.jdbc_metadata_extraction_strategy=individually` (forces
one query per table instead of one big grouped query) in both
`CentralPersistenceConfig` and `TenantDataSourceManager.ensureSchema()` —
must be set in both places, same as the naming-strategy properties, for
the same "throwaway bootstrap SessionFactory vs. runtime EMF" reason.

## Running locally

```
cd backend-java
export SECRET_KEY=$(openssl rand -hex 32)
mvn spring-boot:run
```

Same environment variables as `backend/.env.example`, with JDBC-style DB URLs
(`jdbc:sqlite:./school_erp.db` instead of SQLAlchemy's `sqlite:///./school_erp.db`).
