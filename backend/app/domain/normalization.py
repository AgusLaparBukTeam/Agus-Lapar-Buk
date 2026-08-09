from __future__ import annotations

import re
import unicodedata
from decimal import Decimal, InvalidOperation

LEGAL_ENTITY_TOKENS = {"pt", "cv", "tbk", "persero"}
MAX_ABS_NUMERIC = Decimal("1e24")


def normalize_text(value: str | None) -> str:
    if not value:
        return ""
    normalized = unicodedata.normalize("NFKC", value).casefold()
    normalized = re.sub(r"[^\w\s]", " ", normalized, flags=re.UNICODE)
    return " ".join(normalized.split())


def normalize_company(value: str | None) -> str:
    tokens = normalize_text(value).split()
    return " ".join(token for token in tokens if token not in LEGAL_ENTITY_TOKENS)


def normalize_sku(value: str | None) -> str:
    if not value:
        return ""
    normalized = unicodedata.normalize("NFKC", value).upper().strip()
    # Preserve SKU separators because punctuation can be semantically meaningful in
    # customer master data. Only normalize whitespace around common separators.
    normalized = re.sub(r"\s*([._/-])\s*", r"\1", normalized)
    return " ".join(normalized.split())


def normalize_address(value: str | None) -> str:
    text = normalize_text(value)
    replacements = {
        r"\bjln?\b": "jalan",
        r"\bjl\b": "jalan",
        r"\bno\b": "",
        r"\bkab\b": "kabupaten",
    }
    for pattern, replacement in replacements.items():
        text = re.sub(pattern, replacement, text)
    return " ".join(text.split())


def parse_number(value: str | int | float | None) -> Decimal | None:
    if value is None:
        return None
    if isinstance(value, (int, float)):
        try:
            number = Decimal(str(value))
        except InvalidOperation:
            return None
        if not number.is_finite() or abs(number) > MAX_ABS_NUMERIC:
            return None
        return number
    raw = value.strip().replace("Rp", "").replace("rp", "").replace(" ", "")
    # Indonesian thousands / decimal convention and common machine format.
    if re.fullmatch(r"-?\d{1,3}(\.\d{3})+(,\d+)?", raw):
        raw = raw.replace(".", "").replace(",", ".")
    elif re.fullmatch(r"-?\d{1,3}(,\d{3})+(\.\d+)?", raw):
        raw = raw.replace(",", "")
    else:
        raw = raw.replace(",", ".")
    try:
        number = Decimal(raw)
    except InvalidOperation:
        return None
    if not number.is_finite() or abs(number) > MAX_ABS_NUMERIC:
        return None
    return number
