# School Portal — Android App

A native Android app (Kotlin + Jetpack Compose) for the **Parent / Student portal**
of the School ERP. It talks to the existing FastAPI backend's `/portal/*` and
`/auth/login` endpoints — no backend changes are required.

## Features

- **Multi-tenant login** — school code + email + password, with **TOTP MFA** support
  (the app prompts for the code only when the account has MFA enabled).
- **My Children** — every student linked to the signed-in Parent/Student account.
- **Per-child tabs**
  - **Profile** — student details, current enrollment, guardians.
  - **Attendance** — present/absent/late counts, attendance %, day-by-day log.
  - **Marks** — exam-wise subject marks, totals and percentage.
  - **Fees** — billed/paid/due totals, per-fee breakdown, and **UPI payment**:
    opens the deep link in any UPI app, then records the UTR back to the school.
- Configurable server address (login screen → **Server settings**), so one build
  works against local dev, staging or production.

## Requirements

- **Android Studio** (Ladybug / 2024.2 or newer).
- Android SDK 35, min SDK 24 (Android 7.0).
- JDK 17 (use Android Studio's bundled JDK — *File → Settings → Build → Gradle*).

## Build & run

1. Open the `android/` folder in Android Studio (**Open**, not Import).
2. Android Studio will download the correct Gradle distribution and generate the
   Gradle wrapper automatically, then sync. (The binary `gradle-wrapper.jar` is
   intentionally not committed; if you build from the CLI first, run
   `gradle wrapper --gradle-version 8.11.1` once to create it.)
3. Pick a device/emulator and press **Run**.

### Pointing at your backend

The API base URL is a `BuildConfig` field:

- **Debug** builds default to `http://10.0.2.2:8000` — the emulator's alias for the
  host machine's `localhost`, matching the FastAPI dev server (`uvicorn ... :8000`).
- **Release** builds default to the URL in `app/build.gradle.kts`
  (`DEFAULT_API_BASE_URL`). Edit it to your deployed backend, e.g.
  `https://school-erp-api.onrender.com`.
- Either way, users can override it at runtime under **Server settings** on the
  login screen (handy for testing against staging).

> Cleartext HTTP is enabled (`usesCleartextTraffic="true"`) so local `http://`
> dev works. For a production release pointing only at HTTPS, you can tighten
> this in `AndroidManifest.xml`.

## How it maps to the backend

| Screen      | Endpoint |
|-------------|----------|
| Login       | `POST /auth/login` (`email`, `password`, `account_code`, `mfa_code?`) |
| My Children | `GET /portal/children` |
| Profile     | `GET /portal/students/{id}/summary` |
| Attendance  | `GET /portal/students/{id}/attendance` |
| Marks       | `GET /portal/students/{id}/marks` |
| Fees        | `GET /portal/students/{id}/fees` |
| Pay (UPI)   | `GET /portal/payment/config`, `GET .../fees/{feeId}/payment/upi`, `POST .../payment/upi/confirm` |

Every request carries `Authorization: Bearer <token>` and `X-School-Code: <account_code>`.
Access is enforced server-side (`ensure_student_access`) — the app only ever sees
students the account is linked to.

## Project layout

```
app/src/main/java/com/schoolerp/portal/
├─ PortalApp.kt              # manual DI container
├─ MainActivity.kt
├─ network/                  # Retrofit service + DTOs + client
├─ data/                     # SessionStore (DataStore) + PortalRepository
└─ ui/                       # Compose screens, view models, theme
```
