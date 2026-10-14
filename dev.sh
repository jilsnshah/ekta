#!/usr/bin/env bash
# Starts the API and the Vite dev server together, and shuts both down on Ctrl-C.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
API_PORT="${API_PORT:-8000}"
WEB_PORT="${WEB_PORT:-5173}"

if [ ! -d "$ROOT/backend/.venv" ]; then
  echo "backend/.venv is missing. Run ./setup.sh first." >&2
  exit 1
fi
if [ ! -d "$ROOT/frontend/node_modules" ]; then
  echo "frontend/node_modules is missing. Run ./setup.sh first." >&2
  exit 1
fi

cleanup() {
  trap - INT TERM EXIT
  [ -n "${API_PID:-}" ] && kill "$API_PID" 2>/dev/null || true
  [ -n "${WEB_PID:-}" ] && kill "$WEB_PID" 2>/dev/null || true
}
trap cleanup INT TERM EXIT

echo "API  → http://localhost:$API_PORT  (docs at /docs)"
(cd "$ROOT/backend" && exec .venv/bin/python -m uvicorn app.main:app --reload --port "$API_PORT") &
API_PID=$!

echo "Web  → http://localhost:$WEB_PORT"
(cd "$ROOT/frontend" && VITE_API_TARGET="http://localhost:$API_PORT" exec npx vite --port "$WEB_PORT") &
WEB_PID=$!

wait
