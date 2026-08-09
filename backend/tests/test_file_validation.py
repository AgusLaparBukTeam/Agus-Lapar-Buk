import asyncio
import io

import pytest
from fastapi import UploadFile
from starlette.datastructures import Headers

from app.core.errors import InvalidUploadError
from app.services.file_validation import sanitize_filename, validate_upload


def test_rejects_extension_signature_mismatch():
    upload = UploadFile(
        file=io.BytesIO(b"%PDF-1.4 fake"),
        filename="evil.png",
        headers=Headers({"content-type": "image/png"}),
    )
    with pytest.raises(InvalidUploadError):
        asyncio.run(validate_upload(upload, 1024))


def test_filename_sanitization_strips_paths_and_controls():
    assert sanitize_filename("../../secret invoice?.pdf") == "secret_invoice_.pdf"
