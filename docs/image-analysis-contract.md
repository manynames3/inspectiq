# Image Analysis Contract

## Purpose

Image analysis is advisory evidence triage. It helps reviewers find missing angles, quality problems, damage candidates, and OCR values faster, but it does not directly change condition report facts until a human accepts or edits the suggestion.

The example payload below is a real Bedrock result from the CC0 Skoda Roomster damage fixture, not a VIN-specific listing. The source does not provide a VIN, mileage, or exact model year, so those facts must remain unverified. Reference-manifest mappings bypass model claims: they carry source/checklist provenance, no model confidence presentation, no metadata-derived OCR, and no pre-confirmed damage.

## Provider Contract

Providers:

- Provider: `localVisionProvider`
- Provider: `bedrockVisionProvider`
- Prompt version: `photo-analysis-v2`
- Schema: `VisionOutputSchema`

Required validated fields:

- `photoAngle`
- `confidence`
- `imageQuality.grade`
- `imageQuality.blurScore`
- `imageQuality.exposureScore`
- `imageQuality.framingScore`
- `imageQuality.resolutionScore`
- `imageQuality.occlusionRisk`
- `imageQuality.retakeRequired`
- `qualityWarnings`
- `detectedDamageCandidates`
- `detectedDamageCandidates[].repairEstimateUsd`
- `extractedText.odometer`
- `extractedText.vin`
- `humanReviewRequired`

## Example Output

```json
{
  "photoAngle": "rear",
  "confidence": 0.95,
  "imageQuality": {
    "grade": "pass",
    "blurScore": 0.93,
    "exposureScore": 0.91,
    "framingScore": 0.88,
    "resolutionScore": 0.95,
    "occlusionRisk": 0.05,
    "retakeRequired": false,
    "notes": [
      "Sharp, well-exposed rear three-quarter image; damage area on lower rear bumper clearly visible."
    ]
  },
  "qualityWarnings": [],
  "detectedDamageCandidates": [
    {
      "location": "Rear bumper lower-centre / passenger-side corner",
      "damageType": "dent",
      "severityEstimate": "moderate",
      "confidence": 0.91,
      "explanation": "Visible deformation and paint scraping on lower rear bumper with white scuff marks indicating impact damage.",
      "repairEstimateUsd": {
        "min": 500,
        "max": 1200,
        "rationale": "Policy range derived from the reviewed damage type and severity; raw model estimate is retained for audit."
      },
      "requiresHumanConfirmation": true
    }
  ],
  "extractedText": {},
  "humanReviewRequired": true
}
```

## Governance Rules

- Raw model output and validated output are stored separately.
- Invalid schema output is rejected and recorded as a failed analysis.
- Image quality is evaluated separately from damage confidence.
- Material damage candidates below the configured threshold, default `MIN_DAMAGE_CONFIDENCE=0.80`, are discarded before reviewer suggestions are created.
- Retake-required photos create quality-warning suggestions and block buyer-visible release until resolved.
- Every suggestion starts as pending.
- Photo-angle and image-quality suggestions are assigned to Inspector QA; damage and OCR suggestions are assigned to Reviewer.
- Suggestions carry an operational due time: damage within 60 minutes, image quality within 120 minutes, OCR within 180 minutes, and angle confirmation within 240 minutes.
- Accepted or rejected suggestions record reviewer identity, review timestamp, and resolved timestamp.
- Reviewers can accept, reject, or edit suggestions.
- Accepted photo-angle suggestions update required evidence completeness.
- Accepted damage candidates materialize as confirmed damage items.
- AI report drafts use confirmed facts only.
- Finalization requires complete required evidence and a valid state transition.

## Production Model Path

```txt
S3 image object
-> SQS image-analysis job
-> image worker
-> Bedrock multimodal provider
-> schema validation
-> suggestion records
-> audit trail
```

EventBridge now publishes versioned analysis completed/failed and retake-required events to the operations projector. Step Functions remains deferred until waits/branches/compensation justify orchestration; Rekognition remains a possible narrow OCR/label fallback rather than part of the current runtime path.

## Confidence Policy

- High-confidence angle suggestions still require human confirmation before checklist completion.
- Lower confidence or unknown angle outputs create reviewer work instead of silently changing facts.
- Damage candidates include severity, confidence, and repair estimate range for triage, not automatic disclosure.
- Reviewer overrides are stored as edits before acceptance, preserving the original AI recommendation in the audit trail.

## Evaluation Coverage

`evals/vision-eval-set.json` is intentionally small enough to run in CI but now covers the high-risk inspection cases that matter for buyer trust:

- required angle classification across exterior, interior, engine bay, odometer, and VIN plate;
- damage recall and false-positive control for clean panels versus visible dents/scratches;
- OCR acceptance for clear odometer and VIN evidence;
- retake policy for blur, glare, low-light interiors, partial VIN plates, dirty odometer views, and poorly framed side angles;
- auction-lane exterior imagery that should not create false damage findings.
