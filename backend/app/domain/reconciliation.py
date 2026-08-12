from __future__ import annotations

import re
import uuid
from collections import Counter
from decimal import Decimal
from itertools import combinations

from rapidfuzz.fuzz import ratio, token_set_ratio, token_sort_ratio

from app.domain.models import (
    DocumentField,
    DocumentType,
    EvidenceValue,
    Mismatch,
    MismatchType,
    ReconciliationStatus,
    Severity,
    ShipmentDocument,
)
from app.domain.normalization import (
    normalize_address,
    normalize_company,
    normalize_sku,
    normalize_text,
    parse_number,
)

CRITICAL_FIELDS = ("recipient", "destination")


def _numeric_tokens(value: str) -> tuple[str, ...]:
    return tuple(re.findall(r"\d+(?:[.,]\d+)?", value))


def _close_text_variation(values: list[str], threshold: float = 90.0) -> bool:
    """Return True only for near variants; never use this to grant CLEAR."""
    for left, right in combinations(values, 2):
        # Numeric changes in an address/name/description are treated as material conflicts.
        if _numeric_tokens(left) != _numeric_tokens(right):
            return False
        if min(ratio(left, right), token_sort_ratio(left, right)) < threshold:
            return False
    return True


def _ev(doc: ShipmentDocument, field: str, value: DocumentField) -> EvidenceValue:
    return EvidenceValue(
        document_type=doc.document_type,
        field=field,
        value=value.value,
        raw_value=value.raw_value,
        confidence=value.confidence,
        evidence=value.evidence,
    )


def _type_ev(doc: ShipmentDocument) -> EvidenceValue:
    return EvidenceValue(
        document_type=doc.document_type,
        field="document_type",
        value=doc.detected_document_type.value if doc.detected_document_type else None,
        raw_value=None,
        confidence=doc.document_type_confidence,
        evidence=[],
    )


def _mismatch(
    mismatch_type: MismatchType,
    severity: Severity,
    field: str,
    explanation: str,
    evidence: list[EvidenceValue],
    estimated: float | None = None,
    price_source: DocumentType | None = None,
) -> Mismatch:
    return Mismatch(
        id=str(uuid.uuid4()),
        type=mismatch_type,
        severity=severity,
        field=field,
        explanation=explanation,
        evidence=evidence,
        estimated_discrepancy_value=estimated,
        estimate_price_source=price_source,
    )


def _compare_critical_text(
    docs: list[ShipmentDocument],
    field: str,
    mismatch_type: MismatchType,
    threshold: float,
    severity: Severity = Severity.CRITICAL,
) -> list[Mismatch]:
    values: list[tuple[ShipmentDocument, DocumentField]] = [
        (doc, getattr(doc, field)) for doc in docs
    ]
    low = [
        (doc, value) for doc, value in values if value.value is None or value.confidence < threshold
    ]
    if low:
        return [
            _mismatch(
                MismatchType.LOW_CONFIDENCE_EXTRACTION,
                Severity.MEDIUM,
                field,
                f"{field.replace('_', ' ').title()} is missing or below the "
                "critical confidence threshold.",
                [_ev(doc, field, value) for doc, value in low],
            )
        ]

    normalizer = normalize_company if field == "recipient" else normalize_address
    normalized = [(doc, value, normalizer(str(value.value))) for doc, value in values]
    if len({norm for _, _, norm in normalized}) == 1:
        return []

    normalized_values = [norm for _, _, norm in normalized]
    evidence = [_ev(doc, field, value) for doc, value, _ in normalized]
    if _close_text_variation(normalized_values):
        # Similarity is useful for triage, but probabilistic/fuzzy equivalence is never
        # sufficient for automatic clearance. A human must confirm the variation.
        return [
            _mismatch(
                MismatchType.POSSIBLE_TEXT_VARIATION,
                Severity.MEDIUM,
                field,
                f"{field.replace('_', ' ').title()} is very similar but not exactly "
                "equivalent after safe normalization.",
                evidence,
            )
        ]

    return [
        _mismatch(
            mismatch_type,
            severity,
            field,
            f"{field.replace('_', ' ').title()} differs across shipment documents.",
            evidence,
        )
    ]


def _duplicate_skus(doc: ShipmentDocument, threshold: float) -> list[Mismatch]:
    skus = [
        normalize_sku(str(item.sku.value or ""))
        for item in doc.items
        if item.sku.confidence >= threshold
    ]
    counts = Counter(s for s in skus if s)
    output: list[Mismatch] = []
    for sku, count in counts.items():
        if count > 1:
            evidence = [
                _ev(doc, "items.sku", item.sku)
                for item in doc.items
                if item.sku.confidence >= threshold
                and normalize_sku(str(item.sku.value or "")) == sku
            ]
            output.append(
                _mismatch(
                    MismatchType.DUPLICATE_ITEM,
                    Severity.HIGH,
                    "items.sku",
                    f"SKU {sku} appears {count} times in {doc.document_type.value}.",
                    evidence,
                )
            )
    return output


def _item_map(doc: ShipmentDocument, threshold: float = 0.0) -> dict[str, object]:
    return {
        normalize_sku(str(item.sku.value or "")): item
        for item in doc.items
        if item.sku.confidence >= threshold and normalize_sku(str(item.sku.value or ""))
    }


def _trusted_price(
    docs: list[ShipmentDocument],
    sku: str,
    threshold: float,
) -> tuple[Decimal | None, DocumentType | None]:
    invoice = next((d for d in docs if d.document_type == DocumentType.INVOICE), None)
    ordered = ([invoice] if invoice else []) + [d for d in docs if d is not invoice]
    for doc in ordered:
        if doc is None:
            continue
        item = _item_map(doc, threshold).get(sku)
        if item and item.unit_price.confidence >= threshold:
            value = parse_number(item.unit_price.value)
            if value is not None:
                return value, doc.document_type
    return None, None


def reconcile(
    documents: dict[DocumentType, ShipmentDocument],
    confidence_threshold: float = 0.75,
) -> tuple[ReconciliationStatus, str, str, list[Mismatch]]:
    docs = [documents[t] for t in DocumentType if t in documents]
    mismatches: list[Mismatch] = []

    missing_types = [dtype for dtype in DocumentType if dtype not in documents]
    if missing_types:
        mismatches.append(
            _mismatch(
                MismatchType.LOW_CONFIDENCE_EXTRACTION,
                Severity.MEDIUM,
                "documents",
                "Required document evidence is incomplete: "
                + ", ".join(dtype.value for dtype in missing_types),
                [],
            )
        )

    # A file in the wrong upload slot is an operational conflict. An unknown/weakly
    # classified type cannot be auto-cleared.
    for doc in docs:
        if (
            doc.detected_document_type is None
            or doc.document_type_confidence < confidence_threshold
        ):
            mismatches.append(
                _mismatch(
                    MismatchType.LOW_CONFIDENCE_EXTRACTION,
                    Severity.MEDIUM,
                    "document_type",
                    f"Could not confidently verify that {doc.filename} is a "
                    f"{doc.document_type.value}.",
                    [_type_ev(doc)],
                )
            )
        elif doc.detected_document_type != doc.document_type:
            mismatches.append(
                _mismatch(
                    MismatchType.WRONG_DOCUMENT_TYPE,
                    Severity.CRITICAL,
                    "document_type",
                    f"{doc.filename} appears to be {doc.detected_document_type.value}, "
                    f"but it was uploaded as {doc.document_type.value}.",
                    [_type_ev(doc)],
                )
            )

    mismatches += _compare_critical_text(
        docs, "recipient", MismatchType.WRONG_RECIPIENT, confidence_threshold
    )
    mismatches += _compare_critical_text(
        docs, "destination", MismatchType.WRONG_DESTINATION, confidence_threshold
    )
    mismatches += _compare_critical_text(
        docs, "sender", MismatchType.WRONG_SENDER, confidence_threshold, Severity.HIGH
    )

    # Every source document needs its own traceable identifier even though the identifiers
    # are not expected to be equal across document types.
    for doc in docs:
        if doc.document_id.value is None or doc.document_id.confidence < confidence_threshold:
            mismatches.append(
                _mismatch(
                    MismatchType.LOW_CONFIDENCE_EXTRACTION,
                    Severity.MEDIUM,
                    "document_id",
                    f"Document identifier is missing or uncertain for {doc.document_type.value}.",
                    [_ev(doc, "document_id", doc.document_id)],
                )
            )

    # Shipment IDs are cross-document identifiers when present.
    shipment_fields = [(doc, doc.shipment_id) for doc in docs if doc.shipment_id.value]
    if len(shipment_fields) >= 2:
        normalized_ids = {normalize_text(str(value.value)) for _, value in shipment_fields}
        if len(normalized_ids) > 1:
            mismatches.append(
                _mismatch(
                    MismatchType.DOCUMENT_ID_MISMATCH,
                    Severity.HIGH,
                    "shipment_id",
                    "Shipment identifier differs across documents.",
                    [_ev(doc, "shipment_id", value) for doc, value in shipment_fields],
                )
            )

    # Monetary totals are optional, but conflicting trusted totals are material when at least
    # two documents provide them.
    total_fields = []
    for doc in docs:
        if doc.document_total.value is None or doc.document_total.confidence < confidence_threshold:
            continue
        parsed_total = parse_number(doc.document_total.value)
        if parsed_total is not None:
            total_fields.append((doc, doc.document_total, parsed_total))
    if len(total_fields) >= 2 and len({value for _, _, value in total_fields}) > 1:
        totals = [value for _, _, value in total_fields]
        total_delta = max(totals) - min(totals)
        invoice_total = next(
            (
                (doc, value)
                for doc, _, value in total_fields
                if doc.document_type == DocumentType.INVOICE
            ),
            None,
        )
        fallback_total = invoice_total or (total_fields[0][0], total_fields[0][2])
        price_source = fallback_total[0].document_type
        estimated = float(abs(total_delta)) if total_delta.is_finite() else None
        mismatches.append(
            _mismatch(
                MismatchType.TOTAL_MISMATCH,
                Severity.HIGH,
                "document_total",
                "Trusted monetary totals differ across documents.",
                [_ev(doc, "document_total", field) for doc, field, _ in total_fields],
                estimated,
                price_source,
            )
        )

    uncertain_item_docs: set[DocumentType] = set()
    for doc in docs:
        mismatches += _duplicate_skus(doc, confidence_threshold)
        if not doc.line_items_complete:
            uncertain_item_docs.add(doc.document_type)
            mismatches.append(
                _mismatch(
                    MismatchType.LOW_CONFIDENCE_EXTRACTION,
                    Severity.MEDIUM,
                    "items",
                    "Line-item extraction coverage is not proven complete for "
                    f"{doc.document_type.value}.",
                    [],
                )
            )
        if not doc.items:
            uncertain_item_docs.add(doc.document_type)
            continue
        for index, item in enumerate(doc.items):
            low_fields = []
            for field_name in ("sku", "description", "quantity"):
                value = getattr(item, field_name)
                if value.value is None or value.confidence < confidence_threshold:
                    low_fields.append((field_name, value))
            if low_fields:
                uncertain_item_docs.add(doc.document_type)
                mismatches.append(
                    _mismatch(
                        MismatchType.LOW_CONFIDENCE_EXTRACTION,
                        Severity.MEDIUM,
                        f"items[{index}]",
                        "A critical line-item field is missing or below the confidence threshold.",
                        [_ev(doc, f"items.{name}", value) for name, value in low_fields],
                    )
                )

    maps = {doc.document_type: _item_map(doc, confidence_threshold) for doc in docs}
    all_skus = sorted({sku for mapping in maps.values() for sku in mapping})

    for sku in all_skus:
        present = [(doc, maps[doc.document_type].get(sku)) for doc in docs]
        missing_docs = [doc for doc, item in present if item is None]
        if missing_docs:
            # Missing against an uncertain document is not a proven conflict. Keep REVIEW.
            if any(doc.document_type in uncertain_item_docs for doc in missing_docs):
                continue

            existing = [(doc, item) for doc, item in present if item is not None]
            # Detect likely wrong SKU when descriptions are confidently almost identical.
            wrong_sku_evidence: list[EvidenceValue] = []
            for missing_doc in missing_docs:
                for candidate in missing_doc.items:
                    if (
                        candidate.sku.confidence < confidence_threshold
                        or candidate.description.confidence < confidence_threshold
                    ):
                        continue
                    cdesc = normalize_text(str(candidate.description.value or ""))
                    if not cdesc:
                        continue
                    for existing_doc, existing_item in existing:
                        if existing_item.description.confidence < confidence_threshold:
                            continue
                        edesc = normalize_text(str(existing_item.description.value or ""))
                        if edesc and token_set_ratio(cdesc, edesc) >= 92:
                            wrong_sku_evidence.extend(
                                [
                                    _ev(missing_doc, "items.sku", candidate.sku),
                                    _ev(existing_doc, "items.sku", existing_item.sku),
                                ]
                            )
            if wrong_sku_evidence:
                mismatches.append(
                    _mismatch(
                        MismatchType.WRONG_SKU,
                        Severity.HIGH,
                        "items.sku",
                        f"Likely SKU conflict around item {sku}; descriptions align "
                        "but SKU values differ.",
                        wrong_sku_evidence,
                    )
                )
            else:
                evidence = [_ev(doc, "items.sku", item.sku) for doc, item in existing]
                mismatches.append(
                    _mismatch(
                        MismatchType.MISSING_ITEM,
                        Severity.HIGH,
                        "items",
                        f"SKU {sku} is not present in every required document.",
                        evidence,
                    )
                )
            continue

        descriptions = [
            (doc, item, normalize_text(str(item.description.value or ""))) for doc, item in present
        ]
        if all(
            item.description.confidence >= confidence_threshold and normalized
            for _, item, normalized in descriptions
        ):
            normalized_descriptions = [normalized for _, _, normalized in descriptions]
            if len(set(normalized_descriptions)) > 1:
                evidence = [
                    _ev(doc, "items.description", item.description) for doc, item, _ in descriptions
                ]
                if _close_text_variation(normalized_descriptions):
                    mismatches.append(
                        _mismatch(
                            MismatchType.POSSIBLE_TEXT_VARIATION,
                            Severity.MEDIUM,
                            "items.description",
                            f"Description for SKU {sku} is similar but not exactly "
                            "equivalent across documents.",
                            evidence,
                        )
                    )
                else:
                    mismatches.append(
                        _mismatch(
                            MismatchType.ITEM_DESCRIPTION_MISMATCH,
                            Severity.HIGH,
                            "items.description",
                            f"Description for SKU {sku} differs materially across documents.",
                            evidence,
                        )
                    )

        quantities: list[tuple[ShipmentDocument, object, Decimal | None]] = []
        for doc, item in present:
            quantity = item.quantity
            parsed = (
                parse_number(quantity.value)
                if quantity.confidence >= confidence_threshold
                else None
            )
            quantities.append((doc, item, parsed))
        if any(q is None for _, _, q in quantities):
            # A low-confidence quantity cannot become a proven HOLD.
            continue
        if any(q is not None and q <= 0 for _, _, q in quantities):
            mismatches.append(
                _mismatch(
                    MismatchType.LOW_CONFIDENCE_EXTRACTION,
                    Severity.MEDIUM,
                    "items.quantity",
                    f"Quantity for SKU {sku} is zero or negative in at least one document.",
                    [_ev(doc, "items.quantity", item.quantity) for doc, item, _ in quantities],
                )
            )
            continue

        q_values = {q for _, _, q in quantities if q is not None}
        if len(q_values) > 1:
            q_nums = [q for q in q_values if q is not None]
            delta = max(q_nums) - min(q_nums)
            price, price_source = _trusted_price(docs, sku, confidence_threshold)
            estimated = (
                float(abs(delta * price))
                if price is not None and price.is_finite() and price > 0
                else None
            )
            # Any cross-document quantity mismatch is operationally material.
            mismatches.append(
                _mismatch(
                    MismatchType.QUANTITY_MISMATCH,
                    Severity.HIGH,
                    "items.quantity",
                    f"Quantity for SKU {sku} differs across documents.",
                    [_ev(doc, "items.quantity", item.quantity) for doc, item, _ in quantities],
                    estimated,
                    price_source,
                )
            )

    # If there are no usable items, do not auto-clear.
    if any(not doc.items for doc in docs):
        empty_docs = [doc for doc in docs if not doc.items]
        mismatches.append(
            _mismatch(
                MismatchType.LOW_CONFIDENCE_EXTRACTION,
                Severity.MEDIUM,
                "items",
                "One or more documents have no confidently extracted line items.",
                [
                    EvidenceValue(
                        document_type=doc.document_type,
                        field="items",
                        value=None,
                        raw_value=None,
                        confidence=0.0,
                    )
                    for doc in empty_docs
                ],
            )
        )

    if any(
        m.severity in {Severity.HIGH, Severity.CRITICAL}
        and m.type != MismatchType.LOW_CONFIDENCE_EXTRACTION
        for m in mismatches
    ):
        return (
            ReconciliationStatus.HOLD,
            "A material cross-document conflict was detected.",
            "Stop dispatch and resolve the highlighted mismatch before release.",
            mismatches,
        )
    if mismatches:
        return (
            ReconciliationStatus.REVIEW,
            "Critical evidence is incomplete or below the confidence threshold.",
            "Have a supervisor verify the source documents before dispatch.",
            mismatches,
        )
    return (
        ReconciliationStatus.CLEAR,
        "Required shipment fields and line items are consistent.",
        "Shipment documents are consistent; proceed according to warehouse policy.",
        [],
    )
