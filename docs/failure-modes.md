# Failure Modes

- Image upload fails: return a consistent API error and do not create photo metadata.
- Unsupported file type: reject with Zod validation.
- Vision provider fails: save failed analysis and allow retry.
- Invalid AI JSON: reject schema validation and avoid creating suggestions or drafts.
- Unknown photo angle: keep angle unknown and require human review.
- Low-confidence damage: store as pending suggestion only.
- Duplicate analysis: return existing completed analysis unless forced.
- Grading unavailable: local fallback mirrors the Python grading rules; production should fail closed or retry based on policy.
- Grading before evidence: API returns conflict with missing evidence.
- Report provider failure: job moves to failed and inspection moves to `REPORT_FAILED`.
- Duplicate business mutation: keys are scoped as inspection + operation + client request/state; Postgres uniqueness prevents duplicate damage and grade records.
- Concurrent report request: a leased DynamoDB claim admits one Lambda worker, the completed Postgres job is replayed on retry, and failed or expired claims can be reclaimed.
- Finalization too early: blocked unless report exists, evidence is complete, and status transition is valid.
- Double-click finalize: endpoint returns the already finalized report.
- Audit write failure: production should emit a structured error and fail the business action if accountability would be lost.
