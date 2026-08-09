from decimal import Decimal

from app.domain.normalization import (
    normalize_address,
    normalize_company,
    normalize_sku,
    parse_number,
)


def test_normalization_is_conservative():
    assert normalize_company("PT. Maju Jaya Tbk") == "maju jaya"
    assert normalize_sku("SKU-001 / A") == "SKU-001/A"
    assert normalize_address("Jl. Merdeka No. 10, Bandung") == "jalan merdeka 10 bandung"
    assert parse_number("18.000") == Decimal("18000")
    assert parse_number("18,5") == Decimal("18.5")


def test_sku_normalization_does_not_erase_meaningful_separators():
    assert normalize_sku("ABC-12") != normalize_sku("ABC12")
    assert normalize_sku(" sku-001 / a ") == "SKU-001/A"


def test_parse_number_rejects_non_finite_and_implausible_values():
    assert parse_number(float("inf")) is None
    assert parse_number("1e999") is None
    assert parse_number("999999999999999999999999999999999999999") is None
