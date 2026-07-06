#!/usr/bin/env bash
# Run the backend test suite. In this dev environment pytest is installed under
# .pylibs (the venv site-packages is read-only); in CI/prod `pip install pytest`
# and run `python -m pytest`.
cd "$(dirname "$0")"
PY=python
[ -x venv/bin/python ] && PY=venv/bin/python
PYTHONPATH=.pylibs:"$PYTHONPATH" "$PY" -m pytest "$@"
