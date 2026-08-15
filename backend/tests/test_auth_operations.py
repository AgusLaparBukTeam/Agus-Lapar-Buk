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
    repository.save(result, organization_id="test-workspace")
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


def test_workspace_membership_role_controls_authorization():
    from fastapi.testclient import TestClient
    from sqlalchemy import select

    from app.api.operations import get_operations
    from app.api.routes import get_repository
    from app.repositories.operations import OrganizationRow, WorkspaceMembershipRow

    repository = get_repository()
    operations = get_operations()
    with operations.session_factory() as session:
        workspace = session.scalar(
            select(OrganizationRow).where(OrganizationRow.code == "DEFAULT")
        )
    assert workspace is not None
    workspace_id = workspace.id
    user = repository.create_user(
        email="global-admin-workspace-operator@example.com",
        display_name="Workspace Operator",
        password_hash=hash_password("a secure password"),
        role="admin",
        organization_id=workspace_id,
    )
    with operations.session_factory() as session:
        membership = session.scalar(
            select(WorkspaceMembershipRow).where(
                WorkspaceMembershipRow.organization_id == workspace_id,
                WorkspaceMembershipRow.user_id == user.id,
            )
        )
        assert membership is not None
        membership.role = "operator"
        session.commit()

    token = create_session(repository, user.id, get_settings())
    client = TestClient(app)
    client.cookies.set("gateguard_session", token)
    response = client.get("/api/users")

    assert response.status_code == 403
    assert response.json()["error"]["code"] == "FORBIDDEN"


def test_password_change_revokes_all_active_sessions(tmp_path):
    repository = ReconciliationRepository(f"sqlite:///{tmp_path / 'password-revocation.db'}")
    user = repository.create_user(
        email="password-revocation@example.com",
        display_name="Password Revocation",
        password_hash=hash_password("a secure password"),
        role="operator",
    )
    first_token = create_session(repository, user.id, get_settings())
    second_token = create_session(repository, user.id, get_settings())

    assert repository.get_session_user(session_hash(first_token)) is not None
    assert repository.get_session_user(session_hash(second_token)) is not None

    repository.change_password(user.id, hash_password("an even more secure password"))

    assert repository.get_session_user(session_hash(first_token)) is None
    assert repository.get_session_user(session_hash(second_token)) is None
