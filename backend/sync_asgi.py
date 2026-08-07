"""Minimal ASGI-to-WSGI bridge for hosts (e.g. some cPanel Passenger setups)
that only speak WSGI. Not needed if your Passenger version supports ASGI
apps directly — see passenger_wsgi.py.

Runs the ASGI app to completion on a fresh event loop per request. Buffers
the full request body and response in memory rather than streaming, which
is fine for typical API request/response sizes but not for large file
uploads/downloads.
"""

import asyncio


def make_wsgi_app(asgi_app):
    def application(environ, start_response):
        loop = asyncio.new_event_loop()
        try:
            return loop.run_until_complete(_call(asgi_app, environ, start_response))
        finally:
            loop.close()
    return application


async def _call(asgi_app, environ, start_response):
    content_length = environ.get("CONTENT_LENGTH")
    content_length = int(content_length) if content_length else 0
    body = environ["wsgi.input"].read(content_length) if content_length > 0 else b""
    request_sent = False

    async def receive():
        nonlocal request_sent
        if not request_sent:
            request_sent = True
            return {"type": "http.request", "body": body, "more_body": False}
        return {"type": "http.disconnect"}

    response_body = []
    status_holder = {}

    async def send(message):
        if message["type"] == "http.response.start":
            status_holder["status"] = message["status"]
            status_holder["headers"] = [
                (k.decode("latin1"), v.decode("latin1")) for k, v in message["headers"]
            ]
        elif message["type"] == "http.response.body":
            response_body.append(message.get("body", b""))

    headers = []
    for key, value in environ.items():
        if key.startswith("HTTP_"):
            name = key[5:].replace("_", "-").lower()
            headers.append((name.encode("latin1"), value.encode("latin1")))
        elif key in ("CONTENT_TYPE", "CONTENT_LENGTH") and value:
            name = key.replace("_", "-").lower()
            headers.append((name.encode("latin1"), value.encode("latin1")))

    scope = {
        "type": "http",
        "asgi": {"version": "3.0"},
        "http_version": "1.1",
        "method": environ["REQUEST_METHOD"],
        "path": environ.get("PATH_INFO", ""),
        "raw_path": environ.get("PATH_INFO", "").encode("latin1"),
        "query_string": environ.get("QUERY_STRING", "").encode("latin1"),
        "headers": headers,
        "server": (environ.get("SERVER_NAME", ""), int(environ.get("SERVER_PORT", 0) or 0)),
        "client": (environ.get("REMOTE_ADDR", ""), 0),
        "scheme": environ.get("wsgi.url_scheme", "http"),
        "root_path": "/school-erp",
    }

    await asgi_app(scope, receive, send)

    status_line = f"{status_holder['status']} OK"
    start_response(status_line, status_holder["headers"])
    return [b"".join(response_body)]
