from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from app.domain.models import RiskLevel, ShipmentStatus


@dataclass(frozen=True)
class RiskAssessment:
    score: float
    level: RiskLevel
    factors: list[dict[str, Any]]


RISK_WEIGHTS: dict[str, int] = {
    "BLOCKING_ASSURANCE": 40,
    "MISSING_REQUIRED_DOCUMENT": 25,
    "TRUSTED_SOURCE_CONFLICT": 25,
    "HIGH_CRITICAL_EXCEPTION": 30,
    "LOW_CONFIDENCE_CRITICAL_FIELD": 15,
    "DANGEROUS_GOODS_INCOMPLETE": 20,
    "SCREENING_POTENTIAL_MATCH": 30,
    "RELEASE_INVALIDATED": 25,
}


def calculate_risk(active_factors: list[tuple[str, str]]) -> RiskAssessment:
    """Calculate a transparent, deterministic risk score from persisted findings."""
    factors: list[dict[str, Any]] = []
    score = 0
    for code, reason in active_factors:
        weight = RISK_WEIGHTS.get(code, 10)
        score += weight
        factors.append({"code": code, "reason": reason, "weight": weight})
    bounded = min(score, 100)
    if bounded >= 75:
        level = RiskLevel.CRITICAL
    elif bounded >= 50:
        level = RiskLevel.HIGH
    elif bounded >= 25:
        level = RiskLevel.MEDIUM
    else:
        level = RiskLevel.LOW
    return RiskAssessment(score=float(bounded), level=level, factors=factors)


SHIPMENT_TRANSITIONS: dict[str, set[str]] = {
    ShipmentStatus.DRAFT.value: {ShipmentStatus.DOCUMENTS_REQUIRED.value},
    ShipmentStatus.DOCUMENTS_REQUIRED.value: {
        ShipmentStatus.READY_FOR_ASSESSMENT.value,
        ShipmentStatus.ASSESSING.value,
    },
    ShipmentStatus.READY_FOR_ASSESSMENT.value: {ShipmentStatus.ASSESSING.value},
    ShipmentStatus.ASSESSING.value: {
        ShipmentStatus.REVIEW_REQUIRED.value,
        ShipmentStatus.HOLD.value,
        ShipmentStatus.RELEASE_AUTHORIZED.value,
    },
    ShipmentStatus.REVIEW_REQUIRED.value: {
        ShipmentStatus.ASSESSING.value,
        ShipmentStatus.HOLD.value,
        ShipmentStatus.RELEASE_AUTHORIZED.value,
    },
    ShipmentStatus.HOLD.value: {
        ShipmentStatus.REVIEW_REQUIRED.value,
        ShipmentStatus.ASSESSING.value,
    },
    ShipmentStatus.RELEASE_AUTHORIZED.value: {ShipmentStatus.DISPATCHED.value},
    ShipmentStatus.RELEASE_INVALIDATED.value: {
        ShipmentStatus.REVIEW_REQUIRED.value,
        ShipmentStatus.HOLD.value,
    },
    ShipmentStatus.DISPATCHED.value: {ShipmentStatus.CLOSED.value},
    ShipmentStatus.CLOSED.value: set(),
}


def can_transition(current: str, target: str) -> bool:
    return target in SHIPMENT_TRANSITIONS.get(current, set())
