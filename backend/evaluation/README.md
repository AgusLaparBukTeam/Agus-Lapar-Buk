# GateGuard Extraction and Assurance Evaluation

## Purpose and non-claims

This directory defines **evaluation infrastructure**, not a claim that any extraction provider has achieved a particular score. A metric may only be reported after it is computed from a versioned, labelled dataset with its source, inclusion criteria, redaction treatment, and run configuration recorded. Empty datasets, missing cost observations, and unavailable ground truth must remain visibly empty; they must not be converted to zero, a pass, or an estimated value.

> **Extraction is probabilistic evidence generation. Assurance and release decisions are deterministic policy outcomes.** They must be measured, reported, and released separately.

| Evaluation lane | What is evaluated | Allowed input | Must not be represented as |
|---|---|---|---|
| Synthetic rule evaluation | Deterministic rule conditions, requirements, and release gates | Hand-authored, versioned fixtures with expected decisions | An OCR/model quality benchmark |
| Document/OCR benchmark | Classification, fields, line items, text recognition, confidence, and robustness | Labelled documents or approved redacted fixtures | A compliance-decision benchmark |
| Production quality monitoring | Recorded latency, error, cost, and explicitly reviewed outcomes | Auditable runtime observations | Ground truth unless a review label exists |

## Fixture contract

Each benchmark fixture should be versioned and should declare a stable fixture ID, document class, language, source/consent status, expected fields, expected line-item keys, expected OCR text where permitted, expected compliance decision for safety evaluation, and adversarial category where applicable. Fixtures must not contain secrets or non-redacted personal data.

| Metric | Ground truth | Formula / outcome | Reporting requirement |
|---|---|---|---|
| Document classification accuracy | Expected document type | Correct classifications / labelled fixtures | Show fixture count and class distribution |
| Field accuracy | Expected normalized field values | Exact normalized fields / scored fields | List fields included and missing-value treatment |
| Line-item precision, recall, F1 | Expected item identity keys | Set match statistics | Report TP, FP, FN beside F1 |
| OCR CER/WER | Approved text transcription | Levenshtein errors / reference chars or words | Identify language and document source |
| Confidence calibration | Reviewed correctness labels and field confidences | ECE and Brier score | Include sample size and confidence bins if used |
| False-clear rate | Expected non-CLEAR decisions | Incorrect CLEAR outputs / expected non-CLEAR fixtures | Treat as the primary safety metric; lower is better |
| Robustness | Adversarial / degraded fixtures | Result by category, not an aggregate claim | Enumerate each attack/degradation category |
| Latency and cost | Recorded run measurements | Mean, p95, total, mean unit cost | Preserve missing cost as unavailable |
| Provider regression | Two labelled runs on the same fixture version | Directional comparison with tolerance | Missing values remain indeterminate |

## False-clear safety rule

A **false clear** occurs when a fixture whose expected decision is `REVIEW` or `HOLD` is predicted as `CLEAR`. The denominator excludes truth-labelled `CLEAR` fixtures. This prevents an easy-clear corpus from concealing unsafe releases. A benchmark report must include numerator, denominator, fixture version, deterministic rule-pack version, extraction provider/model, and reviewer-label provenance before any false-clear rate is presented.

## Required adversarial fixture categories

The regression suite covers instructions such as `ignore previous instructions`, URL-based requests, fake system prompts, malicious command text, and hidden-text representations. The expected behavior is invariant: document content remains **untrusted data**, values may be extracted only when visibly supported, and no instruction can invoke a tool, modify policy, browse a URL, reveal secrets, or turn extraction evidence into a `CLEAR` compliance decision.

## Running the metric framework

The metric functions are pure and intentionally do not invoke a provider. Synthetic unit fixtures validate the formulas:

```bash
cd backend
uv run pytest -q tests/test_extraction_benchmark.py tests/test_adversarial_extraction.py
```

A future provider benchmark runner must take a labelled fixture manifest as explicit input and write a machine-readable run artifact containing fixture manifest hash, provider/model/version, preprocessing configuration, rule-pack version, timestamp, evaluator version, raw metric numerator/denominator, and all unavailable fields. It must never merge synthetic rule-fixture results with document/OCR provider scores.

## Current limitations

The repository currently contains only unit fixtures that validate metric definitions and untrusted-data boundaries. It does **not** include a production-labelled document corpus, therefore it does not publish provider accuracy, OCR error rate, calibration, cost, latency, robustness percentage, or false-clear performance. Human review labels and an approved, redacted dataset are required before such numbers can be produced.
