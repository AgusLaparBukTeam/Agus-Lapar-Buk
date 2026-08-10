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
        "/api/documents",
        json={
            "shipment_id": shipment_id,
            "document_type": "INVOICE",
            "filename": "invoice.pdf",
            "mime_type": "application/pdf",
            "size_bytes": 1200,
            "sha256": "a" * 64,
        },
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
