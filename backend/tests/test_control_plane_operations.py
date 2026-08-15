from conftest import login
from fastapi.testclient import TestClient

from app.main import app


def test_workspace_record_and_service_token_idempotency():
    client = login(TestClient(app))
    created = client.post(
        "/api/shipments",
        json={
            "internal_reference": "SHP-CONTROL-001",
            "origin": "Jakarta",
            "destination": "Singapore",
            "transport_mode": "Sea",
        },
    )
    assert created.status_code == 201, created.text
    shipment_id = created.json()["id"]

    workspace = client.get(f"/api/shipments/{shipment_id}/workspace")
    assert workspace.status_code == 200, workspace.text
    assert workspace.json()["shipment"]["organization_id"]
    assert "release_gate" in workspace.json()
    requirements = client.get("/api/requirements")
    assert requirements.status_code == 200, requirements.text
    assert len(requirements.json()["items"]) >= 3
    document = client.post(
        "/api/documents/upload",
        data={"shipment_id": shipment_id, "document_type": "INVOICE"},
        files={"file": ("invoice.pdf", b"%PDF-1.4\n%control fixture\n", "application/pdf")},
    )
    assert document.status_code == 201, document.text

    service_account = client.post(
        "/api/integrations/service-accounts",
        json={"name": "Inbound partner", "scopes": ["shipment.write"]},
    )
    assert service_account.status_code == 201, service_account.text
    token = service_account.json()["token"]
    headers = {"Authorization": f"Bearer {token}", "Idempotency-Key": "partner-001"}
    first = client.post(
        "/api/v1/shipments",
        headers=headers,
        json={"internal_reference": "SHP-API-001", "origin": "Jakarta", "destination": "Batam"},
    )
    assert first.status_code == 201, first.text
    second = client.post(
        "/api/v1/shipments",
        headers=headers,
        json={"internal_reference": "SHP-API-001", "origin": "Jakarta", "destination": "Batam"},
    )
    assert second.status_code == 201, second.text
    assert second.json()["id"] == first.json()["id"]


def test_document_vault_trusted_source_screening_and_worker_flow():
    client = login(TestClient(app))
    created = client.post(
        "/api/shipments",
        json={
            "internal_reference": "SHP-INTEGRITY-001",
            "origin": "Jakarta",
            "destination": "Singapore",
            "transport_mode": "SEA",
        },
    )
    assert created.status_code == 201, created.text
    shipment_id = created.json()["id"]

    upload = client.post(
        "/api/documents/upload",
        data={"shipment_id": shipment_id, "document_type": "COMMERCIAL_INVOICE"},
        files={"file": ("invoice.pdf", b"%PDF-1.4\n%accepted fixture\n", "application/pdf")},
    )
    assert upload.status_code == 201, upload.text
    uploaded = upload.json()
    assert uploaded["version"]["sha256"]
    assert "storage_key" not in uploaded["version"]
    downloaded = client.get(f"/api/documents/{uploaded['id']}/download")
    assert downloaded.status_code == 200
    assert downloaded.content == b"%PDF-1.4\n%accepted fixture\n"

    trusted = client.put(
        f"/api/shipments/{shipment_id}/trusted-reference",
        json={
            "shipment_reference": "different-reference",
            "expected_destination": "Singapore",
            "source_type": "MANUAL_AUTHORITATIVE_ENTRY",
        },
    )
    assert trusted.status_code == 200, trusted.text
    assert trusted.json()["comparison"]["findings"]

    party = client.post(
        "/api/parties",
        json={"legal_name": "Example Carrier", "shipment_id": shipment_id, "role": "CARRIER"},
    )
    assert party.status_code == 201, party.text
    screening = client.post(f"/api/shipments/{shipment_id}/screening")
    assert screening.status_code == 202, screening.text
    assert screening.json()["result"] == "NOT_CONFIGURED"

    assessment = client.post(f"/api/shipments/{shipment_id}/assess")
    assert assessment.status_code == 202, assessment.text
    from app.api.operations import get_operations

    repository = get_operations()
    job = repository.claim_job(worker_id="test-worker")
    assert job is not None
    repository.complete_assessment(organization_id=job["organization_id"], shipment_id=shipment_id)
    repository.finish_job(job_id=job["id"], success=True)
    observability = client.get("/api/observability")
    assert observability.status_code == 200
    assert observability.json()["jobs_succeeded"] >= 1


def test_reference_data_notifications_and_webhook_boundaries():
    client = login(TestClient(app))
    created = client.post(
        "/api/reference-data",
        json={
            "category": "currency",
            "code": "IDR",
            "label": "Indonesian rupiah",
            "source": "Workspace finance policy",
            "version": "2026-01",
        },
    )
    assert created.status_code == 201, created.text
    listed = client.get("/api/reference-data?category=CURRENCY&q=IDR")
    assert listed.status_code == 200, listed.text
    assert listed.json()["items"][0]["code"] == "IDR"

    duplicate = client.post(
        "/api/reference-data",
        json={"category": "currency", "code": "IDR", "label": "Duplicate"},
    )
    assert duplicate.status_code == 409, duplicate.text

    notification = client.get("/api/notifications")
    assert notification.status_code == 200, notification.text
    assert "unread" in notification.json()

    private_webhook = client.post(
        "/api/integrations/webhooks",
        json={"name": "Private callback", "endpoint": "http://10.0.0.4/events", "events": []},
    )
    assert private_webhook.status_code == 422, private_webhook.text
