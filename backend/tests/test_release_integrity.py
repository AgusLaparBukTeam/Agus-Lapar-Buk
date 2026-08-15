from datetime import UTC, datetime
from uuid import uuid4

import pytest
from sqlalchemy import select

from app.auth.passwords import hash_password
from app.core.errors import GateGuardError
from app.domain.models import ShipmentStatus
from app.repositories.operations import (
    AssuranceCheckRow,
    OperationsRepository,
    OrganizationRow,
    RequirementEvaluationRow,
)
from app.repositories.reconciliations import (
    ReconciliationRepository,
    ReleaseDecisionRow,
    ReviewTaskRow,
    ShipmentCaseRow,
)


def _organization(operations: OperationsRepository) -> str:
    organization_id = str(uuid4())
    now = datetime.now(UTC)
    with operations.session_factory() as session:
        session.add(
            OrganizationRow(
                id=organization_id,
                name="Release integrity workspace",
                code=f"REL-{uuid4().hex[:8]}",
                active=True,
                created_at=now,
                updated_at=now,
            )
        )
        session.commit()
    return organization_id


def _authorizable_shipment(tmp_path):
    database_url = f"sqlite:///{tmp_path / 'release.db'}"
    repository = ReconciliationRepository(database_url)
    operations = OperationsRepository(database_url)
    organization_id = _organization(operations)
    author = repository.create_user(
        email="release-author@example.test",
        display_name="Release author",
        password_hash=hash_password("a secure password"),
        role="supervisor",
        organization_id=organization_id,
    )
    approver = repository.create_user(
        email="release-approver@example.test",
        display_name="Release approver",
        password_hash=hash_password("a secure password"),
        role="supervisor",
        organization_id=organization_id,
    )
    shipment = repository.create_shipment(
        organization_id=organization_id,
        payload={
            "internal_reference": "REL-001",
            "origin": "Jakarta",
            "destination": "Bandung",
            "transport_mode": "Road",
        },
        actor=author,
    )
    with operations.session_factory() as session:
        session.query(ReviewTaskRow).filter(ReviewTaskRow.shipment_id == shipment["id"]).update(
            {"status": "RESOLVED"}
        )
        session.query(RequirementEvaluationRow).filter(
            RequirementEvaluationRow.shipment_id == shipment["id"]
        ).update({"result": "CLEAR"})
        session.query(AssuranceCheckRow).filter(
            AssuranceCheckRow.shipment_id == shipment["id"]
        ).update({"status": "CLEAR", "source_version": "baseline-1"})
        shipment_row = session.get(ShipmentCaseRow, shipment["id"])
        assert shipment_row is not None
        shipment_row.status = ShipmentStatus.REVIEW_REQUIRED.value
        session.commit()
    return repository, operations, organization_id, author, approver, shipment["id"]


def _decision_id(repository: ReconciliationRepository, shipment_id: str) -> str:
    with repository.session_factory() as session:
        decision = session.scalar(
            select(ReleaseDecisionRow)
            .where(ReleaseDecisionRow.shipment_id == shipment_id)
            .order_by(ReleaseDecisionRow.created_at.desc())
        )
    assert decision is not None
    return decision.id


def test_authorize_remains_pending_until_distinct_second_approval(tmp_path):
    (
        repository,
        operations,
        organization_id,
        author,
        approver,
        shipment_id,
    ) = _authorizable_shipment(tmp_path)

    shipment, _ = repository.decide_release(
        shipment_id,
        decision="AUTHORIZE",
        reason="Evidence is current and all checks are clear.",
        actor=author,
        organization_id=organization_id,
    )
    decision_id = _decision_id(repository, shipment_id)
    assert shipment["status"] == ShipmentStatus.RELEASE_PENDING_APPROVAL.value

    with pytest.raises(GateGuardError) as same_person:
        operations.approve_release(
            organization_id=organization_id,
            release_decision_id=decision_id,
            user=author,
            comment="Self approval is not permitted.",
        )
    assert same_person.value.code == "FOUR_EYES_REQUIRED"

    operations.approve_release(
        organization_id=organization_id,
        release_decision_id=decision_id,
        user=approver,
        comment="Independent evidence review complete.",
    )
    assert (
        repository.get_shipment(shipment_id, organization_id=organization_id)["status"]
        == ShipmentStatus.RELEASE_AUTHORIZED.value
    )


def test_invalidated_release_cannot_be_approved(tmp_path):
    (
        repository,
        operations,
        organization_id,
        author,
        approver,
        shipment_id,
    ) = _authorizable_shipment(tmp_path)
    repository.decide_release(
        shipment_id,
        decision="AUTHORIZE",
        reason="Evidence is current and all checks are clear.",
        actor=author,
        organization_id=organization_id,
    )
    decision_id = _decision_id(repository, shipment_id)

    operations.save_trusted_reference(
        organization_id=organization_id,
        shipment_id=shipment_id,
        user=author,
        payload={"shipment_reference": "REL-001", "expected_destination": "Bandung"},
    )

    with pytest.raises(GateGuardError) as invalidated:
        operations.approve_release(
            organization_id=organization_id,
            release_decision_id=decision_id,
            user=approver,
            comment="Cannot approve a stale decision.",
        )
    assert invalidated.value.code == "RELEASE_INVALIDATED"


def test_dispatch_revalidates_current_release_snapshot(tmp_path):
    (
        repository,
        operations,
        organization_id,
        author,
        approver,
        shipment_id,
    ) = _authorizable_shipment(tmp_path)
    repository.decide_release(
        shipment_id,
        decision="AUTHORIZE",
        reason="Evidence is current and all checks are clear.",
        actor=author,
        organization_id=organization_id,
    )
    decision_id = _decision_id(repository, shipment_id)
    operations.approve_release(
        organization_id=organization_id,
        release_decision_id=decision_id,
        user=approver,
        comment="Independent evidence review complete.",
    )

    with operations.session_factory() as session:
        check = session.scalar(
            select(AssuranceCheckRow).where(AssuranceCheckRow.shipment_id == shipment_id)
        )
        assert check is not None
        check.status = "REVIEW"
        check.source_version = "baseline-2"
        session.commit()

    with pytest.raises(GateGuardError) as stale:
        operations.transition_shipment(
            organization_id=organization_id,
            shipment_id=shipment_id,
            user=approver,
            status=ShipmentStatus.DISPATCHED.value,
        )
    assert stale.value.code == "RELEASE_INVALIDATED"
    assert (
        repository.get_shipment(shipment_id, organization_id=organization_id)["status"]
        == ShipmentStatus.RELEASE_INVALIDATED.value
    )


def test_generic_lifecycle_cannot_bypass_release_decision_or_second_approval(tmp_path):
    (
        repository,
        operations,
        organization_id,
        author,
        _approver,
        shipment_id,
    ) = _authorizable_shipment(tmp_path)

    with pytest.raises(GateGuardError) as pending_bypass:
        operations.transition_shipment(
            organization_id=organization_id,
            shipment_id=shipment_id,
            user=author,
            status=ShipmentStatus.RELEASE_PENDING_APPROVAL.value,
        )
    assert pending_bypass.value.code == "INVALID_TRANSITION"

    repository.decide_release(
        shipment_id,
        decision="AUTHORIZE",
        reason="Evidence is current and all checks are clear.",
        actor=author,
        organization_id=organization_id,
    )
    with pytest.raises(GateGuardError) as authorization_bypass:
        operations.transition_shipment(
            organization_id=organization_id,
            shipment_id=shipment_id,
            user=author,
            status=ShipmentStatus.RELEASE_AUTHORIZED.value,
        )
    assert authorization_bypass.value.code == "INVALID_TRANSITION"
