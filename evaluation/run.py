from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

from app.domain.models import DocumentField, DocumentType, ShipmentDocument, ShipmentItem  # noqa: E402
from app.domain.reconciliation import reconcile  # noqa: E402


def f(value, confidence=0.95):
    return DocumentField(value=value, raw_value=str(value) if value is not None else None,
                         confidence=confidence, source="evaluation_fixture")


def doc(dtype, recipient="PT Maju Jaya", destination="Bandung", sku="SKU-001", qty=100, confidence=0.95):
    return ShipmentDocument(
        document_type=dtype,
        filename=f"{dtype.value}.pdf",
        detected_document_type=dtype,
        document_type_confidence=0.99,
        line_items_complete=True,
        document_id=f(f"DOC-{dtype.value}", confidence),
        shipment_id=f("SHP-1", confidence),
        sender=f("PT Gudang Sentosa", confidence),
        recipient=f(recipient, confidence),
        destination=f(destination, confidence),
        items=[
            ShipmentItem(
                sku=f(sku, confidence),
                description=f("Minyak Goreng 1L", confidence),
                quantity=f(qty, confidence),
                unit_price=f(18000, confidence),
            )
        ],
        extraction_provider="fixture",
    )


CASES = [
    ("clear", {}, set(), "CLEAR"),
    ("quantity", {DocumentType.PACKING_LIST: {"qty": 90}}, {"QUANTITY_MISMATCH"}, "HOLD"),
    ("recipient", {DocumentType.DELIVERY_ORDER: {"recipient": "PT Lain"}}, {"WRONG_RECIPIENT"}, "HOLD"),
    ("low_conf", {DocumentType.INVOICE: {"confidence": 0.4}}, {"LOW_CONFIDENCE_EXTRACTION"}, "REVIEW"),
    ("missing_sku", {DocumentType.PACKING_LIST: {"sku": "SKU-999"}}, {"WRONG_SKU"}, "HOLD"),
]


def main():
    tp = fp = fn = false_clear = 0
    status_correct = 0
    for name, overrides, expected, expected_status in CASES:
        docs = {dtype: doc(dtype, **overrides.get(dtype, {})) for dtype in DocumentType}
        status, _, _, mismatches = reconcile(docs)
        predicted = {m.type.value for m in mismatches}
        tp += len(predicted & expected)
        fp += len(predicted - expected)
        fn += len(expected - predicted)
        status_correct += int(status.value == expected_status)
        if expected_status == "HOLD" and status.value == "CLEAR":
            false_clear += 1
        print(f"{name:12} expected={expected_status:6} predicted={status.value:6} mismatches={sorted(predicted)}")

    precision = tp / (tp + fp) if tp + fp else 1.0
    recall = tp / (tp + fn) if tp + fn else 1.0
    f1 = 2 * precision * recall / (precision + recall) if precision + recall else 0.0
    risky = sum(1 for _, _, _, status in CASES if status == "HOLD")
    false_clear_rate = false_clear / risky if risky else 0.0
    print("\nSynthetic deterministic fixture metrics")
    print(f"mismatch_precision={precision:.3f}")
    print(f"mismatch_recall={recall:.3f}")
    print(f"mismatch_f1={f1:.3f}")
    print(f"false_clearance_rate={false_clear_rate:.3f}")
    print(f"status_accuracy={status_correct / len(CASES):.3f}")
    print("NOTE: These are synthetic rule fixtures, not OCR/model benchmark results.")


if __name__ == "__main__":
    main()
