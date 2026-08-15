from app.evaluation.extraction_metrics import (
    character_error_rate,
    classification_accuracy,
    confidence_calibration,
    false_clear_rate,
    field_accuracy,
    latency_cost_summary,
    line_item_prf,
    provider_regression,
    word_error_rate,
)


def test_synthetic_fixture_metrics_have_explicit_denominators():
    # These are unit fixtures for metric math, not a claim about any provider.
    assert classification_accuracy(["invoice", "packing_list"], ["invoice", "invoice"]).value == 0.5
    assert (
        field_accuracy(
            {"document_id": "INV-1", "recipient": "PT A"},
            {"document_id": "INV-1", "recipient": "PT B"},
            ["document_id", "recipient"],
        ).value
        == 0.5
    )

    items = line_item_prf(["SKU-1", "SKU-2"], ["SKU-1", "SKU-3"])
    assert (items.true_positive, items.false_positive, items.false_negative) == (1, 1, 1)
    assert items.precision == 0.5
    assert items.recall == 0.5
    assert items.f1 == 0.5


def test_ocr_and_calibration_metrics_are_label_driven():
    assert character_error_rate("ABC", "ADC").value == 1 / 3
    assert word_error_rate("surat jalan nomor satu", "surat jalan satu").value == 1 / 4
    calibration = confidence_calibration([0.9, 0.2], [True, False])
    assert calibration.observations == 2
    assert calibration.expected_calibration_error == 0.15
    assert calibration.brier_score == 0.025


def test_false_clear_rate_excludes_truth_labelled_clear_cases():
    result = false_clear_rate(
        ["CLEAR", "REVIEW", "HOLD", "REVIEW"],
        ["CLEAR", "CLEAR", "HOLD", "REVIEW"],
    )
    assert result.numerator == 1
    assert result.denominator == 3
    assert result.value == 1 / 3


def test_provider_regression_has_no_implicit_pass_for_missing_values():
    flags = provider_regression(
        {"field_accuracy": 0.9, "false_clear_rate": 0.01, "cost": 0.02},
        {"field_accuracy": 0.88, "false_clear_rate": 0.02, "cost": None},
    )
    assert flags == {"field_accuracy": True, "false_clear_rate": True, "cost": None}


def test_latency_and_cost_summary_only_aggregates_recorded_observations():
    summary = latency_cost_summary([(100.0, 0.01), (300.0, None), (200.0, 0.03)])
    assert summary.observations == 3
    assert summary.mean_latency_ms == 200.0
    assert summary.total_cost_usd == 0.04
    assert summary.mean_cost_usd == 0.02
