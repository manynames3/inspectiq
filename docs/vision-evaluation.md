# Vision Evaluation

InspectIQ treats image analysis as a contract that must be measurable before model or prompt changes are promoted.

## Command

```bash
npm run eval:vision
AWS_REGION=us-east-1 VISION_PROVIDER=bedrock BEDROCK_VISION_FALLBACK=fail npm run eval:vision
```

The default command uses the deterministic local provider so CI can run without model credentials. Setting `VISION_PROVIDER=bedrock` runs the same cases against the Bedrock multimodal adapter.

## Dataset

`evals/vision-eval-set.json` covers:

- required-angle classification for front, rear, side, interior, engine bay, odometer, and VIN plate photos;
- damage-positive cases for rear bumper dent and driver-side scratch;
- damage-negative cases to catch false positives on clean angles;
- OCR checks for generated odometer and VIN fixtures that contain the expected text;
- retake policy for blurry capture, glare, low-light interiors, bad side angles, partial VIN plates, and dirty odometer views;
- auction-lane/front-angle cases that should not create false damage findings.

## Metrics

- `angleAccuracy`: correct required-angle classification.
- `ocrAccuracy`: exact-match VIN/odometer extraction across OCR cases.
- `damageRecall`: expected material damage findings detected.
- `damageTypeAccuracy`: damage type and severity match for typed damage cases.
- `damageFalsePositiveRate`: clean cases incorrectly producing damage candidates.
- `retakePrecision`: predicted retakes that truly need retake.
- `retakeRecall`: expected retakes caught by the provider.

## Promotion Standard

The repo thresholds are intentionally simple and visible:

- angle accuracy: `>= 0.90`
- OCR accuracy: `>= 0.90`
- damage recall: `>= 0.90`
- damage type accuracy: `>= 0.85`
- damage false-positive rate: `<= 0.10`
- retake precision: `>= 0.80`
- retake recall: `>= 0.80`

For a production launch, this set should be expanded with labeled auction/offsite images by vehicle class, lighting, capture device, damage type, severity, and seller disclosure scenario. The important engineering shape is already present: every provider must pass the same schema and the same evaluation command before its output can create reviewer-facing suggestions.
