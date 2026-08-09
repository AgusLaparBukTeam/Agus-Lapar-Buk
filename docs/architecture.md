# Architecture

GateGuard is a pre-dispatch consistency check for three shipment documents: Delivery Order, Invoice, and Packing List.

## Design constraint

Extraction is probabilistic; dispatch control should not be.

The extraction layer converts documents into structured evidence. The reconciliation layer owns the operational decision. No OCR engine or language model is allowed to set `CLEAR`, `REVIEW`, or `HOLD` directly.

## Request flow

1. The browser sends the three required files to the Next.js BFF.
2. The BFF forwards the request to FastAPI with a server-side service credential.
3. FastAPI validates file type, signature, size, image dimensions, and PDF limits.
4. The extraction router reads the document using the configured provider.
5. Extracted values are normalized into the canonical shipment schema.
6. Deterministic reconciliation rules compare critical fields and line items.
7. The result, evidence, and system decision are persisted.
8. A supervisor may record an override. The original system decision remains immutable.

## Trust boundaries

### Browser to BFF

The browser is untrusted. It never receives backend service credentials or provider API keys.

### BFF to API

The BFF is the intended application client for the backend. It forwards the HttpOnly session cookie while keeping the service API key server-side. The service API key protects the backend from direct unauthenticated calls; it is not a substitute for user authentication or RBAC.

### Documents to extraction

Uploaded documents are untrusted input. They are treated as data, not instructions. File validation and resource limits run before extraction.

### Extraction to reconciliation

Provider output is untrusted evidence. Critical values include provenance and confidence. Model-only evidence is confidence-gated and cannot independently authorize `CLEAR`.

### Override path

Supervisor override requires a supervisor/admin session and records the authenticated user id, display-name snapshot, reason, prior state, final state, and timestamp. The request cannot supply an arbitrary actor or shared supervisor credential.

## Decision semantics

### `CLEAR`

Used only when the required deterministic evidence is complete and equivalent under conservative normalization.

### `REVIEW`

Used when the system cannot safely distinguish an acceptable variation from a material conflict, including low-confidence extraction and near-text matches.

### `HOLD`

Used for material deterministic conflicts such as quantity, SKU, document identity, or other critical cross-document mismatches.

## Persistence

SQLite is supported for local development. Production configuration requires PostgreSQL and schema migration through Alembic.

Raw uploaded files are processed in scoped temporary storage and are not persisted by default. Persisted records contain structured results and audit state.

## Non-goals

GateGuard does not:

- verify physical package contents;
- replace a WMS, ERP, or TMS;
- authorize payment;
- establish tax or accounting correctness;
- prove that three mutually consistent documents reference the correct order.

For dispatch authorization, add a trusted WMS/ERP shipment reference and explicit unit-of-measure rules.
