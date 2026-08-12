# School ERP — Mobile App (Android & iOS)

A single React Native (Expo) codebase that runs on both Android and iOS. It talks
to the existing FastAPI backend — no backend changes are required. This replaces
the earlier Kotlin/Compose-only Android app (`android/`), which covered only the
Parent/Student portal; this app also covers staff-facing modules.

## What's built (Phase 1)

- **Auth** — school code + email + password login, TOTP MFA support, configurable
  API server URL (Login screen → **Server settings**). Session persisted locally.
- **Role-based navigation** — the drawer menu and available modules are derived
  from the `permissions` map the backend returns at login (same map that drives
  the web frontend's nav), so an Admin, Teacher, Accounts user, etc. each see only
  what they're allowed to. Parent/Student accounts land on a dedicated portal
  instead of the staff drawer.
- **Staff modules**: Dashboard (summary stats), Students, Teachers, Classes, Exams
  (list/create/edit/delete), Attendance (mark by class + date), Marks (enter by
  exam + subject), Fees (list/create/edit/delete).
- **Parent/Student portal**: My Children → per-child Profile, Attendance, Marks,
  Fees (with UPI payment: opens the deep link in any UPI app, then records the
  reference/UTR back to the school) — full feature parity with the old native
  Android app.

## What's not built yet

The backend has ~30 modules (Admissions, Hostel, Transport, Library, Payroll,
Communications, Counseling, Compliance, Health/Infirmary, Mess, Inventory,
Alumni/Withdrawals, Timetable, Homework, Online Tests, Multi-Curriculum,
International Documents, Master Data, User Management, Settings, Academic Years,
Enrichment, Student Services, Accounting…). Only the highest-priority ones are
implemented so far. Adding another CRUD module is mostly config, not new code —
see **Adding a new module** below.

## Project layout

```
mobile/
├─ App.tsx                     # providers + root navigator
├─ src/
│  ├─ api/client.ts            # fetch wrapper: base URL, auth header, X-School-Code header
│  ├─ auth/                    # AuthContext, login/session storage, permission types
│  ├─ navigation/
│  │  ├─ RootNavigator.tsx     # Login vs Staff drawer vs Parent/Student portal
│  │  ├─ StaffNavigator.tsx    # Drawer: Dashboard, Attendance, Marks + one stack per module
│  │  ├─ PortalNavigator.tsx   # Children list -> child detail tabs
│  │  └─ ModuleStack.tsx       # generic List/Detail/Form stack factory
│  ├─ modules/
│  │  ├─ types.ts              # ModuleConfig shape (fields, endpoint, columns)
│  │  └─ configs.ts            # one ModuleConfig per staff CRUD module
│  ├─ screens/
│  │  ├─ generic/              # ModuleListScreen / ModuleDetailScreen / ModuleFormScreen
│  │  ├─ dashboard/, attendance/, marks/   # bespoke screens (not generic CRUD)
│  │  └─ portal/                # parent/student portal screens + tabs
│  └─ components/Common.tsx    # shared UI kit (buttons, fields, cards, states)
```

## Adding a new module

Most backend modules are plain REST CRUD (`GET/POST/PUT/DELETE /{module}`), so
adding one to the app is:

1. Add a `ModuleConfig` in `src/modules/configs.ts` (endpoint, title fields,
   search fields, form fields — copy an existing one and adjust to match the
   Pydantic schema in `backend/app/schemas.py`).
2. Add it to the `staffModules` array (or a new array if it's parent-visible).
3. Register a `Drawer.Screen` for it in `StaffNavigator.tsx` using
   `createModuleStack(config)`, gated by `canSee(config.feature)` — the feature
   key must match `backend/app/permissions.py`'s `PATH_FEATURE_MAP`.

Modules with a non-trivial UI (bulk grids, wizards, file uploads — e.g. Hostel,
Timetable, Admissions workflow) need a bespoke screen like `AttendanceScreen` or
`MarksScreen` instead of the generic form.

## Requirements

- Node.js 20+, npm.
- **Android**: Android Studio (for an emulator) or a physical device with
  [Expo Go](https://expo.dev/go), or a dev build.
- **iOS**: a Mac with Xcode (for the simulator or physical device builds) — iOS
  development is not possible from Linux/Windows without a hosted Mac (e.g. EAS
  Build). Expo Go on a physical iPhone works from any OS for iterating on JS.

## Run it

```bash
cd mobile
npm install
npm run android   # or: npm run ios (macOS only) / npm start and scan the QR code with Expo Go
```

By default the app points at `http://10.0.2.2:8000` (the Android emulator's alias
for the host machine's `localhost`), matching `uvicorn ... --port 8000` from
`backend/SETUP.md`. On a physical device, or for a deployed backend, open
**Server settings** on the login screen and enter the real API URL (e.g. your
Render deployment).

## Building real Android/iOS binaries

This is a managed Expo project, so production builds go through
[EAS Build](https://docs.expo.dev/build/introduction/) (works from any OS,
including for iOS):

```bash
npx eas login
npx eas build:configure
npx eas build --platform android   # produces an .apk/.aab
npx eas build --platform ios       # produces an .ipa (needs an Apple Developer account)
```

Set the production API URL either via `app.json`'s `extra` field + `expo-constants`,
or keep using the in-app **Server settings** override.
