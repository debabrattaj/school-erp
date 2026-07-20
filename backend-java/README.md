# School ERP Backend — Java (Spring Boot) replica

A from-scratch Java/Spring Boot port of `backend/` (FastAPI/Python), built to be
a drop-in replacement: same REST API paths, same JSON shapes (including
FastAPI's `{"detail": "..."}` error format), same JWT claims, same
multi-tenant architecture, so the existing `frontend/` can point at this
backend unmodified.

## Status: Phase 2 (foundation + auth + first academic modules)

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
- `/students/*` and `/teachers/*`: full CRUD parity with `routes/students.py`
  (roll-number auto-assignment vs. manual mode, validation rules) and
  `routes/teachers.py` (class-teacher assignment sync). Note `teachers.py`
  calls no auth dependency on any endpoint in the Python source — replicated
  exactly (see "opt-in auth" below), unlike `students.py` which does.
  Not yet ported: students' CSV bulk-import endpoints and the
  new-admission notification side effect (both depend on modules not yet
  ported).

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

Everything else in `backend/app/routes/`: classes, subjects, attendance,
fees, exams, marks, timetable, users, roles, settings, master-data,
student-enrollments, accounts, hostel, transport, health-infirmary, mess,
library, inventory, accounting, admissions (+ workflow/assessments),
international-documents, multi-curriculum, communications, student-services,
alumni-withdrawals, counseling, enrichment, compliance, exam-components,
uploads, certificates, portal, chatbot, platform (owner console), dashboard,
search, academic-years, fee-structures, module-custom-fields,
module-layouts, student-custom-fields.

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

## Running locally

```
cd backend-java
export SECRET_KEY=$(openssl rand -hex 32)
mvn spring-boot:run
```

Same environment variables as `backend/.env.example`, with JDBC-style DB URLs
(`jdbc:sqlite:./school_erp.db` instead of SQLAlchemy's `sqlite:///./school_erp.db`).
