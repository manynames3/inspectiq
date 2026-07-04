# Observability

Implemented:

- Request IDs in every API envelope.
- Structured JSON startup log.
- `pino-http` request logging.
- Workflow and audit events with job IDs, provider names, prompt versions, and confidence.
- Image-analysis job state for queued, running, completed, failed, and dead-letter outcomes.
- Platform Health cards derived from current workflow state.

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
