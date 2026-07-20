# School ERP Backend — Java (Spring Boot) replica

A from-scratch Java/Spring Boot port of `backend/` (FastAPI/Python), built to be
a drop-in replacement: same REST API paths, same JSON shapes (including
FastAPI's `{"detail": "..."}` error format), same JWT claims, same
multi-tenant architecture, so the existing `frontend/` can point at this
backend unmodified.

## Status: Phase 1 (foundation + auth)

This is an in-progress replica, not yet feature-complete. The Python backend
has ~21,000 lines across 47 route modules; porting it all faithfully is a
large, multi-phase effort. **Phase 1 covers the architectural foundation and
is fully working end-to-end**, verified by booting the app and exercising the
login flow against real SQLite databases:

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

### Verified manually

```
POST /auth/login {"email":"admin@school.com","password":"admin123"}  -> 200, token + user + features
GET  /auth/me (Bearer token)                                          -> 200
POST /auth/login (wrong password)                                     -> 401 {"detail":"Invalid email or password"}
POST /auth/login (unknown account_code)                                -> 404 {"detail":"School account not found"}
```

## What's not ported yet

Everything else in `backend/app/routes/`: students, teachers, classes,
attendance, fees, exams, marks, timetable, users, roles, settings,
master-data, subjects, student-enrollments, accounts, hostel, transport,
health-infirmary, mess, library, inventory, accounting, admissions (+
workflow/assessments), international-documents, multi-curriculum,
communications, student-services, alumni-withdrawals, counseling,
enrichment, compliance, exam-components, uploads, certificates, portal,
chatbot, platform (owner console), dashboard, search, academic-years,
fee-structures, module-custom-fields, module-layouts, student-custom-fields.

The pattern to extend is established: JPA `@Entity` in `entity/` (auto-picked
up by `TenantEntityScan` for schema creation — no registration needed),
Spring Data repository in `repository/`, and a `@RestController` that mirrors
the FastAPI route file directly (same paths, same `PermissionService.requireRoles(...)`
calls in place of `Depends(require_roles([...]))`), using `entity` objects as
request/response bodies where Python does the same (Jackson is configured
with `SNAKE_CASE` property naming so `mfa_enabled`, `account_code`, etc. come
out identically without per-field mapping).

## Running locally

```
cd backend-java
export SECRET_KEY=$(openssl rand -hex 32)
mvn spring-boot:run
```

Same environment variables as `backend/.env.example`, with JDBC-style DB URLs
(`jdbc:sqlite:./school_erp.db` instead of SQLAlchemy's `sqlite:///./school_erp.db`).
