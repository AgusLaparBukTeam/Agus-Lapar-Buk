from __future__ import annotations

import hashlib
import io
import re
from dataclasses import dataclass
from pathlib import Path

from fastapi import UploadFile
from PIL import Image, UnidentifiedImageError

from app.core.errors import InvalidUploadError

SUPPORTED = {
    ".pdf": {"application/pdf"},
    ".png": {"image/png"},
    ".jpg": {"image/jpeg"},
    ".jpeg": {"image/jpeg"},
}


@dataclass(frozen=True)
class SafeUpload:
    filename: str
    extension: str
    media_type: str
    data: bytes
    sha256: str


def sanitize_filename(filename: str | None) -> str:
    name = Path(filename or "document").name
    safe = re.sub(r"[^A-Za-z0-9._-]+", "_", name).strip("._")
    return safe[:120] or "document"


def sniff_media_type(data: bytes) -> str | None:
    if data.startswith(b"%PDF-"):
        return "application/pdf"
    if data.startswith(b"\x89PNG\r\n\x1a\n"):
        return "image/png"
    if data.startswith(b"\xff\xd8\xff"):
        return "image/jpeg"
    return None


def _validate_image_dimensions(data: bytes, max_image_pixels: int) -> None:
    try:
        with Image.open(io.BytesIO(data)) as image:
            width, height = image.size
    except (UnidentifiedImageError, OSError, ValueError) as exc:
        raise InvalidUploadError("The image could not be decoded safely.") from exc

    if width < 1 or height < 1:
        raise InvalidUploadError("Image dimensions are invalid.")
    if width * height > max_image_pixels:
        raise InvalidUploadError(
            f"Image dimensions exceed the {max_image_pixels:,}-pixel safety limit."
        )


async def validate_upload(
    upload: UploadFile,
    max_bytes: int,
    max_image_pixels: int = 40_000_000,
) -> SafeUpload:
    filename = sanitize_filename(upload.filename)
    extension = Path(filename).suffix.lower()
    if extension not in SUPPORTED:
        raise InvalidUploadError("Only PDF, PNG, JPG, and JPEG files are supported.")

    data = await upload.read(max_bytes + 1)
    if not data:
        raise InvalidUploadError("Uploaded file is empty.")
    if len(data) > max_bytes:
        raise InvalidUploadError(f"File exceeds the {max_bytes // (1024 * 1024)} MB limit.")

    detected = sniff_media_type(data)
    if not detected:
        raise InvalidUploadError("File signature does not match a supported document type.")
    if detected not in SUPPORTED[extension]:
        raise InvalidUploadError("File extension and content signature do not match.")

    declared = (upload.content_type or "").split(";")[0].strip().lower()
    if declared and declared not in SUPPORTED[extension] and declared != "application/octet-stream":
        raise InvalidUploadError("Declared MIME type does not match the uploaded file.")

    if detected.startswith("image/"):
        _validate_image_dimensions(data, max_image_pixels)

    return SafeUpload(
        filename=filename,
        extension=extension,
        media_type=detected,
        data=data,
        sha256=hashlib.sha256(data).hexdigest(),
    )


def ensure_distinct_uploads(uploads: dict[object, SafeUpload]) -> None:
    """Reject the same binary document submitted into multiple required slots."""
    seen: dict[str, str] = {}
    for doc_type, upload in uploads.items():
        label = getattr(doc_type, "value", str(doc_type))
        previous = seen.get(upload.sha256)
        if previous is not None:
            raise InvalidUploadError(
                f"The same file was submitted as both {previous} and {label}. "
                "Upload three distinct shipment documents."
            )
        seen[upload.sha256] = label
