"""WSGI entry point for cPanel/Phusion Passenger's "Setup Python App".

Passenger's Python support runs WSGI apps; this backend (FastAPI) is ASGI.
`a2wsgi.ASGIMiddleware` bridges the two so Passenger can serve it without
any change to the application itself. See DEPLOYMENT_CPANEL.md.

Not used when running locally or on a host that runs ASGI apps directly
(uvicorn/gunicorn+uvicorn workers, Render, etc.) - those still target
`app.main:app` as before.
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from a2wsgi import ASGIMiddleware  # noqa: E402
from app.main import app as _fastapi_app  # noqa: E402

application = ASGIMiddleware(_fastapi_app)
