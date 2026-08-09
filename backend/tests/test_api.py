import io

from conftest import login
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_health_and_security_headers():
    response = client.get("/healthz")
    assert response.status_code == 200
    assert response.headers["x-content-type-options"] == "nosniff"
    assert response.headers["cache-control"] == "no-store"


def test_reconcile_rejects_unsupported_file():
    login(client)
    files = {
        "invoice": ("invoice.txt", io.BytesIO(b"hello"), "text/plain"),
        "packing_list": ("packing.pdf", io.BytesIO(b"%PDF-1.4"), "application/pdf"),
        "delivery_order": ("do.pdf", io.BytesIO(b"%PDF-1.4"), "application/pdf"),
    }
    response = client.post("/api/reconcile", files=files)
    assert response.status_code == 422
    body = response.json()
    assert body["error"]["code"] == "INVALID_UPLOAD"


def test_override_reason_validation():
    login(client)
    response = client.post(
        "/api/reconciliations/does-not-exist/override",
        json={"final_decision": "CLEAR", "reason": "x", "corrected_fields": {}},
    )
    assert response.status_code == 422
