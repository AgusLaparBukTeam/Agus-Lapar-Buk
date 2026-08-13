"""Print evidence and discrepancy estimates for the bundled hold-quantity demo files."""

from __future__ import annotations

import asyncio
from pathlib import Path

from app.domain.models import DocumentType
from app.domain.reconciliation import reconcile
from app.services.extraction import LocalPdfExtractor
from app.services.file_validation import SafeUpload


async def main() -> None:
    root = Path(__file__).resolve().parents[2] / "samples" / "hold-quantity"
    names = {
        DocumentType.INVOICE: "invoice.pdf",
        DocumentType.PACKING_LIST: "packing-list.pdf",
        DocumentType.DELIVERY_ORDER: "surat-jalan.pdf",
    }
    extractor = LocalPdfExtractor()
    documents = {}
    for document_type, name in names.items():
        data = (root / name).read_bytes()
        upload = SafeUpload(
            filename=name,
            extension=".pdf",
            media_type="application/pdf",
            data=data,
            sha256="demo",
        )
        documents[document_type] = await extractor.extract(upload, document_type)
    status, _, _, mismatches = reconcile(documents)
    print(f"status={status}")
    for mismatch in mismatches:
        if mismatch.field == "items.quantity":
            print(f"estimated_discrepancy_value={mismatch.estimated_discrepancy_value}")
            for evidence in mismatch.evidence:
                boxes = [
                    (box.page, box.x, box.y, box.width, box.height, box.text)
                    for box in evidence.evidence
                ]
                print(f"{evidence.document_type}: {boxes}")


if __name__ == "__main__":
    asyncio.run(main())
