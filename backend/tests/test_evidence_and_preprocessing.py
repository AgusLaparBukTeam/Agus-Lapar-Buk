import io

from PIL import Image, ImageDraw

from app.domain.models import DocumentType, ShipmentDocument, ShipmentItem
from app.domain.reconciliation import reconcile
from app.services.extraction import WordBox, _document_evidence, field
from app.services.preprocessing import preprocess_image_bytes


def _document(document_type: DocumentType, *, quantity: int = 10, price: float | None = 100.0):
    return ShipmentDocument(
        document_type=document_type,
        filename=f"{document_type.value}.pdf",
        detected_document_type=document_type,
        document_type_confidence=0.99,
        line_items_complete=True,
        document_id=field(f"{document_type.value}-001", confidence=0.99),
        shipment_id=field("SHIP-001", confidence=0.99),
        sender=field("PT Sumber", confidence=0.99),
        recipient=field("PT Tujuan", confidence=0.99),
        destination=field("Jakarta", confidence=0.99),
        items=[
            ShipmentItem(
                sku=field("SKU-01", confidence=0.99),
                quantity=field(quantity, str(quantity), 0.99),
                unit_price=field(price, str(price) if price else None, 0.99 if price else 0.0),
            )
        ],
    )


def test_document_evidence_uses_normalized_source_coordinates():
    document = _document(DocumentType.INVOICE)
    _document_evidence(
        document,
        [WordBox(page=1, x=0.21, y=0.33, width=0.08, height=0.03, text="SKU-01")],
    )
    evidence = document.items[0].sku.evidence[0]
    coordinates = (evidence.page, evidence.x, evidence.y, evidence.width, evidence.height)
    assert coordinates == (1, 0.21, 0.33, 0.08, 0.03)
    assert evidence.text == "SKU-01"


def test_quantity_estimate_stays_empty_when_price_is_zero_or_missing():
    documents = {
        DocumentType.INVOICE: _document(DocumentType.INVOICE, quantity=10, price=0.0),
        DocumentType.PACKING_LIST: _document(DocumentType.PACKING_LIST, quantity=8, price=None),
        DocumentType.DELIVERY_ORDER: _document(
            DocumentType.DELIVERY_ORDER,
            quantity=10,
            price=None,
        ),
    }
    _, _, _, mismatches = reconcile(documents)
    quantity_mismatch = next(item for item in mismatches if item.field == "items.quantity")
    assert quantity_mismatch.estimated_discrepancy_value is None


def test_preprocessing_returns_a_separate_valid_image_artifact():
    image = Image.new("RGB", (480, 320), "#808080")
    draw = ImageDraw.Draw(image)
    draw.rectangle((40, 30, 440, 290), fill="white", outline="black", width=3)
    draw.text((120, 130), "INV-DEMO-001", fill="gray")
    source = io.BytesIO()
    image.save(source, format="PNG")

    result = preprocess_image_bytes(source.getvalue(), "image/png")

    assert result.applied is True
    assert {"clahe_contrast", "light_denoise"}.issubset(result.operations)
    with Image.open(io.BytesIO(result.data)) as artifact:
        assert artifact.size == (480, 320)
