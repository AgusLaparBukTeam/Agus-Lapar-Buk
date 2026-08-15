from __future__ import annotations

from functools import lru_cache
from typing import Annotated, Literal

from pydantic import field_validator, model_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=(".env", "../.env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    app_env: str = "development"
    database_url: str = "sqlite:///./gateguard.db"
    cors_origins: Annotated[list[str], NoDecode] = ["http://localhost:3000"]
    max_upload_bytes: int = 10 * 1024 * 1024
    document_storage_root: str = "./uploads"
    document_allowed_mime_types: Annotated[list[str], NoDecode] = [
        "application/pdf",
        "image/jpeg",
        "image/png",
    ]
    max_pdf_pages: int = 50
    max_pdf_text_chars: int = 500_000
    max_image_pixels: int = 40_000_000
    rate_limit_requests: int = 180
    rate_limit_window_seconds: int = 60
    app_api_key: str | None = None
    session_ttl_seconds: int = 8 * 60 * 60
    cookie_secure: bool | None = None
    app_version: str = "0.1.0"

    extraction_provider: Literal["auto", "local", "openai", "paddle"] = "auto"
    critical_confidence_threshold: float = 0.75
    max_ai_concurrency: int = 4
    worker_poll_interval_seconds: float = 2.0
    worker_heartbeat_interval_seconds: float = 10.0

    openai_api_key: str | None = None
    openai_model: str = "gpt-5-mini"
    openai_base_url: str = "https://api.openai.com/v1"
    openai_timeout_seconds: float = 45.0
    paddle_device: str = "cpu"

    @field_validator("cors_origins", mode="before")
    @classmethod
    def parse_origins(cls, value: object) -> object:
        if isinstance(value, str):
            return [item.strip() for item in value.split(",") if item.strip()]
        return value

    @field_validator("document_allowed_mime_types", mode="before")
    @classmethod
    def parse_document_mime_types(cls, value: object) -> object:
        if isinstance(value, str):
            return [item.strip().lower() for item in value.split(",") if item.strip()]
        return value

    @field_validator("critical_confidence_threshold")
    @classmethod
    def validate_threshold(cls, value: float) -> float:
        if not 0 < value <= 1:
            raise ValueError("CRITICAL_CONFIDENCE_THRESHOLD must be between 0 and 1")
        return value

    @field_validator(
        "max_upload_bytes",
        "max_pdf_pages",
        "max_pdf_text_chars",
        "max_image_pixels",
        "rate_limit_requests",
        "rate_limit_window_seconds",
        "max_ai_concurrency",
        "session_ttl_seconds",
    )
    @classmethod
    def validate_positive_ints(cls, value: int) -> int:
        if value < 1:
            raise ValueError("Resource-limit settings must be positive integers")
        return value

    @model_validator(mode="after")
    def validate_production_safety(self):
        if self.app_env.casefold() != "production":
            return self

        if not self.app_api_key or len(self.app_api_key) < 32:
            raise ValueError("APP_API_KEY must be set to at least 32 characters in production")
        if any(origin == "*" for origin in self.cors_origins):
            raise ValueError("Wildcard CORS origins are forbidden in production")
        if self.database_url.startswith("sqlite"):
            raise ValueError(
                "SQLite is supported only for local development. "
                "Configure PostgreSQL for APP_ENV=production"
            )
        return self

    @property
    def secure_cookies(self) -> bool:
        return (
            self.cookie_secure
            if self.cookie_secure is not None
            else self.app_env.casefold() == "production"
        )


@lru_cache
def get_settings() -> Settings:
    return Settings()
