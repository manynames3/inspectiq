# Observability

Implemented:

- Request IDs in every API envelope.
- Structured JSON startup log.
- `pino-http` request logging.
- Workflow and audit events with job IDs, provider names, prompt versions, and confidence.
- Image-analysis job state for queued, running, completed, failed, and dead-letter outcomes.
- One correlation ID propagated through API, SQS, worker, Postgres outbox, EventBridge, and projector logs.
- X-Ray active tracing for API, image worker, and projector Lambdas.
- EventBridge projector health, duplicate count, last correlation ID, domain-event DLQ depth, and replay controls.
- DynamoDB monthly model usage and current cost-guard state.
- Platform Health cards derived from current workflow state.
- Platform Health SLO panels for image analysis success, retake precision, human-review freshness, and report finalization.
- Terraform-managed alarms for API/worker/projector errors, both DLQs, image queue age, API p95 latency, pending outbox age, Bedrock throttles, and cost-guard rejection.
- Terraform-managed dashboard widgets for API Gateway latency/5xx, API/worker/projector Lambda health, SQS queues/DLQs, pending outbox age, Bedrock throttles, and cost-guard rejection.

Metrics to publish in production:

- `image_analysis_success_rate`
- `image_quality_retake_rate`
- `image_analysis_queue_latency`
- `missing_required_angle_rate`
- `human_review_rate`
- `grade_generation_latency`
- `report_finalization_rate`
- `suggestion_acceptance_rate`
- `buyer_visible_ready_rate`
- `p95_api_latency`
- `image_queue_age_seconds`
- `image_analysis_dlq_visible`
- `domain_event_dlq_visible`
- `pending_outbox_age_seconds`
- `bedrock_throttles`
- `cost_guard_rejections`

Operational walkthrough:

1. Open Platform Health and review operational metrics plus SLO panels.
2. Run `npm run ops:walkthrough` to read Terraform outputs, API health, CloudWatch alarms, SQS queue state, and the dashboard URL.
3. Use `inspectiq-ops` for API latency, Lambda/projector errors, worker duration, SQS backlog, DLQs, outbox age, and model guardrails.
4. If the image DLQ fires, inspect object metadata and provider failure; retry only idempotent usable evidence or request a retake.
5. If the domain-event DLQ or outbox-age alarm fires, verify Postgres truth first, replay through the Admin control, and confirm the DynamoDB projection converges without duplicate counts changing business state.
6. Verify readiness blockers clear, approve the exact report version, then finalize.
