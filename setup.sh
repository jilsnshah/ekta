#!/usr/bin/env bash
# One-time setup: Python virtualenv, Node packages, and a seeded database.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PYTHON="${PYTHON:-python3}"

echo "==> Backend virtualenv"
cd "$ROOT/backend"
"$PYTHON" -m venv .venv
.venv/bin/pip install --quiet --upgrade pip
.venv/bin/pip install --quiet -r requirements-dev.txt

echo "==> Seeding the demo fleet (72 trucks, 72 drivers, transport orders, trips)"
.venv/bin/python -m app.seed --reset

echo "==> Frontend packages"
cd "$ROOT/frontend"
npm install

cat <<'DONE'

Setup complete.

  ./dev.sh        start the API (:8000) and the web app (:5173)

  Admin login:  admin@fleetops.in / admin123
  Driver login: driver@fleetops.in / driver123
DONE
