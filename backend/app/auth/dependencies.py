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


def require_role(*roles: str) -> Callable:
    allowed = frozenset(roles)

    def dependency(user: UserRow = Depends(current_user)) -> UserRow:
        if user.role not in allowed:
            raise GateGuardError(
                "You do not have permission for this operation.", code="FORBIDDEN", status_code=403
            )
        return user

    return dependency


def is_at_least(user: UserRow, role: str) -> bool:
    levels = {"operator": 1, "supervisor": 2, "admin": 3}
    return levels.get(user.role, 0) >= levels.get(role, 99)
