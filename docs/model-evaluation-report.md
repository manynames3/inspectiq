# Model Evaluation Report

Last updated: July 10, 2026

InspectIQ evaluates vision providers through the same `VisionOutputSchema` used by the image worker and reviewer workflow. The checked-in suite is a promotion gate, not a claim of production automotive model accuracy.

## Corpus

| Field | Value |
| --- | --- |
| Evaluation set | `inspectiq-rights-cleared-vision-challenge-v2` |
| Independent source images | 12 |
| Pixel-distinct image instances | 108 |
| Variants per source | 9 |
| Rights status | Rights-cleared local evidence |
| Coverage | Eight required angles, readable/partial OCR, damage positives, clean controls, blur, darkness, rotation, compression, resize, and occlusion |

Each source is rendered as baseline, JPEG-compressed, resized, mildly darkened, mildly brightened, rotated, heavily blurred, low-light, and occluded variants. This gives 108 actual image inputs while honestly preserving the independent-source count.

## Fresh Deterministic Run

Command:

```bash
npm run eval:vision
```

| Field | Value |
| --- | --- |
| Provider | `localVisionProvider` |
| Model | `deterministic-local-v2` |
| Prompt version | `photo-analysis-v2` |
| Mode | `deterministic-contract-ci` |
| Result | Pass |
| Token usage / estimated cost | 0 / $0 |

| Metric | Promotion gate | Current deterministic result |
| --- | ---: | ---: |
| Schema-valid responses | 100% | 100% |
| Macro angle accuracy | >= 90% | 100% |
| Minimum per-angle accuracy | >= 85% | 100% |
| Normalized VIN/odometer accuracy on readable evidence | >= 95% | 100% |
| Damage precision | >= 90% | 100% |
| Damage recall | >= 80% | 100% |
| Damage type/severity accuracy | >= 85% | 100% |
| Retake precision | >= 90% | 100% |
| Retake recall | >= 90% | 100% |

These values prove that the deterministic provider, dataset expansion, scoring code, and schema gates agree. They do **not** measure Bedrock accuracy because the local provider is intentionally keyed to controlled fixtures.

## Real Bedrock Promotion Run

The manually approved `Bedrock Model Promotion Evaluation` GitHub Actions workflow runs all 108 images with fallback disabled and writes provider/model/prompt, latency, input/output tokens, estimated cost, schema failures, and per-case outcomes to an artifact.

```bash
AWS_REGION=us-east-1 \
VISION_PROVIDER=bedrock \
BEDROCK_VISION_FALLBACK=fail \
VISION_EVAL_OUTPUT=output/model-evaluation/bedrock-report.json \
npm run eval:vision
```

No Bedrock accuracy numbers are asserted in this document until that workflow produces a passing artifact for the exact model and prompt version under review.

## Verified Bedrock Damage Spot Check

A deployed, no-fallback spot check used the CC0 Skoda Roomster source documented in `sample-data/IMAGE_CREDITS.md`. The exact VIN, mileage, and model year are not available from the source and are therefore not asserted.

| Field | Observed result |
| --- | --- |
| Provider / model | `bedrockVisionProvider` / `us.anthropic.claude-sonnet-4-6` |
| Prompt / schema | `photo-analysis-v2` / valid |
| Fallback | No |
| Visible candidate | Moderate dent, rear bumper lower centre/passenger-side corner |
| Confidence | 91% |
| Raw model repair range | $150-$450, retained for audit |
| Validated policy range | $500-$1,200 for a moderate dent |
| Latency / estimated model cost | 6.467 s / $0.012195 |
| Human review | Accepted after visual comparison with the source image |
| Live inspection | `444ba70f-330c-4333-9461-7365bad6da5f` |

This proves that an uploaded S3 image can pass through SQS, the Lambda worker, Bedrock, schema validation, reviewer acceptance, and damage materialization. It is one traceable workflow proof, not a statistical accuracy claim.

## Known Limits

- Twelve independent sources are not statistically representative of auction/offsite traffic.
- Synthetic transforms approximate capture failure modes but do not replace distinct field images from multiple devices, operators, locations, vehicle classes, paint finishes, and weather conditions.
- Damage labels need independent adjudication, severity guidelines, and inter-rater agreement before buyer-dispute use.
- OCR needs more dirty displays, partial VINs, glare, digital/analog odometers, and nonstandard instrument clusters.
- Reviewer override rates and calibration drift require production sampling over time.

## Promotion Policy

A model/prompt version may be considered for advisory rollout only when it passes every checked-in gate with fallback disabled, records its cost/latency metadata, and has no schema-invalid response. Buyer-visible facts still require reviewer acceptance, and production promotion additionally requires a larger independently labeled field corpus, security review, cost approval, and rollback criteria.
