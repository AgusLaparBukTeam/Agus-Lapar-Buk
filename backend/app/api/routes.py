from __future__ import annotations

from functools import lru_cache

from fastapi import APIRouter, File, Request, UploadFile

from app.core.config import get_settings
from app.domain.models import DocumentType, OverrideRequest, ReconciliationResult
from app.repositories.reconciliations import ReconciliationRepository
from app.services.extraction import ExtractionRouter
from app.services.file_validation import ensure_distinct_uploads, validate_upload
from app.services.reconciliation_service import ReconciliationService

router = APIRouter()


@lru_cache
def get_repository() -> ReconciliationRepository:
    settings = get_settings()
    return ReconciliationRepository(
        settings.database_url,
        auto_create_schema=settings.app_env.casefold() != "production",
    )


@lru_cache
def get_service() -> ReconciliationService:
    settings = get_settings()
    return ReconciliationService(
        settings=settings,
        repository=get_repository(),
        extractor=ExtractionRouter(settings),
    )


@router.post("/api/reconcile", response_model=ReconciliationResult)
async def reconcile_documents(
    request: Request,
    invoice: UploadFile = File(...),
    packing_list: UploadFile = File(...),
    delivery_order: UploadFile = File(...),
):
    settings = get_settings()
    safe = {
        DocumentType.INVOICE: await validate_upload(
            invoice, settings.max_upload_bytes, settings.max_image_pixels
        ),
        DocumentType.PACKING_LIST: await validate_upload(
            packing_list, settings.max_upload_bytes, settings.max_image_pixels
        ),
        DocumentType.DELIVERY_ORDER: await validate_upload(
            delivery_order, settings.max_upload_bytes, settings.max_image_pixels
        ),
    }
    ensure_distinct_uploads(safe)
    return await get_service().reconcile_uploads(safe)


@router.get("/api/reconciliations/{session_id}", response_model=ReconciliationResult)
def get_reconciliation(session_id: str):
    return get_repository().get(session_id)


@router.post("/api/reconciliations/{session_id}/override", response_model=ReconciliationResult)
def override_reconciliation(session_id: str, body: OverrideRequest):
    return get_repository().override(session_id, body)


@router.get("/api/runtime")
def runtime():
    settings = get_settings()
    return {
        "environment": settings.app_env,
        "extraction_provider": settings.extraction_provider,
        "openai_configured": bool(settings.openai_api_key),
        "paddle_requested": settings.extraction_provider == "paddle",
        "critical_confidence_threshold": settings.critical_confidence_threshold,
        "max_upload_bytes": settings.max_upload_bytes,
        "max_pdf_pages": settings.max_pdf_pages,
        "max_image_pixels": settings.max_image_pixels,
    }
