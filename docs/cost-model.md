# Cost Model

## Idle-Cost Design

InspectIQ deliberately avoids always-on containers, provisioned concurrency, RDS/Aurora, OpenSearch, Kinesis, and scheduled outbox polling. Lambda, SQS, EventBridge, on-demand DynamoDB, S3, and Bedrock are request-based; Neon can scale to zero; Cloudflare Pages hosts static assets.

Expected low-traffic idle spend is approximately **$1-$10/month**, depending mainly on Neon storage/compute wakeups, CloudWatch ingestion/storage, S3 objects, and DNS/transfer choices. The architecture target is below **$50/month**; this estimate must be replaced by a measured seven-day idle observation after deployment.

## Guardrails

- AWS Budget: $25 forecast notification, $40 actual notification, $50 actual ceiling alert.
- Default monthly Bedrock reservations: 250 image analyses and 50 report drafts.
- Each model operation is conditionally reserved in DynamoDB before invocation; duplicate idempotency keys do not consume another reservation.
- A reached limit returns `429 COST_GUARD_REACHED` while preserving captured evidence.
- Evaluation users cannot invoke model operations.
- Lambda concurrency is bounded and provisioned concurrency is disabled.
- CloudWatch logs retain 30 days.
- DynamoDB is on-demand with seven-day idempotency TTL and 30-day timeline TTL.
- S3 aborts abandoned multipart uploads; evidence retention is a separate business policy.

## Variable-Cost Scenario

For 1,000 inspections at 10 photos each, 10,000 multimodal image calls dominate variable cost. Other contributors are report tokens, S3 storage/transfer, Lambda duration, API requests, Neon compute/storage, and CloudWatch logs. Actual cost depends on image tokenization, model pricing, output length, retries, retakes, cache behavior, and retention.

The evaluator records per-run input/output tokens and estimated model cost. Do not present a dollar forecast as production fact until a real Bedrock run and representative capture distribution have been measured.

## Services Intentionally Excluded

- OpenSearch: indexed Postgres satisfies current queue/report lookup; a search collection adds complexity without current product value.
- Kinesis: user-driven workflow events do not require a continuous high-throughput stream.
- Step Functions: current workers do not need durable waits, branches, compensation, or multi-provider orchestration.
- ECS/Fargate: Lambda fits bursty work and eliminates idle service capacity.
