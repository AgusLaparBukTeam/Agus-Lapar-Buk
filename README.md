# GateGuard

GateGuard is an internal operations console for pre-dispatch shipment document assurance. It accepts a Surat Jalan / Delivery Order, Invoice, and Packing List, extracts structured evidence, and applies deterministic `CLEAR`, `REVIEW`, or `HOLD` rules. Extraction may be probabilistic; the operational decision is not.

## Architecture

```text
Browser
  -> Next.js operations console + BFF (HttpOnly session cookie, server API key)
  -> FastAPI modular monolith
       auth / sessions / RBAC / audit
       reconciliation API + query endpoints
       extraction adapters + deterministic domain engine
  -> PostgreSQL in production, SQLite for local development/tests
```

The browser never receives the backend service key, provider credentials, database credentials, or session token through JavaScript. The BFF forwards the browser cookie and keeps the service credential server-side.

## Operations console

- `/login` — database-backed login.
- `/dashboard` — persisted daily counts, latency, and recent activity.
- `/reconcile` — three-file reconciliation workspace and authorized override flow.
- `/history` and `/history/[id]` — paginated history and durable structured investigation.
- `/monitoring` — application/database/provider readiness and real persisted volume.
- `/audit` — supervisor/admin audit events.
- `/settings` and `/settings/users` — safe runtime information and admin-only user management.

Roles are `operator`, `supervisor`, and `admin`. Operators can reconcile and inspect results; supervisors can override and view operational audit events; admins can manage users and view all audit events. Backend dependencies enforce these policies; hiding a frontend control is not the security boundary.

## Local setup

```bash
cp .env.example .env
docker compose up --build
```

Or run services directly:

```bash
cd backend
python -m venv .venv
.venv\\Scripts\\activate
python -m pip install -e ".[dev]"
alembic upgrade head
python scripts/create_admin.py
uvicorn app.main:app --reload --port 8000

cd ../frontend
npm ci --include=dev
npm run dev
```

The first admin is created interactively. The password is never committed or logged. In production, run migrations before the application and then run the same bootstrap command against the production database.

## Database and security

Migrations are in `backend/alembic/versions`. The current schema includes `users`, opaque-token `sessions`, `reconciliations`, append-only `reconciliation_overrides`, and `audit_events`. Passwords use Argon2id; only SHA-256 hashes of random session tokens are stored. Cookies are HttpOnly, SameSite=Lax, and Secure in production. Deactivation revokes active sessions, and the final active admin cannot be demoted or deactivated.

Override identity is derived from the authenticated session. The request cannot choose an arbitrary actor or submit a shared supervisor credential. Every login, logout, reconciliation creation, override, and user administration action emits a safe audit event.

Production requires PostgreSQL, a 32+ character `APP_API_KEY`, explicit non-wildcard `CORS_ORIGINS`, and secure cookie configuration. Never put `OPENAI_API_KEY`, `APP_API_KEY`, database passwords, or other secrets in `NEXT_PUBLIC_*` variables.

## Extraction providers

`EXTRACTION_PROVIDER` accepts `local`, `openai`, `paddle`, or `auto`. Local PDF extraction is the default safe development path. Provider configuration is shown only as a boolean in monitoring; secret values are never returned.

## Tests and validation

```bash
cd backend
python -m pytest
python -m ruff check app scripts tests
python ../evaluation/run.py
alembic upgrade head

cd ../frontend
npm test
npm run lint
npm run build
```

Compose files are `docker-compose.yml` for local SQLite and `docker-compose.prod.yml` for PostgreSQL plus a migration job. Docker Compose validation requires Docker to be installed.

## Scope limitation

Historical investigation deliberately persists structured evidence and provenance, not raw shipment files. GateGuard verifies cross-document consistency; it does not prove physical contents or replace an authoritative WMS/ERP shipment reference.
