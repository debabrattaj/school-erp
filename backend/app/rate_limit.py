"""Lightweight in-memory login rate limiter.

Tracks recent failed login attempts per key (client IP and target email) in a
sliding window and blocks further attempts once a threshold is exceeded. This
throttles credential brute-forcing without any external dependency.

Tunable via env vars:
  LOGIN_MAX_ATTEMPTS   failures allowed within the window (default 8)
  LOGIN_WINDOW_SECONDS sliding window / lockout length in seconds (default 900)

NOTE: state lives in this process only. With multiple uvicorn workers each has
its own counters, so for a real multi-worker deployment back this with a shared
store (e.g. Redis). For the current single-process setup it is effective.
"""

import os
import time
import threading
from collections import defaultdict

MAX_ATTEMPTS = int(os.getenv("LOGIN_MAX_ATTEMPTS", "8"))
WINDOW_SECONDS = int(os.getenv("LOGIN_WINDOW_SECONDS", "900"))

_lock = threading.Lock()
_failures: dict[str, list[float]] = defaultdict(list)


def _prune(key: str, now: float) -> None:
    cutoff = now - WINDOW_SECONDS
    kept = [t for t in _failures.get(key, []) if t > cutoff]
    if kept:
        _failures[key] = kept
    else:
        _failures.pop(key, None)


def login_keys(ip: str | None, email: str | None) -> list[str]:
    """Build the rate-limit keys for a login attempt.

    Keyed on both the client IP (blocks one source hammering many accounts) and
    the target email (blocks a distributed attack on one account).
    """
    keys = [f"ip:{ip or 'unknown'}"]
    if email:
        keys.append(f"user:{email.strip().lower()}")
    return keys


def check_login_allowed(keys: list[str]) -> int | None:
    """Return None if allowed, else the Retry-After seconds until a slot frees."""
    now = time.time()
    with _lock:
        retry_after = None
        for key in keys:
            _prune(key, now)
            attempts = _failures.get(key, [])
            if len(attempts) >= MAX_ATTEMPTS:
                wait = int(WINDOW_SECONDS - (now - attempts[0])) + 1
                retry_after = max(retry_after or 0, wait)
        return retry_after


def record_login_failure(keys: list[str]) -> None:
    now = time.time()
    with _lock:
        for key in keys:
            _failures[key].append(now)


def clear_login_failures(keys: list[str]) -> None:
    with _lock:
        for key in keys:
            _failures.pop(key, None)
