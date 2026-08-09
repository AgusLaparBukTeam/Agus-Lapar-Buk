from __future__ import annotations

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api.routes import get_repository, router
from app.core.config import get_settings
from app.core.errors import GateGuardError
from app.core.logging import configure_logging
from app.core.security import install_security_middleware

configure_logging()
settings = get_settings()

app = FastAPI(
    title="GateGuard API",
    version="0.1.0",
    docs_url="/docs" if settings.app_env != "production" else None,
    redoc_url=None,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PATCH", "OPTIONS"],
    allow_headers=["Content-Type", "X-API-Key", "X-Request-ID"],
)

install_security_middleware(app, settings)
app.include_router(router)


@app.exception_handler(GateGuardError)
async def gateguard_error(request: Request, exc: GateGuardError):
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "error": {
                "code": exc.code,
                "message": exc.safe_message,
                "request_id": getattr(request.state, "request_id", None),
            }
        },
    )


@app.exception_handler(RequestValidationError)
async def validation_error(request: Request, exc: RequestValidationError):
    return JSONResponse(
        status_code=422,
        content={
            "error": {
                "code": "VALIDATION_ERROR",
                "message": "The request did not match the API contract.",
                "request_id": getattr(request.state, "request_id", None),
                "details": [
                    {"location": list(err["loc"]), "message": err["msg"]} for err in exc.errors()
                ],
            }
        },
    )


@app.get("/healthz")
def healthz():
    return {"status": "ok"}


@app.get("/readyz")
def readyz():
    # Execute a real query so readiness fails if a cached repository loses DB connectivity.
    get_repository().ping()
    return {"status": "ready"}
