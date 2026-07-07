# Model Evaluation Report

Last updated: July 5, 2026

InspectIQ treats vehicle image analysis as a measurable contract, not a black-box feature. The evaluation command runs the same `VisionOutputSchema` contract used by the API and reviewer workflow.

## Current Run

Command:

```bash
npm run eval:vision
```

Provider tested:

| Field | Value |
| --- | --- |
| Eval set | `inspectiq-vision-contract-v1` |
| Provider | `localVisionProvider` |
| Prompt version | `photo-analysis-v2` |
| Dataset size | 24 labeled cases |
| Result | Pass |

## Metrics

| Metric | Threshold | Current |
| --- | ---: | ---: |
| Angle accuracy | >= 0.90 | 1.00 |
| OCR accuracy | >= 0.90 | 1.00 |
| Damage recall | >= 0.90 | 1.00 |
| Damage type accuracy | >= 0.85 | 1.00 |
| Damage false-positive rate | <= 0.10 | 0.00 |
| Retake precision | >= 0.80 | 1.00 |
| Retake recall | >= 0.80 | 1.00 |

## Dataset Coverage

The current set covers:

- Required photo-angle classification: front, rear, driver/passenger side, interior, engine bay, odometer, and VIN plate.
- Damage-positive cases: rear bumper dent and driver-side scratch.
- Damage-negative cases: clean front, passenger side, interior, engine bay, and auction-lane front images.
- OCR cases: odometer and VIN plate extraction.
- Retake cases: blur, glare, bad side angle, dark interior, partial VIN plate, and dirty odometer.

## Known Failure Cases To Keep Expanding

The next production-quality dataset should add more real-world auction/offsite conditions:

- Wet vehicles, reflective paint, chrome glare, and harsh sun.
- Motion blur from mobile/offsite capture.
- Dirty odometers and partially occluded VIN plates.
- Dark interiors, night captures, and tinted glass.
- Cropped bumper corners and partial side panels.
- Auction-lane background clutter and adjacent vehicles.
- Damage that is cosmetic but near arbitration-sensitive locations.

## Promotion Standard

A model or prompt version should not be promoted unless it:

- passes the thresholds above on the checked-in suite;
- passes a larger source-documented real-photo corpus;
- stores provider, prompt version, confidence, raw output, validated output, and schema failures;
- keeps all AI output advisory until a reviewer accepts, edits, or rejects it;
- avoids leaking schema/internal payloads into buyer-visible reports.

## Honest Boundary

The default local evaluation uses a deterministic provider so CI and interviews do not depend on model credentials or provider latency. The deployed production-shaped path uses Bedrock through the same schema contract. A true production launch would require a larger labeled corpus, confidence calibration, regression tracking by model version, and periodic sampling of reviewer overrides.
