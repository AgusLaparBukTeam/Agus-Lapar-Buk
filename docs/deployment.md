# Deployment

This document describes the minimum deployment shape for GateGuard. It is not a substitute for the security controls of the environment hosting it.

## Runtime topology

A production deployment should expose only the frontend through an authenticated TLS ingress.

```text
Internet
  │
  ▼
TLS ingress / WAF / identity provider
  │
  ▼
Next.js
  │ private network
  ▼
FastAPI
  │
  ▼
PostgreSQL
```

The FastAPI service should not be directly Internet-accessible.

## Required configuration

Start from `.env.production.example` and replace every placeholder. At minimum, production requires:

- `APP_PUBLIC_ORIGIN`
- `APP_API_KEY`
- `SUPERVISOR_OVERRIDE_KEY`
- `POSTGRES_PASSWORD`
- `DATABASE_URL`

`APP_API_KEY` and `SUPERVISOR_OVERRIDE_KEY` must be independent secrets.

If OpenAI extraction is enabled, `OPENAI_API_KEY` must remain server-side. Never expose provider keys through a `NEXT_PUBLIC_*` variable.

## Database migrations

Apply migrations before starting application traffic:

```bash
cd backend
uv run alembic upgrade head
```

The provided production Compose file runs migrations as a one-shot service before starting the backend.

## Container deployment

```bash
cp .env.production.example .env
# edit .env
docker compose -f docker-compose.prod.yml up --build
```

The containers run as non-root users with Linux capabilities dropped. The backend uses temporary filesystem storage for uploaded document processing.

## Dependency locking

Top-level dependency versions are constrained in `pyproject.toml`, `requirements.txt`, and `package.json`, but a controlled release should also commit generated lockfiles.

Generate them from a machine with access to the public package registries:

```bash
./scripts/generate_locks.sh
```

Review dependency changes before merging the generated lockfiles.

## Ingress and authentication

Before exposing GateGuard outside a trusted development environment:

- terminate TLS at a managed ingress or reverse proxy;
- require authenticated user identity;
- enforce authorization for supervisor override operations;
- set request-body limits at the ingress as well as in the application;
- use a shared rate limiter if multiple backend replicas are deployed;
- keep FastAPI on a private network;
- restrict CORS to the deployed frontend origin.

## Data handling

Shipment documents can contain customer and commercial data. Define retention and access policies before using real documents.

Raw uploads are not persisted by default, but external extraction providers may have their own processing and retention terms. Review those terms before enabling a provider for production data.

## Backups

For PostgreSQL deployments, establish and test:

- automated backups;
- restore procedures;
- retention policy;
- credential rotation;
- migration rollback/recovery procedures.

A backup that has never been restored in a test environment should not be treated as a validated recovery path.

## Health checks

- `/healthz` confirms that the API process is alive.
- `/readyz` confirms that the service can use its configured repository/schema.

Use readiness, not liveness, when deciding whether a replica should receive traffic.
