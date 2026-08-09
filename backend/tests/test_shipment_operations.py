from conftest import login
from fastapi.testclient import TestClient

from app.main import app


def test_shipment_register_and_release_gate():
    client = login(TestClient(app))
    created = client.post(
        "/api/shipments",
        json={
            "internal_reference": "SHP-OPS-001",
            "external_reference": "PO-OPS-001",
            "origin": "Jakarta warehouse",
            "destination": "Bandung store",
            "transport_mode": "Road",
            "expected_recipient": "Maju Jaya",
            "expected_currency": "IDR",
            "expected_total": 1500000,
        },
    )
    assert created.status_code == 201, created.text
    shipment = created.json()
    assert shipment["status"] == "DOCUMENTS_REQUIRED"
    assert shipment["trusted_reference"]["source_system"] == "Workspace entry"

    queued = client.get("/api/work-queue?status=OPEN")
    assert queued.status_code == 200, queued.text
    assert any(item["shipment_id"] == shipment["id"] for item in queued.json()["items"])

    blocked = client.post(
        f"/api/shipments/{shipment['id']}/release-decision",
        json={"decision": "AUTHORIZE", "reason": "Attempt before checks are complete"},
    )
    assert blocked.status_code == 409, blocked.text
