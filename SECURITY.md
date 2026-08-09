# Security Policy

GateGuard processes untrusted shipment documents and may handle commercially sensitive data.

## Reporting a vulnerability

Do not include secrets, customer documents, or exploitable details in a public issue. Prefer GitHub's private vulnerability reporting for this repository when available. Otherwise, contact the repository maintainer privately before publishing details.

Include the affected component, reproduction steps, expected impact, and any suggested mitigation.

## Security-sensitive areas

Changes to the following paths deserve additional review:

- upload and file validation;
- extraction provider adapters;
- reconciliation rules;
- supervisor override authorization and audit history;
- backend proxy/authentication code;
- production configuration and migrations.

## Deployment boundary

The included application-level controls do not replace identity, TLS, ingress filtering, network isolation, or database security. See `docs/deployment.md` before using real shipment data.
