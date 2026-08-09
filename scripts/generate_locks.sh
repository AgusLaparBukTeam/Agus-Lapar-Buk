#!/usr/bin/env sh
set -eu

ROOT="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"

echo "[1/3] Generating Python lock with uv"
cd "$ROOT/backend"
uv lock

echo "[2/3] Exporting pinned production Python requirements"
uv export --frozen --no-dev --format requirements-txt --no-hashes --output-file requirements.lock

echo "[3/3] Generating npm lock"
cd "$ROOT/frontend"
npm install --package-lock-only --ignore-scripts

echo "Lockfiles generated. Review and commit backend/uv.lock, backend/requirements.lock, and frontend/package-lock.json."
