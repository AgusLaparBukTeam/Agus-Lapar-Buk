from __future__ import annotations

from dataclasses import dataclass
from typing import Literal, Protocol


class Principal(Protocol):
    """Authenticated actor used for authorization and audit attribution."""

    actor_type: Literal["human", "service"]
    actor_id: str
    organization_id: str
    display_name: str


@dataclass(frozen=True)
class HumanPrincipal:
    user_id: str
    organization_id: str
    role: str
    display_name: str
    actor_type: Literal["human"] = "human"

    @property
    def actor_id(self) -> str:
        return self.user_id


@dataclass(frozen=True)
class ServicePrincipal:
    service_account_id: str
    organization_id: str
    display_name: str
    scopes: frozenset[str]
    actor_type: Literal["service"] = "service"

    @property
    def actor_id(self) -> str:
        return self.service_account_id

    def requires_scope(self, scope: str) -> None:
        if scope not in self.scopes:
            from app.core.errors import GateGuardError

            raise GateGuardError(
                "This token is not allowed to perform the requested operation.",
                code="FORBIDDEN",
                status_code=403,
            )
