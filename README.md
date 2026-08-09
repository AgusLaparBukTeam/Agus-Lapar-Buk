# GateGuard

GateGuard checks shipment documents before dispatch. It reconciles a **Surat Jalan / Delivery Order**, **Invoice**, and **Packing List**, then returns one of three operational states:

- `CLEAR` — required evidence is present and consistent.
- `REVIEW` — evidence is incomplete, ambiguous, or below the confidence threshold.
- `HOLD` — a material cross-document conflict was detected.

Extraction and decision-making are deliberately separated. OCR or model output can supply structured evidence, but it cannot issue an operational status by itself. `CLEAR`, `REVIEW`, and `HOLD` are produced by deterministic reconciliation rules.

## Architecture

```text
Browser
  │
  ▼
Next.js BFF
  │ server-side backend credential
  ▼
FastAPI
  ├─ upload validation
  ├─ document extraction
  │  ├─ PDF text extraction
  │  ├─ OpenAI adapter (optional)
  │  └─ PaddleOCR adapter (optional)
  ├─ normalization + reconciliation
  └─ audit repository
```

See [`docs/architecture.md`](docs/architecture.md) for the trust boundaries and decision flow.

## Stack

**Frontend**

- Next.js 16
- React 19
- TypeScript
- TanStack Query
- Zod
- Vitest

**Backend**

- Python 3.11+
- FastAPI
- SQLAlchemy
- Alembic
- PostgreSQL for production
- SQLite for local development

## Quick start

### Docker Compose

```bash
cp .env.example .env
docker compose up --build
```

The frontend is available at `http://localhost:3000`. The backend is bound to loopback at `http://127.0.0.1:8000` and is normally accessed through the Next.js BFF.

### Backend

```bash
cd backend
uv sync --locked --extra dev
uv run uvicorn app.main:app --reload --port 8000
```

### Frontend

```bash
cd frontend
npm ci --include=dev
npm run dev
```

## Extraction providers

`EXTRACTION_PROVIDER` accepts:

| Value | Behavior |
| --- | --- |
| `local` | PDF text extraction only |
| `openai` | Structured multimodal extraction through the OpenAI adapter |
| `paddle` | Local PaddleOCR / PP-Structure extraction |
| `auto` | Local extraction first, then a configured fallback if required fields are incomplete |

Model-only critical fields are treated as uncalibrated evidence and do not qualify for automatic `CLEAR` until their confidence behavior has been validated on representative documents.

## Safety model

GateGuard is intentionally fail-closed around dispatch decisions:

- required uploads must be distinct files;
- file extension, MIME type, signature, size, PDF page count, and image dimensions are bounded;
- critical text fields only auto-match on conservative normalized equivalence;
- fuzzy similarity can request `REVIEW`, but does not silently convert a material difference into `CLEAR`;
- line-item conflicts can produce `HOLD`;
- supervisor overrides preserve the original system decision and append an audit event;
- production configuration rejects SQLite, wildcard CORS, and missing service/override secrets.

This system verifies **consistency between submitted documents**. It does not prove that the documents match the physical shipment or the authoritative order in a WMS/ERP. If `CLEAR` is used as a dispatch control, integrate a trusted order/shipment reference as an additional source of truth.

## Tests

```bash
make test
```

Backend only:

```bash
cd backend
uv run pytest
uv run ruff check app tests
uv run python ../evaluation/run.py
```

Frontend only:

```bash
cd frontend
npm test
npm run lint
npm run build
```

The evaluation fixtures under `samples/` are deterministic regression cases. They are not an OCR/model accuracy benchmark.

## API

| Method | Path | Purpose |
| --- | --- | --- |
| `POST` | `/api/reconcile` | Reconcile three shipment documents |
| `GET` | `/api/reconciliations/{id}` | Read a reconciliation result |
| `POST` | `/api/reconciliations/{id}/override` | Record a supervisor override |
| `GET` | `/api/runtime` | Read non-secret runtime configuration |
| `GET` | `/healthz` | Process health |
| `GET` | `/readyz` | Dependency/schema readiness |

FastAPI's interactive API docs are available in development and disabled in production.

## Production

A PostgreSQL-based Compose example is included in `docker-compose.prod.yml`. Production deployment still requires a real ingress/authentication layer, TLS, shared rate limiting, backups, dependency lockfiles, and validation against representative shipment documents.

See [`docs/deployment.md`](docs/deployment.md) for deployment requirements.

## Repository layout

```text
backend/        FastAPI application, migrations, and tests
frontend/       Next.js application and BFF routes
docs/           Architecture and deployment notes
evaluation/     Deterministic reconciliation evaluation
samples/        Generated regression fixtures
scripts/        Repository maintenance utilities
```

## Contributing

See [`CONTRIBUTING.md`](CONTRIBUTING.md). Security issues should follow [`SECURITY.md`](SECURITY.md).
