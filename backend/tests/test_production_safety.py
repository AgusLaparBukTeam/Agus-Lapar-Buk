import pytest
from pydantic import ValidationError

from app.core.config import Settings


def test_production_config_fails_closed_without_real_database_and_secrets():
    with pytest.raises(ValidationError):
        Settings(app_env="production")


def test_production_config_accepts_distinct_secrets_and_postgres():
    settings = Settings(
        app_env="production",
        database_url="postgresql+psycopg://gateguard:secret@db/gateguard",
        cors_origins=["https://gateguard.example.com"],
        app_api_key="a" * 32,
    )
    assert settings.app_env == "production"
