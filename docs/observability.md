# Observability

Implemented:

- Request IDs in every API envelope.
- Structured JSON startup log.
- `pino-http` request logging.
- Workflow and audit events with job IDs, provider names, prompt versions, and confidence.

Metrics to publish in production:

- `image_analysis_success_rate`
- `failed_image_analysis_count`
- `average_image_analysis_latency`
- `report_generation_success`
- `report_generation_failure`
- `report_generation_latency`
- `human_review_rate`
- `ai_suggestion_acceptance_rate`
- `ai_suggestion_rejection_rate`
- `p95_api_latency`

