# School ERP — Mobile App (Android & iOS)

A single React Native (Expo) codebase that runs on both Android and iOS. It talks
to the existing FastAPI backend — no backend changes are required. This replaces
the earlier Kotlin/Compose-only Android app (`android/`), which covered only the
Parent/Student portal; this app also covers staff-facing modules.

## What's built

- **Auth** — school code + email + password login, TOTP MFA support, configurable
  API server URL (Login screen → **Server settings**). Session persisted locally.
- **Role-based navigation** — the drawer menu and available modules are derived
  from the `permissions` map the backend returns at login (same map that drives
  the web frontend's nav), so an Admin, Teacher, Accounts user, etc. each see only
  what they're allowed to. Parent/Student accounts land on a dedicated portal
  instead of the staff drawer.
- **Bespoke staff screens**: Dashboard (summary stats), Attendance (mark a whole
  class for a date), Marks (enter marks by exam + subject), Settings (school
  profile / academic / fee / grading config).
- **CRUD staff modules** (list, search, detail, create, edit, delete):
  Students, Teachers, Classes, Exams, Fees, Accounting, Timetable, Homework,
  Online Tests, Admissions, Communications, Student Services, Counseling,
  Enrichment, Compliance, International Documents, Multi-Curriculum,
  Academic Years, Hostel, Transport, Health Infirmary, Mess Management, Library,
  Inventory, Alumni & Exit, Master Data, User Management.
- **Parent/Student portal**: My Children → per-child Profile, Attendance, Marks,
  Fees (with UPI payment: opens the deep link in any UPI app, then records the
  reference/UTR back to the school) — full feature parity with the old native
  Android app.

## Known gaps

Each CRUD module covers its primary record type. A few backend modules have
secondary sub-resources or bespoke flows the app doesn't surface yet:

- **Hostel** — blocks only (rooms, allocations not yet exposed).
- **Transport** — routes only (vehicles, stops not yet exposed).
- **Library** — books only (issue/return not yet exposed).
- **Inventory** — items only (transactions, bulk issue not yet exposed).
- **Mess** — menus only (mess attendance not yet exposed).
- **Communications** — templates only (send logs not yet exposed).
- **Online Tests** — test definitions only (questions, results not yet exposed).
- **Payroll**, **Reports**, and the **AI chatbot** have no mobile screens yet.
- Admissions **convert-to-student**, academic-year **promotion runs**, PDF/report
  downloads, and file uploads are web-only for now.

Relational fields (student, teacher, class) are entered as numeric IDs rather
than pickers — a searchable reference picker is the main UX follow-up.

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
npx eas-cli login
npx eas-cli build:configure
npx eas-cli build --platform android --profile preview   # installable .apk, for sideloading/testing
npx eas-cli build --platform android --profile production # .aab, for Play Store submission
npx eas-cli build --platform ios --profile production      # .ipa (needs an Apple Developer account)
```

(Use `eas-cli`, not `eas` — `npx eas ...` resolves to the wrong package and fails
with "could not determine executable to run".)

The `preview` profile (see `eas.json`) builds a plain `.apk` you can download and
install directly on an Android phone. The default `production` profile builds an
`.aab`, which the Play Store requires but which can't be installed by hand.

Set the production API URL either via `app.json`'s `extra` field + `expo-constants`,
or keep using the in-app **Server settings** override.
