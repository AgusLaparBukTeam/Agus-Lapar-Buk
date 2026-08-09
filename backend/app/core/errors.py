class GateGuardError(Exception):
    code = "GATEGUARD_ERROR"
    status_code = 400

    def __init__(self, message: str, *, code: str | None = None, status_code: int | None = None):
        super().__init__(message)
        self.safe_message = message
        if code:
            self.code = code
        if status_code:
            self.status_code = status_code


class InvalidUploadError(GateGuardError):
    code = "INVALID_UPLOAD"
    status_code = 422


class ExtractionUnavailableError(GateGuardError):
    code = "EXTRACTION_UNAVAILABLE"
    status_code = 503


class ProviderError(GateGuardError):
    code = "PROVIDER_ERROR"
    status_code = 502


class NotFoundError(GateGuardError):
    code = "NOT_FOUND"
    status_code = 404
