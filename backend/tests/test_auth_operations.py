from datetime import UTC, datetime, timedelta

from fastapi.testclient import TestClient

from app.auth.passwords import hash_password
from app.auth.service import create_session, session_hash
from app.core.config import get_settings
from app.domain.models import AuditState, ReconciliationResult, ReconciliationStatus
from app.main import app
from app.repositories.reconciliations import ReconciliationRepository


def test_password_and_session_expiration(tmp_path):
    repository = ReconciliationRepository(f"sqlite:///{tmp_path / 'auth.db'}")
    user = repository.create_user(
        email="operator@example.com",
        display_name="Operator",
        password_hash=hash_password("a secure password"),
        role="operator",
    )
    assert user.password_hash != "a secure password"
    assert repository.get_session_user("missing") is None
    repository.create_session(
        token_hash=session_hash("expired"),
        user_id=user.id,
        expires_at=datetime.now(UTC) - timedelta(minutes=1),
    )
    assert repository.get_session_user(session_hash("expired")) is None


def test_operator_cannot_override():
    from app.api.routes import get_repository

    repository = get_repository()
    user = repository.create_user(
        email="operator-rbac@example.com",
        display_name="Operator",
        password_hash=hash_password("a secure password"),
        role="operator",
    )
    result = ReconciliationResult(
        session_id="00000000-0000-0000-0000-000000000101",
        status=ReconciliationStatus.HOLD,
        reason="Conflict",
        recommended_action="Hold",
        documents={},
        mismatches=[],
        audit=AuditState(system_decision=ReconciliationStatus.HOLD),
    )
    repository.save(result)
    token = create_session(repository, user.id, get_settings())
    client = TestClient(app)
    client.cookies.set("gateguard_session", token)
    response = client.post(
        f"/api/reconciliations/{result.session_id}/override",
        json={"final_decision": "CLEAR", "reason": "Operator cannot approve"},
    )
    assert response.status_code == 403


def test_admin_cannot_create_another_administrator():
    from conftest import login

    client = login(TestClient(app))
    response = client.post(
        "/api/users",
        json={
            "email": "reserved-admin@example.com",
            "display_name": "Reserved Admin",
            "password": "a secure password",
            "role": "admin",
        },
    )

    assert response.status_code == 422
    assert response.json()["error"]["code"] == "ADMIN_ROLE_RESERVED"


def test_admin_cannot_promote_user_to_administrator():
    from conftest import login

    client = login(TestClient(app))
    created = client.post(
        "/api/users",
        json={
            "email": "promotable-operator@example.com",
            "display_name": "Promotable Operator",
            "password": "a secure password",
            "role": "operator",
        },
    )
    assert created.status_code == 201

    response = client.patch(
        f"/api/users/{created.json()['id']}",
        json={"role": "admin"},
    )

    assert response.status_code == 422
    assert response.json()["error"]["code"] == "ADMIN_ROLE_RESERVED"
