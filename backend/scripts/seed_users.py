from __future__ import annotations

import os

from app.auth.service import require_password
from app.core.config import get_settings
from app.repositories.reconciliations import ReconciliationRepository


def seed_user(repository: ReconciliationRepository, prefix: str) -> bool:
    email = os.environ[f"{prefix}_EMAIL"].strip()
    password = os.environ[f"{prefix}_PASSWORD"]
    display_name = os.environ[f"{prefix}_DISPLAY_NAME"].strip()
    role = os.environ[f"{prefix}_ROLE"].strip().casefold()
    if repository.get_user_by_email(email):
        return False
    user = repository.create_user(
        email=email,
        display_name=display_name,
        password_hash=require_password(password),
        role=role,
    )
    repository.record_audit(
        "user.created.bootstrap", "user", entity_id=user.id, metadata={"role": role}
    )
    return True


def main() -> int:
    prefixes = ("SEED_USER_1", "SEED_USER_2")
    required = [f"{prefix}_{field}" for prefix in prefixes for field in ("EMAIL", "PASSWORD", "DISPLAY_NAME", "ROLE")]
    missing = [name for name in required if not os.environ.get(name)]
    if missing:
        raise SystemExit(f"Missing required seed settings: {', '.join(missing)}")

    settings = get_settings()
    repository = ReconciliationRepository(
        settings.database_url, auto_create_schema=settings.app_env.casefold() != "production"
    )
    created = sum(seed_user(repository, prefix) for prefix in prefixes)
    print(f"Seed check complete: {created} account(s) created.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
