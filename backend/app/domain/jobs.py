from __future__ import annotations

from enum import StrEnum


class ProcessingJobType(StrEnum):
    ASSESS_SHIPMENT = "ASSESS_SHIPMENT"
    EXTRACT_DOCUMENT = "EXTRACT_DOCUMENT"
    SCREEN_PARTY = "SCREEN_PARTY"
    SEND_WEBHOOK = "SEND_WEBHOOK"
    ESCALATE_TASKS = "ESCALATE_TASKS"


BUILT_IN_JOB_TYPES = frozenset(item.value for item in ProcessingJobType)
