from datetime import UTC, datetime
from uuid import uuid4

from conftest import login
from fastapi.testclient import TestClient

from app.api.operations import get_operations
from app.api.routes import get_repository
from app.auth.passwords import hash_password
from app.auth.service import create_session
from app.core.config import get_settings
from app.main import app
from app.repositories.operations import OrganizationRow


def _create_workspace() -> str:
    operations = get_operations()
    organization_id = str(uuid4())
    now = datetime.now(UTC)
    with operations.session_factory() as session:
        session.add(
            OrganizationRow(
                id=organization_id,
                name="Isolated tenant",
                code=f"ISO-{uuid4().hex[:8]}",
                active=True,
                created_at=now,
                updated_at=now,
            )
        )
        session.commit()
    return organization_id


def test_api_rejects_cross_workspace_shipment_id_guessing():
    admin_client = login(TestClient(app))
    created = admin_client.post(
        "/api/shipments",
        json={
            "internal_reference": "API-ISOLATION-001",
            "origin": "Jakarta",
            "destination": "Bandung",
            "transport_mode": "Road",
        },
    )
    assert created.status_code == 201, created.text
    shipment_id = created.json()["id"]

    workspace_b = _create_workspace()
    repository = get_repository()
    user_b = repository.create_user(
        email=f"isolated-{uuid4().hex}@example.test",
        display_name="Isolated supervisor",
        password_hash=hash_password("a secure password"),
        role="supervisor",
        organization_id=workspace_b,
    )
    other_client = TestClient(app)
    other_client.cookies.set(
        "gateguard_session",
        create_session(repository, user_b.id, get_settings()),
    )

    detail = other_client.get(f"/api/shipments/{shipment_id}")
    listing = other_client.get("/api/shipments?query=API-ISOLATION-001")
    mutation = other_client.put(
        f"/api/shipments/{shipment_id}/trusted-reference",
        json={"shipment_reference": "API-ISOLATION-001"},
    )

    assert detail.status_code == 404
    assert listing.status_code == 200, listing.text
    assert listing.json()["total"] == 0
    assert mutation.status_code == 404
