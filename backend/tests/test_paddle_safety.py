from app.domain.models import DocumentType
from app.services.extraction import (
    _mark_uncalibrated_model_evidence,
    _paddle_text,
    parse_shipment_text,
)


def test_paddle_json_text_extraction_prefers_layout_blocks():
    payload = {
        "parsing_res_list": [
            {"block_content": "Recipient: PT Aman"},
            {"block_content": "SKU | Description | Quantity\nSKU-1 | Widget | 2"},
        ],
        "overall_ocr_res": {"rec_texts": ["ignored fallback"]},
    }
    text = _paddle_text(payload)
    assert "Recipient: PT Aman" in text
    assert "SKU-1 | Widget | 2" in text
    assert "ignored fallback" not in text


def test_uncalibrated_paddle_evidence_is_below_clearance_threshold():
    text = """Invoice No: INV-1
Shipment ID: SHIP-1
Recipient: PT Aman
Destination: Jakarta
SKU | Description | Quantity
SKU-1 | Widget | 2
"""
    doc = parse_shipment_text(text, DocumentType.INVOICE, "invoice.pdf")
    doc = _mark_uncalibrated_model_evidence(
        doc, confidence=0.70, source="paddle_ppstructure_heuristic"
    )
    assert doc.recipient.confidence == 0.70
    assert doc.destination.confidence == 0.70
    assert doc.items[0].sku.confidence == 0.70
    assert doc.items[0].quantity.confidence == 0.70
