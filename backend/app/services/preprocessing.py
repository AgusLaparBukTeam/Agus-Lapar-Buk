"""Conservative image preprocessing for shipment-document extraction.

The original upload is never altered. The returned bytes are a separate normalized
artifact that can be supplied to OCR or multimodal extraction while the original remains
available for audit and review.
"""

from __future__ import annotations

import hashlib
import io
from dataclasses import dataclass

import cv2
import numpy as np
from PIL import Image

from app.core.errors import ExtractionUnavailableError
from app.services.file_validation import SafeUpload


@dataclass(frozen=True)
class PreprocessingResult:
    """The separately encoded extraction artifact and operations applied to it."""

    data: bytes
    applied: bool
    operations: tuple[str, ...]


def _decode(data: bytes) -> np.ndarray:
    image = cv2.imdecode(np.frombuffer(data, dtype=np.uint8), cv2.IMREAD_COLOR)
    if image is None:
        raise ExtractionUnavailableError("The image could not be prepared for extraction.")
    return image


def _document_bounds(image: np.ndarray) -> tuple[int, int, int, int] | None:
    """Return a conservative document region when a large page-like contour is present."""

    height, width = image.shape[:2]
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    edges = cv2.Canny(cv2.GaussianBlur(gray, (5, 5), 0), 40, 120)
    contours, _ = cv2.findContours(edges, cv2.RETR_LIST, cv2.CHAIN_APPROX_SIMPLE)
    minimum_area = height * width * 0.20
    candidates: list[tuple[float, tuple[int, int, int, int]]] = []
    for contour in contours:
        area = cv2.contourArea(contour)
        if area < minimum_area:
            continue
        x, y, box_width, box_height = cv2.boundingRect(contour)
        if box_width < width * 0.45 or box_height < height * 0.45:
            continue
        candidates.append((area, (x, y, box_width, box_height)))
    return max(candidates, default=(0.0, None), key=lambda item: item[0])[1]


def _deskew(image: np.ndarray) -> tuple[np.ndarray, bool]:
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    coordinates = np.column_stack(np.where(cv2.bitwise_not(gray) > 20))
    if len(coordinates) < 100:
        return image, False
    angle = cv2.minAreaRect(coordinates.astype(np.float32))[-1]
    angle = -(90 + angle) if angle < -45 else -angle
    if abs(angle) < 0.25 or abs(angle) > 12:
        return image, False
    height, width = image.shape[:2]
    matrix = cv2.getRotationMatrix2D((width / 2, height / 2), angle, 1.0)
    return (
        cv2.warpAffine(
            image,
            matrix,
            (width, height),
            flags=cv2.INTER_CUBIC,
            borderMode=cv2.BORDER_REPLICATE,
        ),
        True,
    )


def preprocess_image_bytes(data: bytes, media_type: str) -> PreprocessingResult:
    """Crop background, deskew, normalize contrast, and lightly denoise an image."""

    if media_type not in {"image/jpeg", "image/png"}:
        return PreprocessingResult(data=data, applied=False, operations=())

    image = _decode(data)
    original_height, original_width = image.shape[:2]
    operations: list[str] = []
    bounds = _document_bounds(image)
    if bounds is not None:
        x, y, width, height = bounds
        margin_x = max(2, int(width * 0.015))
        margin_y = max(2, int(height * 0.015))
        x0, y0 = max(0, x - margin_x), max(0, y - margin_y)
        x1 = min(original_width, x + width + margin_x)
        y1 = min(original_height, y + height + margin_y)
        cropped = image[y0:y1, x0:x1]
        if cropped.size:
            image = cv2.resize(
                cropped,
                (original_width, original_height),
                interpolation=cv2.INTER_CUBIC,
            )
            operations.append("document_crop")

    image, deskewed = _deskew(image)
    if deskewed:
        operations.append("deskew")

    lab = cv2.cvtColor(image, cv2.COLOR_BGR2LAB)
    luminance, a_channel, b_channel = cv2.split(lab)
    enhanced_luminance = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8)).apply(luminance)
    image = cv2.cvtColor(cv2.merge((enhanced_luminance, a_channel, b_channel)), cv2.COLOR_LAB2BGR)
    operations.append("clahe_contrast")
    image = cv2.fastNlMeansDenoisingColored(image, None, 3, 3, 7, 21)
    operations.append("light_denoise")

    extension = ".png" if media_type == "image/png" else ".jpg"
    ok, encoded = cv2.imencode(extension, image, [cv2.IMWRITE_JPEG_QUALITY, 95])
    if not ok:
        raise ExtractionUnavailableError("The preprocessed image could not be encoded safely.")
    output = encoded.tobytes()
    with Image.open(io.BytesIO(output)) as check:
        check.verify()
    return PreprocessingResult(data=output, applied=True, operations=tuple(operations))


def preprocess_upload(upload: SafeUpload) -> tuple[SafeUpload, PreprocessingResult]:
    """Return an extraction-only upload while retaining the original upload unchanged."""

    result = preprocess_image_bytes(upload.data, upload.media_type)
    if not result.applied:
        return upload, result
    artifact = SafeUpload(
        filename=upload.filename,
        extension=upload.extension,
        media_type=upload.media_type,
        data=result.data,
        sha256=hashlib.sha256(result.data).hexdigest(),
    )
    return artifact, result
