"""Dataset-agnostic metrics for GateGuard evaluation.

This module computes metrics only from labelled fixtures or recorded benchmark observations.
It intentionally contains no claimed performance numbers and never invokes providers.
"""

from __future__ import annotations

from collections.abc import Iterable, Mapping, Sequence
from dataclasses import dataclass
from statistics import mean


@dataclass(frozen=True)
class RatioMetric:
    numerator: int
    denominator: int

    @property
    def value(self) -> float | None:
        return self.numerator / self.denominator if self.denominator else None


@dataclass(frozen=True)
class PrecisionRecallF1:
    precision: float | None
    recall: float | None
    f1: float | None
    true_positive: int
    false_positive: int
    false_negative: int


@dataclass(frozen=True)
class OcrErrorRate:
    distance: int
    reference_units: int

    @property
    def value(self) -> float | None:
        return self.distance / self.reference_units if self.reference_units else None


@dataclass(frozen=True)
class CalibrationResult:
    expected_calibration_error: float | None
    brier_score: float | None
    observations: int


@dataclass(frozen=True)
class TimingCostSummary:
    observations: int
    mean_latency_ms: float | None
    p95_latency_ms: float | None
    total_cost_usd: float | None
    mean_cost_usd: float | None


def _normalise(value: object) -> str:
    return " ".join(str(value or "").casefold().split())


def classification_accuracy(expected: Sequence[str], predicted: Sequence[str]) -> RatioMetric:
    if len(expected) != len(predicted):
        raise ValueError("expected and predicted classification lists must have equal length")
    return RatioMetric(
        numerator=sum(
            _normalise(a) == _normalise(b) for a, b in zip(expected, predicted, strict=True)
        ),
        denominator=len(expected),
    )


def field_accuracy(
    expected: Mapping[str, object], predicted: Mapping[str, object], fields: Iterable[str]
) -> RatioMetric:
    selected = list(fields)
    return RatioMetric(
        numerator=sum(
            _normalise(expected.get(field)) == _normalise(predicted.get(field))
            for field in selected
        ),
        denominator=len(selected),
    )


def line_item_prf(
    expected_keys: Iterable[object], predicted_keys: Iterable[object]
) -> PrecisionRecallF1:
    expected = {_normalise(item) for item in expected_keys if _normalise(item)}
    predicted = {_normalise(item) for item in predicted_keys if _normalise(item)}
    true_positive = len(expected & predicted)
    false_positive = len(predicted - expected)
    false_negative = len(expected - predicted)
    precision = true_positive / (true_positive + false_positive) if predicted else None
    recall = true_positive / (true_positive + false_negative) if expected else None
    f1 = (
        (2 * precision * recall / (precision + recall))
        if precision is not None and recall is not None and precision + recall
        else None
    )
    return PrecisionRecallF1(precision, recall, f1, true_positive, false_positive, false_negative)


def _levenshtein(expected: Sequence[str], predicted: Sequence[str]) -> int:
    previous = list(range(len(predicted) + 1))
    for index, expected_unit in enumerate(expected, start=1):
        current = [index]
        for other_index, predicted_unit in enumerate(predicted, start=1):
            current.append(
                min(
                    current[-1] + 1,
                    previous[other_index] + 1,
                    previous[other_index - 1] + (expected_unit != predicted_unit),
                )
            )
        previous = current
    return previous[-1]


def character_error_rate(expected: str, predicted: str) -> OcrErrorRate:
    reference = list(expected)
    return OcrErrorRate(_levenshtein(reference, list(predicted)), len(reference))


def word_error_rate(expected: str, predicted: str) -> OcrErrorRate:
    reference = _normalise(expected).split()
    return OcrErrorRate(_levenshtein(reference, _normalise(predicted).split()), len(reference))


def confidence_calibration(
    confidences: Sequence[float], correct: Sequence[bool]
) -> CalibrationResult:
    if len(confidences) != len(correct):
        raise ValueError("confidence and correctness lists must have equal length")
    if not confidences:
        return CalibrationResult(None, None, 0)
    if any(value < 0 or value > 1 for value in confidences):
        raise ValueError("confidence values must be in [0, 1]")
    # Per-observation ECE equals mean absolute calibration gap; callers may additionally
    # bucket fixtures for reporting without discarding granular data.
    actual = [1.0 if value else 0.0 for value in correct]
    ece = mean(
        abs(confidence - outcome) for confidence, outcome in zip(confidences, actual, strict=True)
    )
    brier = mean(
        (confidence - outcome) ** 2 for confidence, outcome in zip(confidences, actual, strict=True)
    )
    return CalibrationResult(ece, brier, len(confidences))


def false_clear_rate(
    expected_decisions: Sequence[str], predicted_decisions: Sequence[str]
) -> RatioMetric:
    """Measure unsafe clear decisions among fixtures whose labelled decision is not CLEAR.

    A lower rate is safer. The denominator excludes truth-labelled CLEAR cases so a large
    easy-clear corpus cannot hide failures that released REVIEW/HOLD fixtures.
    """
    if len(expected_decisions) != len(predicted_decisions):
        raise ValueError("expected and predicted decision lists must have equal length")
    unsafe_cases = [
        (expected, predicted)
        for expected, predicted in zip(expected_decisions, predicted_decisions, strict=True)
        if _normalise(expected) != "clear"
    ]
    return RatioMetric(
        numerator=sum(_normalise(predicted) == "clear" for _, predicted in unsafe_cases),
        denominator=len(unsafe_cases),
    )


def latency_cost_summary(observations: Sequence[tuple[float, float | None]]) -> TimingCostSummary:
    if not observations:
        return TimingCostSummary(0, None, None, None, None)
    latencies = sorted(latency for latency, _ in observations)
    p95_index = max(0, min(len(latencies) - 1, round(0.95 * len(latencies)) - 1))
    costs = [cost for _, cost in observations if cost is not None]
    total_cost = sum(costs) if costs else None
    return TimingCostSummary(
        observations=len(observations),
        mean_latency_ms=mean(latencies),
        p95_latency_ms=latencies[p95_index],
        total_cost_usd=total_cost,
        mean_cost_usd=mean(costs) if costs else None,
    )


def provider_regression(
    baseline: Mapping[str, float | None],
    candidate: Mapping[str, float | None],
    tolerance: float = 0.0,
) -> dict[str, bool | None]:
    """Return directional regression flags for metrics supplied by labelled benchmark runs.

    Accuracy-like values (`accuracy`, `f1`, `recall`, `precision`) regress when lower.
    Safety/cost/error values (`false_clear_rate`, `cer`, `wer`, `latency`, `cost`) regress
    when higher. Missing metrics stay `None`; this function never infers a pass.
    """
    lower_is_better = {"false_clear_rate", "cer", "wer", "latency", "cost"}
    result: dict[str, bool | None] = {}
    for key in set(baseline) | set(candidate):
        before, after = baseline.get(key), candidate.get(key)
        if before is None or after is None:
            result[key] = None
        elif key in lower_is_better:
            result[key] = after > before + tolerance
        else:
            result[key] = after < before - tolerance
    return result
