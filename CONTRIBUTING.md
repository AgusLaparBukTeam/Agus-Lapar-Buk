# Contributing

Keep changes small enough to review and verify. Behavior that can change a shipment decision must include a regression test.

## Setup

Backend:

```bash
cd backend
uv sync --locked --extra dev
```

Frontend:

```bash
cd frontend
npm ci --include=dev
```

## Before opening a pull request

Run the relevant checks:

```bash
make test
```

For reconciliation changes, also run:

```bash
cd backend
uv run python ../evaluation/run.py
```

## Pull requests

A useful PR description explains:

- what behavior changed;
- why the change is needed;
- how it was verified;
- whether it changes `CLEAR`, `REVIEW`, `HOLD`, extraction confidence, or audit behavior.

Avoid unrelated formatting or dependency changes in the same PR.

## Reconciliation rules

Do not relax a fail-closed rule only to make a fixture pass. If a new document variation should be accepted, add a representative fixture and define why it is safe to distinguish from a material mismatch.
