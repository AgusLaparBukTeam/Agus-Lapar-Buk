from __future__ import annotations

import json
from datetime import UTC, datetime, time, timedelta
from functools import lru_cache

from fastapi import APIRouter, Depends, File, Request, Response, UploadFile

from app.auth.dependencies import current_user, require_role
from app.auth.service import (
    SESSION_COOKIE,
    authenticate,
    create_session,
    require_password,
    session_hash,
)
from app.core.config import get_settings
from app.core.errors import GateGuardError
from app.domain.models import (
    AuditEventResponse,
    DashboardSummary,
    DocumentType,
    LoginRequest,
    OverrideRequest,
    PaginatedReconciliations,
    PaginatedShipments,
    PaginatedWorkQueue,
    ReconciliationResult,
    ReconciliationStatus,
    ReleaseDecisionRequest,
    ReleaseDecisionResponse,
    ShipmentCreateRequest,
    ShipmentResponse,
    ShipmentStatus,
    UserCreateRequest,
    UserResponse,
    UserUpdateRequest,
    WorkQueueItem,
    WorkQueueUpdateRequest,
)
from app.repositories.reconciliations import ReconciliationRepository, UserRow, user_dict
from app.services.extraction import ExtractionRouter
from app.services.file_validation import ensure_distinct_uploads, validate_upload
from app.services.reconciliation_service import ReconciliationService

router = APIRouter()


@lru_cache
def get_repository() -> ReconciliationRepository:
    settings = get_settings()
    return ReconciliationRepository(
        settings.database_url, auto_create_schema=settings.app_env.casefold() != "production"
    )


@lru_cache
def get_service() -> ReconciliationService:
    settings = get_settings()
    return ReconciliationService(
        settings=settings, repository=get_repository(), extractor=ExtractionRouter(settings)
    )


def user_response(user: UserRow) -> UserResponse:
    return UserResponse.model_validate(user_dict(user))


def parse_boundary(value: str | None, *, end: bool = False) -> datetime | None:
    if not value:
        return None
    parsed = datetime.fromisoformat(value)
    parsed = parsed.replace(tzinfo=UTC) if parsed.tzinfo is None else parsed.astimezone(UTC)
    return parsed + timedelta(days=1) if end and len(value) == 10 else parsed


def readiness_summary() -> dict[str, str]:
    try:
        get_repository().ping()
        database = "healthy"
    except Exception:
        database = "unavailable"
    return {"application": "healthy", "database": database}


@router.post("/api/auth/login", response_model=UserResponse)
def login(body: LoginRequest, request: Request, response: Response):
    user = authenticate(get_repository(), body.email, body.password)
    if user is None:
        get_repository().record_audit(
            "auth.login.failure",
            "user",
            metadata={"email": body.email.strip().casefold()},
            request_id=request.state.request_id,
        )
        raise GateGuardError(
            "Email or password is incorrect.", code="INVALID_CREDENTIALS", status_code=401
        )
    token = create_session(get_repository(), user.id, get_settings())
    response.set_cookie(
        SESSION_COOKIE,
        token,
        httponly=True,
        secure=get_settings().secure_cookies,
        samesite="lax",
        max_age=get_settings().session_ttl_seconds,
        path="/",
    )
    get_repository().record_audit(
        "auth.login.success",
        "user",
        entity_id=user.id,
        actor=user,
        request_id=request.state.request_id,
    )
    return user_response(user)


@router.post("/api/auth/logout")
def logout(request: Request, response: Response):
    token = request.cookies.get(SESSION_COOKIE)
    user = get_repository().revoke_session(session_hash(token)) if token else None
    if user:
        get_repository().record_audit(
            "auth.logout",
            "user",
            entity_id=user.id,
            actor=user,
            request_id=request.state.request_id,
        )
    response.delete_cookie(SESSION_COOKIE, path="/")
    return {"status": "ok"}


@router.get("/api/auth/me", response_model=UserResponse)
def me(user: UserRow = Depends(current_user)):
    return user_response(user)


@router.post("/api/reconcile", response_model=ReconciliationResult)
async def reconcile_documents(
    request: Request,
    invoice: UploadFile = File(...),
    packing_list: UploadFile = File(...),
    delivery_order: UploadFile = File(...),
    user: UserRow = Depends(current_user),
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
    result = await get_service().reconcile_uploads(safe)
    get_repository().record_audit(
        "reconciliation.created",
        "reconciliation",
        entity_id=result.session_id,
        actor=user,
        metadata={"status": result.status.value, "processing_ms": result.processing_ms},
        request_id=request.state.request_id,
    )
    return result


@router.get("/api/reconciliations", response_model=PaginatedReconciliations)
def list_reconciliations(
    page: int = 1,
    page_size: int = 25,
    status: str | None = None,
    date_from: str | None = None,
    date_to: str | None = None,
    overridden: bool | None = None,
    query: str | None = None,
    _: UserRow = Depends(current_user),
):
    if not 1 <= page <= 100_000 or not 1 <= page_size <= 100:
        raise GateGuardError("Invalid pagination values.", code="VALIDATION_ERROR", status_code=422)
    if status and status not in {item.value for item in ReconciliationStatus}:
        raise GateGuardError(
            "Invalid reconciliation status.", code="VALIDATION_ERROR", status_code=422
        )
    try:
        start = parse_boundary(date_from)
        end = parse_boundary(date_to, end=True)
    except ValueError as exc:
        raise GateGuardError(
            "Invalid date filter.", code="VALIDATION_ERROR", status_code=422
        ) from exc
    items, total = get_repository().list_reconciliations(
        page=page,
        page_size=page_size,
        status=status,
        date_from=start,
        date_to=end,
        overridden=overridden,
        query=query,
    )
    return PaginatedReconciliations(items=items, page=page, page_size=page_size, total=total)


@router.get("/api/reconciliations/{session_id}", response_model=ReconciliationResult)
def get_reconciliation(session_id: str, _: UserRow = Depends(current_user)):
    return get_repository().get(session_id)


@router.post("/api/reconciliations/{session_id}/override", response_model=ReconciliationResult)
def override_reconciliation(
    session_id: str,
    body: OverrideRequest,
    request: Request,
    user: UserRow = Depends(require_role("supervisor", "admin")),
):
    return get_repository().override(
        session_id, body, actor_user=user, request_id=request.state.request_id
    )


@router.get("/api/dashboard/summary", response_model=DashboardSummary)
def dashboard(_: UserRow = Depends(current_user)):
    today = datetime.now(UTC).date()
    summary = get_repository().dashboard(
        datetime.combine(today, time.min, UTC),
        datetime.combine(today + timedelta(days=1), time.min, UTC),
    )
    return DashboardSummary(
        date=today.isoformat(),
        readiness=readiness_summary(),
        **summary,
    )


@router.get("/api/shipments", response_model=PaginatedShipments)
def list_shipments(
    page: int = 1,
    page_size: int = 25,
    status: str | None = None,
    query: str | None = None,
    _: UserRow = Depends(current_user),
):
    if not 1 <= page <= 100_000 or not 1 <= page_size <= 100:
        raise GateGuardError("Invalid pagination values.", code="VALIDATION_ERROR", status_code=422)
    if status and status not in {item.value for item in ShipmentStatus}:
        raise GateGuardError("Invalid shipment status.", code="VALIDATION_ERROR", status_code=422)
    items, total = get_repository().list_shipments(
        page=page,
        page_size=page_size,
        status=status,
        query=query,
    )
    return PaginatedShipments(items=items, page=page, page_size=page_size, total=total)


@router.post("/api/shipments", response_model=ShipmentResponse, status_code=201)
def create_shipment(
    body: ShipmentCreateRequest,
    request: Request,
    user: UserRow = Depends(current_user),
):
    shipment = get_repository().create_shipment(payload=body.model_dump(), actor=user)
    get_repository().record_audit(
        "shipment.created",
        "shipment",
        entity_id=shipment["id"],
        actor=user,
        metadata={"status": shipment["status"]},
        request_id=request.state.request_id,
    )
    return ShipmentResponse.model_validate(shipment)


@router.get("/api/shipments/{shipment_id}", response_model=ShipmentResponse)
def get_shipment(shipment_id: str, _: UserRow = Depends(current_user)):
    return ShipmentResponse.model_validate(get_repository().get_shipment(shipment_id))


@router.get("/api/work-queue", response_model=PaginatedWorkQueue)
def work_queue(
    page: int = 1,
    page_size: int = 25,
    status: str | None = None,
    priority: str | None = None,
    assignee: str | None = None,
    _: UserRow = Depends(current_user),
):
    if not 1 <= page <= 100_000 or not 1 <= page_size <= 100:
        raise GateGuardError("Invalid pagination values.", code="VALIDATION_ERROR", status_code=422)
    items, total = get_repository().list_work_queue(
        page=page,
        page_size=page_size,
        status=status,
        priority=priority,
        assignee=assignee,
    )
    return PaginatedWorkQueue(items=items, page=page, page_size=page_size, total=total)


@router.patch("/api/work-queue/{task_id}", response_model=WorkQueueItem)
def update_work_queue(
    task_id: str,
    body: WorkQueueUpdateRequest,
    request: Request,
    user: UserRow = Depends(current_user),
):
    item = get_repository().update_work_task(task_id, status=body.status.value, actor=user)
    get_repository().record_audit(
        "work_queue.updated",
        "review_task",
        entity_id=task_id,
        actor=user,
        metadata={"status": body.status.value},
        request_id=request.state.request_id,
    )
    return WorkQueueItem.model_validate(item)


@router.post(
    "/api/shipments/{shipment_id}/release-decision", response_model=ReleaseDecisionResponse
)
def release_decision(
    shipment_id: str,
    body: ReleaseDecisionRequest,
    request: Request,
    user: UserRow = Depends(require_role("supervisor", "admin")),
):
    shipment, decided_at = get_repository().decide_release(
        shipment_id, decision=body.decision, reason=body.reason, actor=user
    )
    get_repository().record_audit(
        "shipment.release_decision",
        "shipment",
        entity_id=shipment_id,
        actor=user,
        metadata={"decision": body.decision, "reason": body.reason},
        request_id=request.state.request_id,
    )
    return ReleaseDecisionResponse(
        shipment=shipment,
        decision=body.decision,
        reason=body.reason,
        decided_by=user.display_name,
        decided_at=decided_at,
    )


@router.get("/api/audit", response_model=list[AuditEventResponse])
def audit(_: UserRow = Depends(require_role("admin", "supervisor"))):
    return [
        AuditEventResponse(
            id=row.id,
            actor_user_id=row.actor_user_id,
            actor_display_name=row.actor_display_name,
            event_type=row.event_type,
            entity_type=row.entity_type,
            entity_id=row.entity_id,
            metadata=json.loads(row.metadata_json),
            request_id=row.request_id,
            created_at=row.created_at,
        )
        for row in get_repository().list_audit()
    ]


@router.get("/api/monitoring")
def monitoring(_: UserRow = Depends(current_user)):
    settings = get_settings()
    volume = get_repository().dashboard(datetime.now(UTC) - timedelta(days=1), datetime.now(UTC))
    volume.pop("recent", None)
    return {
        **readiness_summary(),
        "version": settings.app_version,
        "provider_configured": settings.extraction_provider == "local"
        or bool(settings.openai_api_key)
        or settings.extraction_provider == "paddle",
        "limits": {
            "max_upload_bytes": settings.max_upload_bytes,
            "max_pdf_pages": settings.max_pdf_pages,
        },
        "volume": volume,
    }


@router.get("/api/users", response_model=list[UserResponse])
def users(
    _: UserRow = Depends(
        require_role(
            "admin",
        )
    ),
):
    return [user_response(user) for user in get_repository().list_users()]


@router.post("/api/users", response_model=UserResponse, status_code=201)
def create_user(
    body: UserCreateRequest,
    request: Request,
    actor: UserRow = Depends(
        require_role(
            "admin",
        )
    ),
):
    user = get_repository().create_user(
        email=body.email,
        display_name=body.display_name,
        password_hash=require_password(body.password),
        role=body.role.value,
    )
    get_repository().record_audit(
        "user.created",
        "user",
        entity_id=user.id,
        actor=actor,
        metadata={"role": user.role},
        request_id=request.state.request_id,
    )
    return user_response(user)


@router.patch("/api/users/{user_id}", response_model=UserResponse)
def update_user(
    user_id: str,
    body: UserUpdateRequest,
    request: Request,
    actor: UserRow = Depends(
        require_role(
            "admin",
        )
    ),
):
    user = get_repository().update_user(
        user_id,
        role=body.role.value if body.role else None,
        active=body.active,
    )
    get_repository().record_audit(
        "user.updated",
        "user",
        entity_id=user.id,
        actor=actor,
        metadata={"role": user.role, "active": user.active},
        request_id=request.state.request_id,
    )
    return user_response(user)


@router.get("/api/runtime")
def runtime(_: UserRow = Depends(current_user)):
    settings = get_settings()
    return {
        "environment": settings.app_env,
        "extraction_provider": settings.extraction_provider,
        "provider_configured": settings.extraction_provider == "local"
        or bool(settings.openai_api_key)
        or settings.extraction_provider == "paddle",
        "critical_confidence_threshold": settings.critical_confidence_threshold,
        "max_upload_bytes": settings.max_upload_bytes,
        "max_pdf_pages": settings.max_pdf_pages,
        "max_image_pixels": settings.max_image_pixels,
    }
