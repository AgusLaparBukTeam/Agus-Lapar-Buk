import io

from conftest import login
from fastapi.testclient import TestClient
from PIL import Image

from app.core.config import get_settings
from app.main import app


def _shipment(client: TestClient, reference: str) -> str:
    response = client.post(
        "/api/shipments",
        json={
            "internal_reference": reference,
            "origin": "Jakarta",
            "destination": "Bandung",
            "transport_mode": "Road",
        },
    )
    assert response.status_code == 201, response.text
    return response.json()["id"]


def _upload(client: TestClient, shipment_id: str, file_tuple: tuple[str, bytes, str]):
    return client.post(
        "/api/documents/upload",
        data={"shipment_id": shipment_id, "document_type": "COMMERCIAL_INVOICE"},
        files={"file": file_tuple},
    )


def _png(width: int, height: int) -> bytes:
    output = io.BytesIO()
    Image.new("RGB", (width, height), "white").save(output, format="PNG")
    return output.getvalue()


def test_document_vault_rejects_spoofed_and_mismatched_uploads():
    client = login(TestClient(app))
    shipment_id = _shipment(client, "UPLOAD-SECURITY-001")

    cases = [
        ("spoofed.pdf", b"not a PDF", "application/pdf"),
        ("malware.pdf", b"MZ\x90\x00\x03\x00", "application/pdf"),
        ("broken.png", b"\x89PNG\r\n\x1a\nnot-a-real-image", "image/png"),
        ("mismatch.pdf", b"%PDF-1.4\n%fixture\n", "image/png"),
    ]
    for candidate in cases:
        response = _upload(client, shipment_id, candidate)
        assert response.status_code == 422, response.text
        assert response.json()["error"]["code"] in {"INVALID_UPLOAD", "INVALID_MIME_TYPE"}


def test_document_vault_enforces_image_pixel_limit_and_accepts_valid_pdf(monkeypatch):
    client = login(TestClient(app))
    shipment_id = _shipment(client, "UPLOAD-SECURITY-002")
    settings = get_settings()
    monkeypatch.setattr(settings, "max_image_pixels", 1)

    oversized = _upload(client, shipment_id, ("too-large.png", _png(2, 2), "image/png"))
    assert oversized.status_code == 422, oversized.text
    assert oversized.json()["error"]["code"] == "INVALID_UPLOAD"

    accepted = _upload(
        client,
        shipment_id,
        ("invoice.pdf", b"%PDF-1.4\n%validated fixture\n", "application/pdf"),
    )
    assert accepted.status_code == 201, accepted.text
    version = accepted.json()["version"]
    assert version["mime_type"] == "application/pdf"
    assert version["sha256"]
    assert "storage_key" not in version


def test_document_metadata_legacy_endpoint_is_closed():
    client = login(TestClient(app))
    shipment_id = _shipment(client, "UPLOAD-SECURITY-LEGACY")

    response = client.post(
        "/api/documents",
        json={
            "shipment_id": shipment_id,
            "document_type": "INVOICE",
            "filename": "metadata-only.pdf",
            "mime_type": "application/pdf",
            "size_bytes": 10,
            "sha256": "a" * 64,
        },
    )

    assert response.status_code == 410
    assert response.json()["error"]["code"] == "DOCUMENT_UPLOAD_REQUIRED"
