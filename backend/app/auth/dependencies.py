from __future__ import annotations

from collections.abc import Callable

from fastapi import Depends, Request

from app.core.errors import GateGuardError
from app.repositories.reconciliations import UserRow


def current_user(request: Request) -> UserRow:
    user = getattr(request.state, "user", None)
    if user is None:
        raise GateGuardError("Authentication is required.", code="UNAUTHENTICATED", status_code=401)
    return user


def current_workspace_role(request: Request, user: UserRow) -> str:
    """Resolve authorization from the authenticated user's active workspace membership."""
    from app.api.operations import get_operations

    operations = get_operations()
    workspace = operations.organization_for(user, request.headers.get("x-gateguard-organization"))
    return operations.membership_role_for(organization_id=workspace.id, user_id=user.id)


def require_role(*roles: str) -> Callable:
    allowed = frozenset(roles)

    def dependency(request: Request, user: UserRow = Depends(current_user)) -> UserRow:
        if current_workspace_role(request, user) not in allowed:
            raise GateGuardError(
                "You do not have permission for this operation.", code="FORBIDDEN", status_code=403
            )
        return user

    return dependency


def is_at_least(workspace_role: str, role: str) -> bool:
    levels = {"operator": 1, "supervisor": 2, "admin": 3}
    return levels.get(workspace_role, 0) >= levels.get(role, 99)
