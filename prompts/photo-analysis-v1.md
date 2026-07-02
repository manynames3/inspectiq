# photo-analysis-v1

Analyze one vehicle inspection image and return strict JSON only.

Return:

- `photoAngle`: one of front, rear, driver_side, passenger_side, interior, engine_bay, odometer, vin_plate, unknown.
- `confidence`: 0 to 1.
- `qualityWarnings`: strings for blur, low light, obstruction, crop, or retake needs.
- `detectedDamageCandidates`: advisory damage candidates only. Every candidate must require human confirmation.
- `extractedText`: possible odometer or VIN text, nullable when absent.
- `humanReviewRequired`: true when confidence is low, damage is visible, quality is poor, or angle is unknown.

Do not invent unseen damage. Do not convert suggestions into inspection facts.

