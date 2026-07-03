# Image Analysis Contract

## Purpose

Image analysis is advisory evidence triage. It helps reviewers find missing angles, quality problems, damage candidates, and OCR values faster, but it does not directly change condition report facts until a human accepts or edits the suggestion.

## Provider Contract

Current local provider:

- Provider: `mockVisionProvider`
- Prompt version: `photo-analysis-v2`
- Schema: `VisionOutputSchema`

Required validated fields:

- `photoAngle`
- `confidence`
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
  "confidence": 0.96,
  "qualityWarnings": [],
  "detectedDamageCandidates": [
    {
      "location": "rear bumper",
      "damageType": "dent",
      "severityEstimate": "severe",
      "confidence": 0.9,
      "explanation": "Inspection photo indicates a rear bumper deformation.",
      "repairEstimateUsd": {
        "min": 1200,
        "max": 2500,
        "rationale": "Estimated from damage type and severity for reviewer triage."
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
- Every suggestion starts as pending.
- Reviewers can accept, reject, or edit suggestions.
- Accepted photo-angle suggestions update required evidence completeness.
- Accepted damage candidates materialize as confirmed damage items.
- AI report drafts use confirmed facts only.
- Finalization requires complete required evidence and a valid state transition.

## Production Model Path

```txt
S3 image object
-> SQS/EventBridge image-analysis job
-> image worker
-> Bedrock/Rekognition/custom model
-> schema validation
-> suggestion records
-> audit trail
```

## Confidence Policy

- High-confidence angle suggestions still require human confirmation before checklist completion.
- Lower confidence or unknown angle outputs create reviewer work instead of silently changing facts.
- Damage candidates include severity, confidence, and repair estimate range for triage, not automatic disclosure.
- Reviewer overrides are stored as edits before acceptance, preserving the original AI recommendation in the audit trail.
