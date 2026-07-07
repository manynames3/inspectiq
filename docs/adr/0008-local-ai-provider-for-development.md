# ADR 0008: Local AI Provider for Development

Decision: Use deterministic local providers by default.

Reason: Local development and tests should be fast, free, repeatable, and safe from accidental model spend.

Boundary: The local provider is not a claim of production model quality. It is a contract test for the workflow around image analysis. It must return the same fields expected from a real provider: angle, confidence, image-quality scores, retake policy, damage candidates, repair estimate range, OCR values, provider metadata through the analysis record, prompt version, raw output, validated output, and human-review routing.

Production replacement implemented in this repo: S3 image object -> SQS job -> image worker -> Bedrock multimodal provider -> `VisionOutputSchema` validation -> pending suggestions -> reviewer decision -> audit trail.

Deferred options: EventBridge is useful for publishing broader business events, Step Functions is useful for long-running orchestration with waits and branches, and Rekognition is useful as a narrow OCR/label fallback. They are intentionally not part of the current runtime path.

Exit criteria: replace the deterministic provider when model credentials, evaluation data, latency budget, retry policy, and reviewer QA metrics are available.
