from __future__ import annotations

import hashlib
import json
from typing import Any


def build_release_snapshot(
    *,
    missing_requirements: list[str],
    blocking_checks: list[str],
    blocking_exceptions: list[str],
    open_tasks: int,
    trusted_reference_version: int | None,
    trusted_reference_hash: str | None,
    assurance_versions: dict[str, tuple[str, str | None]],
) -> dict[str, Any]:
    """Build the canonical pre-dispatch evidence snapshot for a release decision.

    The snapshot intentionally excludes mutable shipment status. Approval changes the
    status from pending to authorized; status is checked as a separate state invariant.
    """
    return {
        "missing_requirements": sorted(missing_requirements),
        "blocking_checks": sorted(blocking_checks),
        "blocking_exceptions": sorted(blocking_exceptions),
        "open_tasks": int(open_tasks),
        "trusted_reference": {
            "version": trusted_reference_version,
            "content_hash": trusted_reference_hash,
        },
        "assurance": [
            {
                "check_type": check_type,
                "status": status,
                "source_version": source_version,
            }
            for check_type, (status, source_version) in sorted(assurance_versions.items())
        ],
    }


def snapshot_hash(snapshot: dict[str, Any]) -> str:
    canonical = json.dumps(snapshot, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()
