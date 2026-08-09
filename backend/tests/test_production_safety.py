import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app.core.config import Settings
from app.core.security import install_security_middleware


def test_production_config_fails_closed_without_real_database_and_secrets():
    with pytest.raises(ValidationError):
        Settings(app_env="production")


def test_production_config_accepts_distinct_secrets_and_postgres():
    settings = Settings(
        app_env="production",
        database_url="postgresql+psycopg://gateguard:secret@db/gateguard",
        cors_origins=["https://gateguard.example.com"],
        app_api_key="a" * 32,
        supervisor_override_key="b" * 24,
    )
    assert settings.app_env == "production"


def test_override_requires_separate_supervisor_credential_when_configured():
    app = FastAPI()
    settings = Settings(supervisor_override_key="supervisor-secret-value")

    @app.post("/api/reconciliations/{session_id}/override")
    def override(session_id: str):
        return {"session_id": session_id, "ok": True}

    install_security_middleware(app, settings)
    client = TestClient(app)

    denied = client.post("/api/reconciliations/abc/override")
    assert denied.status_code == 403
    assert denied.json()["error"]["code"] == "SUPERVISOR_AUTH_REQUIRED"

    allowed = client.post(
        "/api/reconciliations/abc/override",
        headers={"X-Supervisor-Key": "supervisor-secret-value"},
    )
    assert allowed.status_code == 200
