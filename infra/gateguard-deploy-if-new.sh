#!/usr/bin/env bash
set -euo pipefail

APP_DIR="/opt/gateguard"
STATE_DIR="/var/lib/gateguard"
SUCCESS_FILE="${STATE_DIR}/last-successful-sha"
LOCK_FILE="${STATE_DIR}/deploy.lock"
DEPLOY_MODE="${GATEGUARD_DEPLOY_MODE:-images}"

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

echo "Preparing GateGuard deployment ${TARGET_SHA} using mode ${DEPLOY_MODE}."
git checkout --force main
git reset --hard "${TARGET_SHA}"

if [[ "${DEPLOY_MODE}" == "images" ]]; then
  export IMAGE_TAG="${TARGET_SHA}"
  remote_owner="$(git remote get-url origin | sed -nE 's#.*github\.com[:/]([^/]+)/[^/]+(\.git)?#\1#p')"
  IMAGE_OWNER="${GATEGUARD_IMAGE_OWNER:-${remote_owner}}"
  IMAGE_OWNER="$(printf '%s' "${IMAGE_OWNER}" | tr '[:upper:]' '[:lower:]')"
  export IMAGE_OWNER
  if [[ -z "${IMAGE_OWNER}" ]]; then
    echo "Unable to determine IMAGE_OWNER from origin; set GATEGUARD_IMAGE_OWNER explicitly." >&2
    exit 2
  fi
  compose_files=(-f docker-compose.prod.yml -f docker-compose.prod.images.yml)

  echo "Pulling immutable production images for ${IMAGE_OWNER} at ${IMAGE_TAG}."
  docker compose "${compose_files[@]}" pull
  docker compose "${compose_files[@]}" up -d --no-build --remove-orphans
elif [[ "${DEPLOY_MODE}" == "build" ]]; then
  echo "Building production images locally by explicit fallback."
  docker compose -f docker-compose.prod.yml up -d --build --remove-orphans
else
  echo "Unsupported GATEGUARD_DEPLOY_MODE: ${DEPLOY_MODE}" >&2
  exit 2
fi

for attempt in $(seq 1 60); do
  postgres_status="$(docker inspect --format '{{.State.Health.Status}}' gateguard-postgres-1 2>/dev/null || true)"
  backend_status="$(docker inspect --format '{{.State.Health.Status}}' gateguard-backend-1 2>/dev/null || true)"

  if [[ "${postgres_status}" == "healthy" ]] \
    && [[ "${backend_status}" == "healthy" ]] \
    && curl --fail --silent --show-error http://127.0.0.1/login >/dev/null; then
    printf '%s\n' "${TARGET_SHA}" > "${SUCCESS_FILE}"
    echo "GateGuard deployment ${TARGET_SHA} is healthy."
    exit 0
  fi

  sleep 5
done

echo "GateGuard deployment ${TARGET_SHA} did not become healthy; it will be retried on the next timer run." >&2
if [[ "${DEPLOY_MODE}" == "images" ]]; then
  docker compose -f docker-compose.prod.yml -f docker-compose.prod.images.yml ps >&2 || true
  docker compose -f docker-compose.prod.yml -f docker-compose.prod.images.yml logs --tail=80 >&2 || true
else
  docker compose -f docker-compose.prod.yml ps >&2 || true
  docker compose -f docker-compose.prod.yml logs --tail=80 >&2 || true
fi
exit 1
