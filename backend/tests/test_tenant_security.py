from datetime import UTC, datetime
from uuid import uuid4

import pytest

from app.auth.passwords import hash_password
from app.auth.principals import ServicePrincipal
from app.core.errors import GateGuardError, NotFoundError
from app.repositories.operations import OperationsRepository, OrganizationRow
from app.repositories.reconciliations import AuditEventRow, ReconciliationRepository


def _organization(operations: OperationsRepository, *, code: str) -> str:
    organization_id = str(uuid4())
    now = datetime.now(UTC)
    with operations.session_factory() as session:
        session.add(
            OrganizationRow(
                id=organization_id,
                name=f"Workspace {code}",
                code=code,
                active=True,
                created_at=now,
                updated_at=now,
            )
        )
        session.commit()
    return organization_id


def _payload(reference: str) -> dict[str, object]:
    return {
        "internal_reference": reference,
        "origin": "Jakarta",
        "destination": "Bandung",
        "transport_mode": "Road",
    }


def test_tenant_scoped_shipment_reads_lists_and_machine_create(tmp_path):
    database_url = f"sqlite:///{tmp_path / 'tenant.db'}"
    repository = ReconciliationRepository(database_url)
    operations = OperationsRepository(database_url)
    workspace_a = _organization(operations, code="TENANT-A")
    workspace_b = _organization(operations, code="TENANT-B")
    user_a = repository.create_user(
        email="tenant-a@example.test",
        display_name="Tenant A",
        password_hash=hash_password("a secure password"),
        role="operator",
        organization_id=workspace_a,
    )
    user_b = repository.create_user(
        email="tenant-b@example.test",
        display_name="Tenant B",
        password_hash=hash_password("a secure password"),
        role="operator",
        organization_id=workspace_b,
    )

    shipment_a = repository.create_shipment(
        organization_id=workspace_a,
        payload=_payload("A-001"),
        actor=user_a,
    )
    shipment_b = repository.create_shipment(
        organization_id=workspace_b,
        payload=_payload("B-001"),
        actor=user_b,
    )

    scoped_shipment = repository.get_shipment(shipment_a["id"], organization_id=workspace_a)
    assert scoped_shipment["id"] == shipment_a["id"]
    with pytest.raises(NotFoundError):
        repository.get_shipment(shipment_b["id"], organization_id=workspace_a)

    listed_a, total_a = repository.list_shipments(
        organization_id=workspace_a,
        page=1,
        page_size=25,
        query="001",
    )
    assert total_a == 1
    assert [item["id"] for item in listed_a] == [shipment_a["id"]]

    principal_a = ServicePrincipal(
        service_account_id=str(uuid4()),
        organization_id=workspace_a,
        display_name="Tenant A integration",
        scopes=frozenset({"shipment.write"}),
    )
    with pytest.raises(GateGuardError) as denied:
        repository.create_shipment(
            organization_id=workspace_b,
            payload=_payload("FORBIDDEN-001"),
            actor=principal_a,
        )
    assert denied.value.code == "FORBIDDEN"


def test_service_principal_is_attributed_without_human_impersonation(tmp_path):
    database_url = f"sqlite:///{tmp_path / 'audit.db'}"
    repository = ReconciliationRepository(database_url)
    operations = OperationsRepository(database_url)
    workspace = _organization(operations, code="AUDIT-A")
    principal = ServicePrincipal(
        service_account_id=str(uuid4()),
        organization_id=workspace,
        display_name="Inbound integration",
        scopes=frozenset({"shipment.write"}),
    )

    repository.record_audit(
        "api.shipment.accepted",
        "shipment",
        entity_id=str(uuid4()),
        actor=principal,
        organization_id=workspace,
        metadata={"idempotency_key": "tenant-a-1"},
    )

    with repository.session_factory() as session:
        event = session.scalar(
            pytest.importorskip("sqlalchemy").select(AuditEventRow).where(
                AuditEventRow.organization_id == workspace
            )
        )
    assert event is not None
    assert event.actor_type == "service"
    assert event.actor_id == principal.service_account_id
    assert event.actor_service_account_id == principal.service_account_id
    assert event.actor_user_id is None
