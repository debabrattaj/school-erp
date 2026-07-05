# Platform Owner Console — Implementation Notes

## What this is
A control plane for YOU (the ERP company owner) — completely separate from any
school's admin panel. From here you create tenant schools, switch their modules
on/off, suspend/reactivate whole schools, and reset school admin logins.

## How to access
1. Backend + frontend running as usual
2. Open: http://localhost:5173/platform-login
3. Default owner login (dev seed): owner@schoolerp.com / owner123
   — set PLATFORM_OWNER_EMAIL / PLATFORM_OWNER_PASSWORD / PLATFORM_OWNER_NAME
   in backend/.env BEFORE first start to seed your real credentials instead.
   (The seed only runs when no owner exists yet; to re-seed, delete the
   platform_admins row in school_accounts.db.)

## Install
Easiest: re-extract school-erp-updated.zip (everything wired).
Manual: 
- NEW backend/app/routes/platform.py
- NEW frontend/src/platformApi.js, pages/PlatformLogin.jsx, pages/PlatformConsole.jsx
- backend/app/tenant_models.py: PlatformAdmin model added
- backend/app/main.py: import + include platform.router + call
  platform.ensure_platform_owner() after init_tenant_registry()
- backend/app/routes/accounts.py: cross-tenant endpoints now require the
  platform owner (see Security below)
- frontend/src/App.jsx: /platform-login and /platform routes added
Restart the backend after installing (creates the platform_admins table).

## What the console can do
- Dashboard table of every school: status, live student/user counts (read
  from each school's own database), modules enabled (e.g. 33/35)
- Create School: makes the school's own database file, applies default
  modules (overridable at creation), and seeds its first Admin login
- Manage → Modules: checkbox grid of all 35 modules per school; changes
  reflect in that school's sidebar/APIs on next load
- Suspend / Activate: suspending a school blocks ALL its logins instantly
- Reset School Admin Login: set a new password for any admin email in a
  school (creates the admin if missing) — your support tool

## Security model (all live-tested)
- Owner logins live in the CENTRAL database (platform_admins) — not in any
  school. Tokens carry scope="platform".
- A school Admin token gets 403 on every /platform endpoint.
- IMPORTANT FIX INCLUDED: the pre-existing /accounts endpoints previously let
  ANY school's Admin list schools, create schools, and edit other schools'
  features. Those are now restricted to the platform owner too.
- A platform token is useless against school APIs (its account_code claim is
  "__platform__", which matches no tenant → 404), so even a leaked owner
  token can't read student data through school endpoints.
- Suspended school → tenant login blocked (verified), reactivate restores.

## Verified by live tests (all passing)
owner login · list with cross-tenant stats (default school: 102 students /
106 users; new school: 0/1) · create school with hostel+library enabled ·
new school's admin logs in with X-School-Code · module toggle (fees,
ai_chatbot off) instantly visible via the school's own /accounts/me ·
unknown feature key rejected · suspend blocks login (404), reactivate works ·
password reset then login with new password · tenant→platform 403 (x3) ·
platform→tenant 404 (x2) · no-token 401 · wrong password 401 ·
frontend build passes

## Production notes (for the security phase)
- Change the default owner credentials immediately (env vars above)
- The console and school app currently share one backend URL; in production
  you'd typically serve the console on a separate hostname and firewall
  /platform/* to your IPs
- Consider audit logging (who toggled what, when) before real customers
