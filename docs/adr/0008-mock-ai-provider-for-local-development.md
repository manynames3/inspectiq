# ADR 0008: Mock AI Provider for Local Development

Decision: Use deterministic mock providers by default.

Reason: Local development and tests should be fast, free, repeatable, and safe from accidental model spend.

Boundary: The mock provider is not a claim of production model quality. It is a contract test for the workflow around image analysis. It must return the same fields expected from a real provider: angle, confidence, image-quality scores, retake policy, damage candidates, repair estimate range, OCR values, provider metadata through the analysis record, prompt version, raw output, validated output, and human-review routing.

Production replacement: S3 image object -> SQS/EventBridge job -> image worker -> Bedrock/Rekognition/custom model -> `VisionOutputSchema` validation -> pending suggestions -> reviewer decision -> audit trail.

Exit criteria: replace the deterministic provider when model credentials, evaluation data, latency budget, retry policy, and reviewer QA metrics are available.
