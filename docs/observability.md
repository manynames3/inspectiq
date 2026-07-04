# Observability

Implemented:

- Request IDs in every API envelope.
- Structured JSON startup log.
- `pino-http` request logging.
- Workflow and audit events with job IDs, provider names, prompt versions, and confidence.
- Image-analysis job state for queued, running, completed, failed, and dead-letter outcomes.
- Platform Health cards derived from current workflow state.
- Platform Health SLO panels for image analysis success, retake precision, human-review freshness, and report finalization.
- Terraform-managed CloudWatch alarms for API errors, worker errors, image DLQ depth, image queue age, and API p95 latency.
- Terraform-managed CloudWatch dashboard widgets for API Gateway latency/5xx, Lambda errors/duration/throttles, and SQS queue health.

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

Operational walkthrough:

1. Open Platform Health and review operational metrics plus SLO panels.
2. Run `npm run ops:walkthrough` to read Terraform outputs, API health, CloudWatch alarms, SQS queue state, and the dashboard URL.
3. Use CloudWatch dashboard `inspectiq-ops` for API latency, Lambda errors, worker duration, SQS backlog, and DLQ depth.
4. If DLQ or queue-age alerts fire, inspect the affected job payload, confirm photo object metadata, retry safe jobs, or require retake.
5. Verify readiness blockers clear before report generation or finalization.
