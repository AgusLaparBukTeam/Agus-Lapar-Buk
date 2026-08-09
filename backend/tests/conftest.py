from app.domain.models import DocumentField, DocumentType, ShipmentDocument, ShipmentItem


def f(value, confidence=0.95):
    return DocumentField(value=value, raw_value=str(value) if value is not None else None,
                         confidence=confidence, source="test")


def make_doc(
    dtype: DocumentType,
    *,
    recipient="PT Maju Jaya",
    destination="Jl Merdeka 10 Bandung",
    sku="SKU-001",
    description="Minyak Goreng 1L",
    quantity=100,
    unit_price=18000,
    confidence=0.95,
):
    return ShipmentDocument(
        document_type=dtype,
        filename=f"{dtype.value}.pdf",
        detected_document_type=dtype,
        document_type_confidence=0.99,
        line_items_complete=True,
        document_id=f(f"DOC-{dtype.value}", confidence),
        shipment_id=f("SHP-001", confidence),
        sender=f("PT Gudang Sentosa", confidence),
        recipient=f(recipient, confidence),
        destination=f(destination, confidence),
        items=[
            ShipmentItem(
                sku=f(sku, confidence),
                description=f(description, confidence),
                quantity=f(quantity, confidence),
                unit_price=f(unit_price, confidence),
            )
        ],
        extraction_provider="test",
    )
