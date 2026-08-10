# GateGuard

GateGuard is an organization-scoped shipment assurance workspace. It brings shipment cases, evidence, checks, exceptions, approvals, and dispatch decisions into one operational record. Extraction may be probabilistic; release decisions remain deterministic, reviewable, and fail closed.

## Architecture

```text
Browser
  -> Next.js operations console + BFF (HttpOnly session cookie, server API key)
  -> FastAPI modular monolith
       organizations / facilities / memberships
       auth / sessions / RBAC / audit / four-eyes approval
       shipment lifecycle / work queue / document vault
       assurance checks / exceptions / rule packs / screening records
       integrations / service tokens / webhooks / processing jobs
       analytics / observability / deterministic domain rules
  -> PostgreSQL in production, SQLite for local development/tests
```

The browser never receives backend service keys, provider credentials, database credentials, or session tokens through JavaScript. The BFF forwards the browser cookie and keeps service credentials server-side.

## Operations workspace

- `/login` — database-backed sign-in with temporary-password enforcement.
- `/dashboard` — active shipments, exceptions, overdue work, release readiness, and recents.
- `/shipments` — shipment register and a tabbed operational record.
- `/documents`, `/parties`, `/products`, `/transport` — evidence and movement registers.
- `/requirements`, `/assurance`, `/exceptions`, `/screening`, `/dangerous-goods` — assurance workflows with honest empty states.
- `/work-queue`, `/releases`, `/analytics`, `/observability`, `/audit` — decisions, workload, trends, and traceability.
- `/integrations/*`, `/governance/*`, and `/settings/*` — controlled connections, rule packs, reference data, people, policy, security, and retention.

Roles are `operator`, `supervisor`, and `admin`. Backend dependencies enforce the permissions; hiding a frontend control is not the security boundary.

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

The first admin is created interactively. Passwords are never committed or logged. In production, run migrations before starting the application.

## Database and security

Migration `0004_assurance_control_plane` adds organization, facility, membership, shipment lifecycle, document, assurance, exception, integration, job, notification, and audit boundaries. Passwords use Argon2id; only SHA-256 hashes of random session tokens are stored. Cookies are HttpOnly, SameSite=Lax, and Secure in production. Deactivation revokes active sessions, and the final active admin cannot be demoted or deactivated.

Production requires PostgreSQL, a 32+ character `APP_API_KEY`, explicit non-wildcard `CORS_ORIGINS`, and secure cookies. Never put `OPENAI_API_KEY`, `APP_API_KEY`, database passwords, or other secrets in `NEXT_PUBLIC_*` variables.

## Extraction and screening

`EXTRACTION_PROVIDER` accepts `local`, `openai`, `paddle`, or `auto`. Local PDF extraction is the safe development path. Provider configuration is shown as an honest state in observability; secret values are never returned. Unconfigured screening is reported as unconfigured rather than as a successful screen.

## Tests and validation

```bash
cd backend
python -m pytest
python -m ruff check app scripts tests
alembic upgrade head

cd ../frontend
npm test
npm run lint
npm run build
npm audit --omit=dev
```

Compose validation requires Docker to be installed.

## Scope limitation

The development metadata vault records document versions and secure storage keys; production object-storage wiring and external screening-provider credentials remain deployment configuration. GateGuard verifies cross-document consistency and workflow evidence; it does not prove physical contents or replace an authoritative WMS/ERP shipment reference.
