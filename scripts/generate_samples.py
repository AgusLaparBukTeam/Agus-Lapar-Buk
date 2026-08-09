from pathlib import Path
from io import BytesIO
import json

from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import A4

ROOT = Path(__file__).resolve().parents[1]
SAMPLES = ROOT / "samples"


def make_pdf(path: Path, label: str, doc_id: str, qty: int) -> None:
    buf = BytesIO()
    pdf = canvas.Canvas(buf, pagesize=A4)
    y = 800
    lines = [
        "GateGuard Regression Fixture",
        f"{label} No: {doc_id}",
        "Shipment ID: SHP-DEMO-001",
        "Sender: PT Gudang Sentosa",
        "Recipient: PT Maju Jaya",
        "Destination: Jl Merdeka 10 Bandung",
        "SKU | Description | Quantity | Unit Price | Line Total",
        f"SKU-001 | Minyak Goreng 1L | {qty} | 18000 | {qty * 18000}",
        f"Grand Total: {qty * 18000}",
    ]
    for line in lines:
        pdf.drawString(55, y, line)
        y -= 22
    pdf.save()
    path.write_bytes(buf.getvalue())


def generate(name: str, packing_qty: int) -> None:
    folder = SAMPLES / name
    folder.mkdir(parents=True, exist_ok=True)
    make_pdf(folder / "invoice.pdf", "Invoice", "INV-DEMO-001", 100)
    make_pdf(folder / "packing-list.pdf", "Packing List", "PL-DEMO-001", packing_qty)
    make_pdf(folder / "surat-jalan.pdf", "Surat Jalan", "DO-DEMO-001", 100)
    (folder / "expected.json").write_text(
        json.dumps(
            {
                "synthetic": True,
                "expected_status": "CLEAR" if packing_qty == 100 else "HOLD",
                "expected_mismatches": [] if packing_qty == 100 else ["QUANTITY_MISMATCH"],
            },
            indent=2,
        ) + "\n"
    )


if __name__ == "__main__":
    generate("clear", 100)
    generate("hold-quantity", 90)
