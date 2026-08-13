#!/usr/bin/env bash
set -euo pipefail

APP_DIR="/opt/gateguard"
STATE_DIR="/var/lib/gateguard"
SUCCESS_FILE="${STATE_DIR}/last-successful-sha"
LOCK_FILE="${STATE_DIR}/deploy.lock"

install -d -m 0755 "${STATE_DIR}"
exec 9>"${LOCK_FILE}"
if ! flock -n 9; then
  echo "A GateGuard deployment is already running; skipping this check."
  exit 0
fi

cd "${APP_DIR}"
git fetch --quiet origin main
TARGET_SHA="$(git rev-parse origin/main)"
LAST_SUCCESSFUL_SHA="$(cat "${SUCCESS_FILE}" 2>/dev/null || true)"

if [[ "${TARGET_SHA}" == "${LAST_SUCCESSFUL_SHA}" ]]; then
  echo "GateGuard is already running the last successfully deployed commit ${TARGET_SHA}."
  exit 0
fi

echo "Deploying GateGuard commit ${TARGET_SHA}."
git checkout --force main
git reset --hard "${TARGET_SHA}"

docker compose -f docker-compose.prod.yml up -d --build --remove-orphans

for attempt in $(seq 1 60); do
  postgres_status="$(docker inspect --format '{{.State.Health.Status}}' gateguard-postgres-1 2>/dev/null || true)"
  backend_status="$(docker inspect --format '{{.State.Health.Status}}' gateguard-backend-1 2>/dev/null || true)"

  if [[ "${postgres_status}" == "healthy" ]] \
    && [[ "${backend_status}" == "healthy" ]] \
    && curl --fail --silent --show-error http://127.0.0.1/login >/dev/null; then
    install -d -m 0755 "${STATE_DIR}"
    printf '%s\n' "${TARGET_SHA}" > "${SUCCESS_FILE}"
    echo "GateGuard deployment ${TARGET_SHA} is healthy."
    exit 0
  fi

  sleep 5
done

echo "GateGuard deployment ${TARGET_SHA} did not become healthy; it will be retried on the next timer run." >&2
docker compose -f docker-compose.prod.yml ps >&2 || true
docker compose -f docker-compose.prod.yml logs --tail=80 >&2 || true
exit 1
