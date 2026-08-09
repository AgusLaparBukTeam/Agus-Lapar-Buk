from __future__ import annotations

import hashlib
import secrets
from datetime import UTC, datetime, timedelta

from app.auth.passwords import hash_password, verify_password
from app.core.config import Settings
from app.core.errors import GateGuardError
from app.repositories.reconciliations import ReconciliationRepository, UserRow

SESSION_COOKIE = "gateguard_session"


def session_hash(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def authenticate(repository: ReconciliationRepository, email: str, password: str) -> UserRow | None:
    user = repository.get_user_by_email(email)
    if user is None or not user.active or not verify_password(user.password_hash, password):
        return None
    repository.mark_login(user.id)
    return user


def create_session(repository: ReconciliationRepository, user_id: str, settings: Settings) -> str:
    token = secrets.token_urlsafe(48)
    repository.create_session(
        token_hash=session_hash(token),
        user_id=user_id,
        expires_at=datetime.now(UTC) + timedelta(seconds=settings.session_ttl_seconds),
    )
    return token


def user_from_token(repository: ReconciliationRepository, token: str | None) -> UserRow | None:
    if not token:
        return None
    return repository.get_session_user(session_hash(token))


def require_password(password: str) -> str:
    if len(password) < 12 or len(password) > 256:
        raise GateGuardError(
            "Password must be between 12 and 256 characters.",
            code="INVALID_PASSWORD",
            status_code=422,
        )
    return hash_password(password)
