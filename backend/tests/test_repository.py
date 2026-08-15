from pathlib import Path

from app.domain.models import (
    AuditState,
    OverrideRequest,
    ReconciliationResult,
    ReconciliationStatus,
)
from app.repositories.reconciliations import ReconciliationRepository


def test_override_preserves_system_decision(tmp_path: Path):
    repo = ReconciliationRepository(f"sqlite:///{tmp_path / 'test.db'}")
    result = ReconciliationResult(
        session_id="00000000-0000-0000-0000-000000000001",
        status=ReconciliationStatus.REVIEW,
        reason="Needs review",
        recommended_action="Review",
        documents={},
        mismatches=[],
        audit=AuditState(system_decision=ReconciliationStatus.REVIEW),
    )
    repo.save(result, organization_id="test-workspace")
    updated = repo.override(
        result.session_id,
        OverrideRequest(
            final_decision=ReconciliationStatus.CLEAR,
            reason="Supervisor verified original documents.",
            actor="SPV-001",
        ),
    )
    assert updated.audit.system_decision == ReconciliationStatus.REVIEW
    assert updated.audit.final_decision == ReconciliationStatus.CLEAR
    assert updated.audit.override_reason
    assert updated.audit.overridden_by == "SPV-001"
    assert len(updated.audit.override_history) == 1

    second = repo.override(
        result.session_id,
        OverrideRequest(
            final_decision=ReconciliationStatus.HOLD,
            reason="Second supervisor found a physical count discrepancy.",
            actor="SPV-002",
        ),
    )
    assert second.audit.system_decision == ReconciliationStatus.REVIEW
    assert second.audit.final_decision == ReconciliationStatus.HOLD
    assert [event.actor for event in second.audit.override_history] == ["SPV-001", "SPV-002"]
    assert second.audit.override_history[1].previous_decision == ReconciliationStatus.CLEAR
