# Deploying this backend on shared cPanel hosting

This backend (FastAPI, ASGI) runs on shared cPanel hosting via cPanel's
**"Setup Python App"** feature (Phusion Passenger). Passenger's Python
support expects a WSGI app, so `passenger_wsgi.py` in this folder wraps the
FastAPI app with `a2wsgi.ASGIMiddleware` to bridge the two — no change to
the application code itself. This has been verified locally: a real WSGI
request through `passenger_wsgi.application` returns `200 OK` with the
expected JSON body.

**Caveat**: this WSGI bridge doesn't support WebSockets or streaming
responses. This backend doesn't use either, so it's not a practical
limitation here — just worth knowing if that ever changes.

## 1. Create the app in cPanel

cPanel → Software → **Setup Python App** → Create Application:

- **Python version**: pick the highest 3.x available
- **Application root**: e.g. `backend` (relative to your home directory —
  this is where you'll upload/clone this folder's contents)
- **Application URL**: a subdomain, e.g. `api.yourdomain.com` (keep it
  separate from wherever the frontend is hosted)
- **Application startup file**: `passenger_wsgi.py`
- **Application Entry point**: `application`

Click Create. cPanel creates a Python virtualenv for this app and shows you
an "Enter to the virtual environment" command — copy it, you'll need it
next.

## 2. Upload the code

Upload the contents of this `backend/` folder to the Application root you
picked (via Git in the cPanel Terminal if available, or File Manager/SFTP).

## 3. Install dependencies

In the cPanel Terminal, run the "enter virtualenv" command cPanel gave you
in step 1, then:

```bash
cd ~/backend   # or wherever your Application root is
pip install -r requirements.txt
```

Everything in `requirements.txt` installs from prebuilt wheels on standard
Linux — no compiler needed, verified locally with a clean `pip install`.

## 4. Set environment variables

In the Application Manager, edit this app and add these under
**Environment Variables**:

**Must set:**
| Variable | Value |
|---|---|
| `SECRET_KEY` | a long random string (JWT signing key — the app won't boot without this) |
| `CORS_ALLOWED_ORIGINS` | your production frontend's origin, e.g. `https://yourdomain.com` |
| `FRONTEND_BASE_URL` | e.g. `https://yourdomain.com` (used in password-reset emails) |
| `BACKEND_BASE_URL` | e.g. `https://api.yourdomain.com` (used in payment links) |

**Should override for security** (both have insecure defaults meant only
for local dev):
| Variable | Value |
|---|---|
| `PLATFORM_OWNER_PASSWORD` | replace the default `owner123` |
| `SEED_DEMO_USERS` | `false` (default is `true`, which seeds well-known demo logins like `admin@school.com`) |

**Optional** (leave unset to disable that feature):
| Variable | Purpose |
|---|---|
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USERNAME` / `SMTP_PASSWORD` / `SMTP_FROM` / `SMTP_TIMEOUT` | real outgoing email |
| `TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN` / `TWILIO_WHATSAPP_FROM` / `WHATSAPP_DEFAULT_COUNTRY_CODE` | WhatsApp notifications |
| `ANTHROPIC_API_KEY` | AI fallback for the chatbot |
| `CENTRAL_DATABASE_URL` / `DEFAULT_SCHOOL_DATABASE_URL` | defaults to local SQLite files; point at Postgres here if you'd rather use a cPanel-provisioned database |
| `UPLOAD_DIR` / `MAX_UPLOAD_MB` | uploaded file storage |
| `BACKUP_DIR` / `BACKUP_ENABLED` / `BACKUP_INTERVAL_HOURS` / `BACKUP_KEEP` | automatic DB backups |
| `PLATFORM_OWNER_EMAIL` / `PLATFORM_OWNER_NAME` | platform owner account identity |
| `ACCESS_TOKEN_EXPIRE_MINUTES` / `MIN_PASSWORD_LENGTH` / `LOGIN_MAX_ATTEMPTS` / `LOGIN_WINDOW_SECONDS` / `RESET_TOKEN_TTL_MINUTES` / `DEFAULT_ACCOUNT_CODE` | auth/security tuning, sensible defaults already |

## 5. Run migrations

Passenger only imports `passenger_wsgi.py` on request — it doesn't run a
startup command, so migrations need to be applied manually. In the same
virtualenv terminal session from step 3:

```bash
python manage_migrations.py upgrade head
```

Run this once now, and again after pulling any future schema change.

## 6. Restart

Click **Restart** in the Application Manager for this app.

## 7. DNS

Since `api.yourdomain.com` was created as a subdomain on this same cPanel
account in step 1, DNS is already handled — no separate step needed.

## 8. Point the frontend at it

Rebuild the frontend with its API base URL set to `https://api.yourdomain.com`,
then upload the build output to wherever the frontend is hosted (see the
frontend's own deployment notes).
