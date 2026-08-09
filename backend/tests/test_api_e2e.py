import io

from conftest import login
from fastapi.testclient import TestClient
from reportlab.pdfgen import canvas

from app.main import app


def make_pdf(label: str, doc_id: str, quantity: int = 100) -> bytes:
    buf = io.BytesIO()
    pdf = canvas.Canvas(buf)
    lines = [
        f"{label} No: {doc_id}",
        "Shipment ID: SHP-001",
        "Sender: PT Gudang Sentosa",
        "Recipient: PT Maju Jaya",
        "Destination: Jl Merdeka 10 Bandung",
        "SKU | Description | Quantity | Unit Price | Line Total",
        f"SKU-001 | Minyak Goreng 1L | {quantity} | 18000 | {quantity * 18000}",
        f"Grand Total: {quantity * 18000}",
    ]
    y = 800
    for line in lines:
        pdf.drawString(50, y, line)
        y -= 22
    pdf.save()
    return buf.getvalue()


def post_triplet(client: TestClient, packing_quantity: int = 100):
    login(client)
    return client.post(
        "/api/reconcile",
        files={
            "invoice": ("invoice.pdf", make_pdf("Invoice", "INV-001"), "application/pdf"),
            "packing_list": (
                "packing.pdf",
                make_pdf("Packing List", "PL-001", packing_quantity),
                "application/pdf",
            ),
            "delivery_order": (
                "delivery.pdf",
                make_pdf("Surat Jalan", "DO-001"),
                "application/pdf",
            ),
        },
    )


def test_text_pdf_triplet_reconciles_clear():
    response = post_triplet(TestClient(app))
    assert response.status_code == 200, response.text
    result = response.json()
    assert result["status"] == "CLEAR"
    assert result["mismatches"] == []
    assert result["documents"]["invoice"]["items"][0]["sku"]["value"] == "SKU-001"


def test_text_pdf_quantity_conflict_holds():
    response = post_triplet(TestClient(app), packing_quantity=90)
    assert response.status_code == 200, response.text
    result = response.json()
    assert result["status"] == "HOLD"
    mismatch = next(m for m in result["mismatches"] if m["type"] == "QUANTITY_MISMATCH")
    assert mismatch["estimated_discrepancy_value"] == 180000.0


def test_same_binary_document_cannot_clear_three_slots():
    from pathlib import Path

    payload = Path("../samples/clear/invoice.pdf").read_bytes()
    files = {
        "invoice": ("invoice.pdf", payload, "application/pdf"),
        "packing_list": ("packing-copy.pdf", payload, "application/pdf"),
        "delivery_order": ("delivery-copy.pdf", payload, "application/pdf"),
    }
    client = login(TestClient(app))
    response = client.post("/api/reconcile", files=files)
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "INVALID_UPLOAD"
    assert "same file" in response.json()["error"]["message"].lower()
