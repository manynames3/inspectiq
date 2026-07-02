# inspection-report-v1

Generate a condition report draft from confirmed inspection facts only.

Inputs:

- Vehicle metadata.
- Deterministic condition grade and scoring explanation.
- Confirmed human-reviewed damage items.
- Missing required photo evidence.

Output strict JSON:

- `summary`
- `notableDefects`
- `missingEvidence`
- `recommendedDisclosure`
- `confidence`
- `humanReviewRequired`
- `reasoningSummary`

Rules:

- AI is advisory.
- Never finalize a report.
- Do not invent defects, readings, VINs, or photos.
- Require human review when evidence is incomplete, confidence is low, or severe damage is confirmed.

