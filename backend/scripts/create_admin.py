from __future__ import annotations

import getpass
import sys

from sqlalchemy import select

from app.auth.service import require_password
from app.core.config import get_settings
from app.repositories.operations import OperationsRepository, OrganizationRow
from app.repositories.reconciliations import ReconciliationRepository


def default_workspace_id(settings) -> str:
    operations = OperationsRepository(
        settings.database_url,
        auto_create_schema=settings.app_env.casefold() != "production",
    )
    with operations.session_factory() as session:
        workspace = session.scalar(select(OrganizationRow).where(OrganizationRow.code == "DEFAULT"))
    if workspace is None:
        raise RuntimeError("Bootstrap workspace is unavailable.")
    return workspace.id


def main() -> int:
    email = input("Admin email: ").strip()
    display_name = input("Display name: ").strip()
    password = getpass.getpass("Password (12+ characters): ")
    confirmation = getpass.getpass("Confirm password: ")
    if password != confirmation:
        print("Passwords do not match.", file=sys.stderr)
        return 1
    settings = get_settings()
    repository = ReconciliationRepository(
        settings.database_url, auto_create_schema=settings.app_env.casefold() != "production"
    )
    organization_id = default_workspace_id(settings)
    user = repository.create_user(
        email=email,
        display_name=display_name,
        password_hash=require_password(password),
        role="admin",
        organization_id=organization_id,
    )
    repository.record_audit(
        "user.created.bootstrap",
        "user",
        entity_id=user.id,
        organization_id=organization_id,
        metadata={"role": "admin"},
    )
    print(f"Created admin account for {user.email}.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
