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
- **SaaS design language shared with the web app** — `src/theme/theme.ts` ports the
  `--saas-*` tokens from `frontend/src/styles.css` 1:1 (violet `#5B4FE9` primary,
  `#F7F6FE` canvas, 18px cards, pill buttons, violet-tinted shadows), and the
  drawer uses the same nine groups, in the same order, as the web sidebar
  (`frontend/src/components/Sidebar.jsx`), with matching module labels.
- **Bespoke staff screens**: Dashboard (summary stats), Global Search (students,
  teachers, classes, exams — taps through to the record), AI Assistant (chat over
  `/chatbot/ask` with tappable suggestions), Attendance (mark a whole class for a
  date), Marks (enter marks by exam + subject), Report Card (pick student + exam →
  PDF), Certificates (bonafide, transfer certificate, transcript, ID card PDFs),
  Portal Access (link parent/student accounts to student records), Payroll
  (generate a month's payslips, mark paid), Reports (catalog-driven builder: pick
  source, dimension and measure, results as bar rows), Institution Settings.
- **Typed form inputs, not free text** — every field renders the control its data
  deserves:
  - `date` / `time` → in-app month grid / hour-and-minute picker
    (`src/components/Pickers.tsx`; 46 date and 6 time fields)
  - `select` → fixed options, taken from the backend's own `VALID_*` lists so a
    saved value can't be rejected with a 400 (68 fields)
  - `lookup` → picks a value from **another module's records** — `class_name` from
    Classes, `subject` from Subjects, `class_teacher` from Teachers (40 fields)
  - `masterSelect` → values from a **Master Data** category — Gender, House,
    Section, Blood Group, Department, Academic Year… (27 fields)
  - `reference` → foreign keys picked from a searchable record list rather than
    typing a numeric ID (31 fields)
  - `photo` → pick from library or camera, uploaded to `/uploads/`
  - `password` → masked, no autocorrect

  Lookup and master-data pickers are searchable and also accept a typed value, so
  a missing Master Data entry never blocks a form.
- **Sortable lists** — every CRUD list sorts by any of its columns (tap to
  toggle ascending → descending → off) alongside search.
- **44 CRUD modules** (list, search, detail, create, edit, delete), grouped in the
  drawer. Most are auto-derived from the deployed OpenAPI schema
  (`src/modules/generated.ts`) and then curated:
  - **People** — Students, Teachers, Users, Roles, Enrollments, Admissions,
    Admission Stages, Admission Tests, Alumni & Exits
  - **Academics** — Classes, Class Subjects, Class Exam Mapping, Subjects,
    Curricula, Exams, Exam Components, Exam Templates, Timetable, Homework,
    Online Tests, Academic Years
  - **Finance** — Fees, Fee Structures, Accounting
  - **Facilities** — Hostel Blocks, Hostel Rooms, Room Allocations, Routes, Stops,
    Vehicles, Transport Assignments, Library Books, Book Issues, Inventory,
    Mess Menus, Mess Attendance
  - **Student Life** — Counseling, Enrichment, Compliance, Student Services,
    Infirmary Visits, Intl. Documents
  - **Admin** — Master Data, Message Templates
- **Parent/Student portal**: My Children → per-child **Profile, Attendance, Marks,
  Fees** (with UPI payment: opens the deep link in any UPI app, then records the
  reference/UTR back to the school), **Timetable** (day-by-day, breaks included),
  **Homework** (with due-date urgency and attachments), **Tests** (status and
  scores) and **Messages** (two-way thread with the school).

## Known gaps

- **Layout builders** (student-profile and module layout designers) are not
  planned for mobile — they are drag-and-drop canvases that need a pointer and a
  wide viewport. Configure layouts on the web; mobile forms honour the result.
- **Taking an online test** is view-only on mobile (status and score); attempts
  still happen on the web portal.
- **Leads** is a public marketing capture endpoint with no staff-facing page on
  either client.
- Multi-step flows that stay web-only: admissions **convert-to-student**,
  academic-year **promotion runs**, and **bulk CSV import/export**.
- The web's list pages additionally offer column show/hide, saved filters and
  bulk selection; mobile lists have search and sorting.

### File handling

PDF and image endpoints are authenticated, so they can't simply be handed to the
browser. `src/api/files.ts` downloads them with the session headers into the app
cache and then opens the OS share sheet, which is also how the user saves,
prints or forwards a document. Uploads go the other way through the same module.

Relational fields (student, teacher, class) are entered as numeric IDs rather
than searchable pickers — the main UX follow-up.

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
