"""cPanel/Passenger entrypoint for hosts that serve this app as a WSGI
application (some cPanel Python App / Passenger setups don't support ASGI
apps directly). sync_asgi.py lives alongside this file, so no sys.path
changes are needed — Passenger already runs this script with its own
directory as part of sys.path.
"""

from sync_asgi import make_wsgi_app
from app.main import app as asgi_app

application = make_wsgi_app(asgi_app)
