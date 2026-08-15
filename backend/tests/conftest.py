import os
from pathlib import Path
from uuid import uuid4

from sqlalchemy import select

os.environ["DATABASE_URL"] = (
    f"sqlite:///{Path(os.getenv('TEMP', '.')) / f'gateguard-tests-{uuid4().hex}.db'}"
)

from app.auth.passwords import hash_password
from app.core.config import get_settings
from app.domain.models import DocumentField, DocumentType, ShipmentDocument, ShipmentItem
from app.repositories.operations import OperationsRepository, OrganizationRow
from app.repositories.reconciliations import ReconciliationRepository

TEST_EMAIL = "test-admin@gateguard.local"
TEST_PASSWORD = "test-password-1234"


def login(client):
    response = client.post("/api/auth/login", json={"email": TEST_EMAIL, "password": TEST_PASSWORD})
    assert response.status_code == 200, response.text
    return client


def pytest_configure():
    settings = get_settings()
    repository = ReconciliationRepository(settings.database_url)
    operations = OperationsRepository(settings.database_url)
    with operations.session_factory() as session:
        organization = session.scalar(
            select(OrganizationRow).where(OrganizationRow.code == "DEFAULT")
        )
    assert organization is not None
    organization_id = organization.id
    if repository.get_user_by_email(TEST_EMAIL) is None:
        repository.create_user(
            email=TEST_EMAIL,
            display_name="Test Admin",
            password_hash=hash_password(TEST_PASSWORD),
            role="admin",
            organization_id=organization_id,
        )


def f(value, confidence=0.95):
    return DocumentField(
        value=value,
        raw_value=str(value) if value is not None else None,
        confidence=confidence,
        source="test",
    )


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
