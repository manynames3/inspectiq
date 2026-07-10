# ADR 0009: AWS Orchestration And Vision Service Boundaries

Decision: Use SQS + Lambda for image-analysis work, EventBridge for versioned post-commit domain events, Bedrock for multimodal inspection reasoning, Neon Postgres for authoritative workflow/audit/outbox state, and DynamoDB for idempotent operational projections.

Why: Work queues and business events solve different problems. SQS provides durable competing-consumer delivery, retry, and DLQ handling for image jobs. EventBridge publishes minimal versioned facts after the relational transaction commits, allowing an independently retryable Python projector and future consumers without coupling them to the API transaction. Conditional DynamoDB writes suppress duplicate delivery and TTL limits operational history. Bedrock fits the advisory contract better than Rekognition because one validated response covers angle, quality, OCR, visible damage, confidence, estimates, and reviewer routing.

Not used yet:

- Step Functions: useful when report/image workflows need explicit waits, branching, compensation, or multi-provider fallback orchestration. Current image analysis is a queue worker path, and report generation is async-shaped but still simple.
- Rekognition: useful for narrow OCR, label, moderation, or quality fallback checks. It is not a full replacement for the advisory damage and disclosure contract.

Consequence: Neon remains the only business source of truth; DynamoDB can be rebuilt from the outbox and never decides grades/reports. EventBridge adds a small serverless control-plane surface but makes duplicate handling, replay, failure visibility, and consumer ownership explicit. Step Functions remains unjustified until the workflow needs durable waits, branches, compensation, or multi-provider orchestration.
