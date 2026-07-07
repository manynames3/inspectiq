# ADR 0009: AWS Orchestration And Vision Service Boundaries

Decision: Use SQS + Lambda workers for image-analysis dispatch, Bedrock for multimodal inspection reasoning, and Postgres/audit rows as the workflow source of truth.

Why: The current workflow needs durable fan-out, retry, DLQ handling, schema validation, and human review. SQS gives the needed delivery semantics with less operational surface than Step Functions for a single image-analysis worker path. Bedrock fits the advisory vision contract better than Rekognition because the output includes angle, image quality, OCR, damage reasoning, confidence, estimate rationale, and human-review routing in one schema.

Not used yet:

- Step Functions: useful when report/image workflows need explicit waits, branching, compensation, or multi-provider fallback orchestration. Current image analysis is a queue worker path, and report generation is async-shaped but still simple.
- EventBridge: useful for publishing domain events such as `inspection.finalized`, `image.retake_required`, or `arbitration.risk_flagged` to downstream systems. Current repo has one internal API/worker bounded context, so SQS is enough.
- Rekognition: useful for narrow OCR, label, moderation, or quality fallback checks. It is not a full replacement for the advisory damage and disclosure contract.

Consequence: The implemented architecture is smaller and easier to explain, test, and operate. The tradeoff is that broader enterprise integration, orchestration visualization, and multi-provider recovery remain planned extensions rather than active runtime behavior.
