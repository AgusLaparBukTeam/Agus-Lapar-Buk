from conftest import make_doc

from app.domain.models import DocumentType, MismatchType, ReconciliationStatus
from app.domain.reconciliation import reconcile


def triplet(**overrides):
    docs = {
        DocumentType.INVOICE: make_doc(DocumentType.INVOICE),
        DocumentType.PACKING_LIST: make_doc(DocumentType.PACKING_LIST),
        DocumentType.DELIVERY_ORDER: make_doc(DocumentType.DELIVERY_ORDER),
    }
    for dtype, values in overrides.items():
        docs[dtype] = make_doc(dtype, **values)
    return docs


def test_clear_when_consistent():
    status, _, _, mismatches = reconcile(triplet())
    assert status == ReconciliationStatus.CLEAR
    assert mismatches == []


def test_hold_on_quantity_mismatch_with_estimate():
    docs = triplet(
        **{
            DocumentType.PACKING_LIST: {"quantity": 90},
        }
    )
    status, _, _, mismatches = reconcile(docs)
    assert status == ReconciliationStatus.HOLD
    q = next(m for m in mismatches if m.type == MismatchType.QUANTITY_MISMATCH)
    assert q.estimated_discrepancy_value == 180000.0


def test_hold_on_wrong_recipient():
    docs = triplet(
        **{
            DocumentType.DELIVERY_ORDER: {"recipient": "PT Salah Tujuan"},
        }
    )
    status, _, _, mismatches = reconcile(docs)
    assert status == ReconciliationStatus.HOLD
    assert any(m.type == MismatchType.WRONG_RECIPIENT for m in mismatches)


def test_review_on_low_confidence_critical_field():
    docs = triplet(
        **{
            DocumentType.INVOICE: {"confidence": 0.4},
        }
    )
    status, _, _, mismatches = reconcile(docs)
    assert status == ReconciliationStatus.REVIEW
    assert any(m.type == MismatchType.LOW_CONFIDENCE_EXTRACTION for m in mismatches)


def test_llm_heuristic_confidence_cannot_auto_clear():
    docs = triplet(
        **{
            DocumentType.INVOICE: {"confidence": 0.65},
            DocumentType.PACKING_LIST: {"confidence": 0.65},
            DocumentType.DELIVERY_ORDER: {"confidence": 0.65},
        }
    )
    status, _, _, mismatches = reconcile(docs)
    assert status == ReconciliationStatus.REVIEW
    assert any(m.type == MismatchType.LOW_CONFIDENCE_EXTRACTION for m in mismatches)


def test_low_confidence_duplicate_sku_never_forces_hold():
    docs = triplet()
    packing = docs[DocumentType.PACKING_LIST]
    duplicate = packing.items[0].model_copy(deep=True)
    duplicate.sku.confidence = 0.65
    duplicate.quantity.confidence = 0.65
    packing.items.append(duplicate)

    status, _, _, mismatches = reconcile(docs, confidence_threshold=0.75)

    assert status == ReconciliationStatus.REVIEW
    assert any(m.type == MismatchType.LOW_CONFIDENCE_EXTRACTION for m in mismatches)
    assert not any(m.type == MismatchType.DUPLICATE_ITEM for m in mismatches)


def test_hold_when_document_is_in_wrong_slot():
    docs = triplet()
    docs[DocumentType.INVOICE].detected_document_type = DocumentType.PACKING_LIST
    docs[DocumentType.INVOICE].document_type_confidence = 0.99

    status, _, _, mismatches = reconcile(docs)

    assert status == ReconciliationStatus.HOLD
    assert any(m.type == MismatchType.WRONG_DOCUMENT_TYPE for m in mismatches)


def test_review_when_line_item_coverage_is_not_proven():
    docs = triplet()
    docs[DocumentType.INVOICE].line_items_complete = False

    status, _, _, mismatches = reconcile(docs)

    assert status == ReconciliationStatus.REVIEW
    assert any(
        m.type == MismatchType.LOW_CONFIDENCE_EXTRACTION and m.field == "items" for m in mismatches
    )


def test_hold_on_wrong_sender():
    docs = triplet()
    docs[DocumentType.DELIVERY_ORDER].sender.value = "PT Gudang Lain"
    docs[DocumentType.DELIVERY_ORDER].sender.raw_value = "PT Gudang Lain"
    status, _, _, mismatches = reconcile(docs)
    assert status == ReconciliationStatus.HOLD
    assert any(m.type == MismatchType.WRONG_SENDER for m in mismatches)


def test_hold_on_item_description_mismatch():
    docs = triplet()
    docs[DocumentType.PACKING_LIST].items[0].description.value = "Laptop Gaming 16 inch"
    docs[DocumentType.PACKING_LIST].items[0].description.raw_value = "Laptop Gaming 16 inch"
    status, _, _, mismatches = reconcile(docs)
    assert status == ReconciliationStatus.HOLD
    assert any(m.type == MismatchType.ITEM_DESCRIPTION_MISMATCH for m in mismatches)


def test_review_when_document_identifier_missing():
    docs = triplet()
    docs[DocumentType.INVOICE].document_id.value = None
    docs[DocumentType.INVOICE].document_id.confidence = 0.0
    status, _, _, mismatches = reconcile(docs)
    assert status == ReconciliationStatus.REVIEW
    assert any(
        m.type == MismatchType.LOW_CONFIDENCE_EXTRACTION and m.field == "document_id"
        for m in mismatches
    )


def test_hold_when_address_number_differs_despite_high_fuzzy_similarity():
    docs = triplet()
    docs[DocumentType.DELIVERY_ORDER].destination.value = "Jl Merdeka 11 Bandung"
    docs[DocumentType.DELIVERY_ORDER].destination.raw_value = "Jl Merdeka 11 Bandung"

    status, _, _, mismatches = reconcile(docs)

    assert status == ReconciliationStatus.HOLD
    assert any(m.type == MismatchType.WRONG_DESTINATION for m in mismatches)


def test_hold_when_company_name_only_matches_as_subset():
    docs = triplet()
    docs[DocumentType.DELIVERY_ORDER].recipient.value = "PT Maju Jaya Cabang Surabaya"
    docs[DocumentType.DELIVERY_ORDER].recipient.raw_value = "PT Maju Jaya Cabang Surabaya"

    status, _, _, mismatches = reconcile(docs)

    assert status == ReconciliationStatus.HOLD
    assert any(m.type == MismatchType.WRONG_RECIPIENT for m in mismatches)


def test_near_text_typo_requires_review_instead_of_auto_clear():
    docs = triplet()
    docs[DocumentType.DELIVERY_ORDER].recipient.value = "PT Maju Jayae"
    docs[DocumentType.DELIVERY_ORDER].recipient.raw_value = "PT Maju Jayae"

    status, _, _, mismatches = reconcile(docs)

    assert status == ReconciliationStatus.REVIEW
    assert any(m.type == MismatchType.POSSIBLE_TEXT_VARIATION for m in mismatches)
