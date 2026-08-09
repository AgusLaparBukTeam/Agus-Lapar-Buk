from app.domain.models import DocumentType
from app.services.extraction import parse_shipment_text


def test_generic_total_is_not_assumed_to_be_monetary_document_total():
    text = """Invoice No: INV-1
Shipment ID: SHIP-1
Sender: PT Gudang
Recipient: PT Aman
Destination: Jakarta
SKU | Description | Quantity
SKU-1 | Widget | 2
Total: 2
"""
    doc = parse_shipment_text(text, DocumentType.INVOICE, "invoice.pdf")
    assert doc.document_total.value is None


def test_explicit_grand_total_is_parsed_as_monetary_document_total():
    text = """Invoice No: INV-1
Shipment ID: SHIP-1
Sender: PT Gudang
Recipient: PT Aman
Destination: Jakarta
SKU | Description | Quantity
SKU-1 | Widget | 2
Grand Total: 36000
"""
    doc = parse_shipment_text(text, DocumentType.INVOICE, "invoice.pdf")
    assert doc.document_total.value == 36000


def test_unparsed_row_without_delimiters_marks_line_items_incomplete():
    text = """Invoice No: INV-1
Shipment ID: SHIP-1
Sender: PT Gudang
Recipient: PT Aman
Destination: Jakarta
SKU | Description | Quantity
SKU-1 | Widget A | 2
SKU-2 Widget B 5
Grand Total: 36000
"""
    doc = parse_shipment_text(text, DocumentType.INVOICE, "invoice.pdf")
    assert [item.sku.value for item in doc.items] == ["SKU-1"]
    assert doc.line_items_complete is False


def test_oversized_text_field_is_treated_as_missing_evidence():
    text = """Invoice No: INV-1
Shipment ID: SHIP-1
Sender: PT Gudang
Recipient: {recipient}
Destination: Jakarta
SKU | Description | Quantity
SKU-1 | Widget | 2
""".format(recipient="A" * 2500)
    doc = parse_shipment_text(text, DocumentType.INVOICE, "invoice.pdf")
    assert doc.recipient.value is None


def test_absurd_numeric_value_is_not_accepted():
    text = """Invoice No: INV-1
Shipment ID: SHIP-1
Sender: PT Gudang
Recipient: PT Aman
Destination: Jakarta
SKU | Description | Quantity
SKU-1 | Widget | 999999999999999999999999999999999999999
"""
    doc = parse_shipment_text(text, DocumentType.INVOICE, "invoice.pdf")
    assert doc.items[0].quantity.value is None
