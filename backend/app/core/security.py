from __future__ import annotations

import asyncio
import re
import secrets
import time
from collections import defaultdict, deque
from collections.abc import Awaitable, Callable

from fastapi import Request
from starlette.responses import JSONResponse, Response

from app.auth.service import SESSION_COOKIE, user_from_token
from app.core.config import Settings
from app.repositories.reconciliations import ReconciliationRepository


class RateLimiter:
    """Single-process safety net. Put a shared limiter/WAF in front for multi-instance deploys."""

    def __init__(self, limit: int, window_seconds: int):
        self.limit = max(limit, 1)
        self.window_seconds = max(window_seconds, 1)
        self._hits: dict[str, deque[float]] = defaultdict(deque)
        self._lock = asyncio.Lock()

    async def allow(self, key: str) -> bool:
        now = time.monotonic()
        cutoff = now - self.window_seconds
        async with self._lock:
            hits = self._hits[key]
            while hits and hits[0] < cutoff:
                hits.popleft()
            if len(hits) >= self.limit:
                return False
            hits.append(now)
            return True


def _error(status_code: int, code: str, message: str, request_id: str) -> JSONResponse:
    return JSONResponse(
        status_code=status_code,
        content={
            "error": {
                "code": code,
                "message": message,
                "request_id": request_id,
            }
        },
    )


def install_security_middleware(app, settings: Settings) -> None:
    limiter = RateLimiter(settings.rate_limit_requests, settings.rate_limit_window_seconds)
    repository = ReconciliationRepository(
        settings.database_url, auto_create_schema=settings.app_env.casefold() != "production"
    )

    @app.middleware("http")
    async def security_middleware(
        request: Request,
        call_next: Callable[[Request], Awaitable[Response]],
    ) -> Response:
        supplied_request_id = request.headers.get("x-request-id", "")
        request_id = (
            supplied_request_id
            if re.fullmatch(r"[A-Za-z0-9._:-]{1,80}", supplied_request_id)
            else secrets.token_hex(12)
        )
        request.state.request_id = request_id
        request.state.user = user_from_token(repository, request.cookies.get(SESSION_COOKIE))

        def secure(response: Response) -> Response:
            response.headers["X-Request-ID"] = request_id
            response.headers["X-Content-Type-Options"] = "nosniff"
            response.headers["X-Frame-Options"] = "DENY"
            response.headers["Referrer-Policy"] = "no-referrer"
            response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
            response.headers["Cache-Control"] = "no-store"
            if settings.app_env.casefold() == "production":
                response.headers["Strict-Transport-Security"] = (
                    "max-age=31536000; includeSubDomains"
                )
            return response

        client = request.client.host if request.client else "unknown"
        if request.url.path.startswith("/api/") and not await limiter.allow(client):
            return secure(
                _error(
                    429,
                    "RATE_LIMITED",
                    "Too many requests. Try again shortly.",
                    request_id,
                )
            )

        if settings.app_api_key and request.url.path.startswith("/api/"):
            supplied = request.headers.get("x-api-key", "")
            if not secrets.compare_digest(supplied, settings.app_api_key):
                return secure(
                    _error(401, "UNAUTHORIZED", "Missing or invalid API key.", request_id)
                )

        unsafe_method = request.method.upper() in {"POST", "PUT", "PATCH", "DELETE"}
        origin = request.headers.get("origin")
        if unsafe_method and origin and origin not in settings.cors_origins:
            return secure(
                _error(
                    403,
                    "CSRF_ORIGIN_REJECTED",
                    "The request origin is not allowed.",
                    request_id,
                )
            )

        response = await call_next(request)
        return secure(response)
