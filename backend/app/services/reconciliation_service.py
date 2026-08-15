from __future__ import annotations

import asyncio
import time
import uuid

from app.core.config import Settings
from app.domain.models import (
    AuditState,
    DocumentType,
    ReconciliationResult,
)
from app.domain.reconciliation import reconcile
from app.repositories.reconciliations import ReconciliationRepository
from app.services.extraction import ExtractionRouter
from app.services.file_validation import SafeUpload


class ReconciliationService:
    def __init__(
        self,
        settings: Settings,
        repository: ReconciliationRepository,
        extractor: ExtractionRouter,
    ):
        self.settings = settings
        self.repository = repository
        self.extractor = extractor

    async def reconcile_uploads(
        self,
        uploads: dict[DocumentType, SafeUpload],
        *,
        organization_id: str,
    ) -> ReconciliationResult:
        started = time.perf_counter()
        ordered = list(uploads.items())
        extracted = await asyncio.gather(
            *(self.extractor.extract(upload, dtype) for dtype, upload in ordered)
        )
        documents = {
            dtype: document for (dtype, _), document in zip(ordered, extracted, strict=True)
        }
        status, reason, action, mismatches = reconcile(
            documents,
            confidence_threshold=self.settings.critical_confidence_threshold,
        )
        result = ReconciliationResult(
            session_id=str(uuid.uuid4()),
            status=status,
            reason=reason,
            recommended_action=action,
            documents=documents,
            mismatches=mismatches,
            audit=AuditState(system_decision=status),
            processing_ms=int((time.perf_counter() - started) * 1000),
        )
        return self.repository.save(result, organization_id=organization_id)
