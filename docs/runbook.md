# Runbook

Local checks:

1. `npm ci`
2. `make verify-fast`
3. `make verify-grading verify-projector`
4. `npm run eval:vision`
5. `npm run build`
6. `npm run dev`

Bedrock model gate:

```bash
AWS_REGION=us-east-1 VISION_PROVIDER=bedrock BEDROCK_VISION_FALLBACK=fail npm run eval:vision
```

Deployed operations walkthrough:

```bash
npm run ops:walkthrough
```

Postgres persistence smoke:

1. Start Postgres and create an `inspectiq` database.
2. `export PERSISTENCE_MODE=postgres`
3. `export DATABASE_URL='postgres://user:password@localhost:5432/inspectiq'`
4. `npm run dev:api`
5. Verify `GET /api/platform-health` reports `activeMode: postgres`.

Common failures:

- API unavailable: verify port 4000 is free and `npm run dev:api` is running.
- Postgres mode fails on startup: verify `DATABASE_URL`, network access, and database permissions for schema creation.
- Upload intent rejected: verify MIME type is JPEG, PNG, or WebP and byte size is below the configured 25 MB limit.
- Upload metadata rejected: verify presigned mode includes the configured image bucket, an object key under `inspections/:inspectionId/photos/`, byte size, and SHA-256 checksum.
- Browser preview upload rejected: local data-URL fallback is limited to small JPEG/PNG/WebP files because the API JSON body is capped for safety.
- Image analysis stuck pending: inspect `image_analysis_jobs` for queued/running/failed/dead_letter status and retry or request retake.
- Python grading service unavailable: the API falls back to identical local grading rules for workflow continuity.
- Report generation failed: check provider env vars and retry the job endpoint.
- Version conflict: reload the authoritative inspection/suggestion/report and reapply the human decision; never silently overwrite another reviewer.
- Cost guard reached: do not discard evidence; ask an Admin to review the monthly usage/limit before changing deployment configuration.
- Domain projection stale: compare Postgres audit/outbox truth to Platform Health, replay pending outbox or EventBridge DLQ entries, and verify duplicate suppression.
- Incomplete inspection: accept photo-angle suggestions for all required photo angles.
- Finalization blocked: resolve readiness issues, approve the current report version with a reviewer comment, then confirm finalization.
- Buyer report export fails: verify a report record exists and call `/api/reports/:id/export`.

Failed image-analysis job recovery:

1. Confirm the alert: `inspectiq-image-queue-age` or `inspectiq-image-dlq-visible`.
2. Open the affected inspection audit trail and find `image_analysis.queued`, `image_analysis.started`, and `photo.analysis_failed`.
3. Inspect the job row, SQS payload, provider name, prompt version, object bucket/key, MIME type, and checksum.
4. If the provider/schema issue is transient and the image is usable, retry the job.
5. If the object is missing, corrupt, blurry, poorly framed, or low light, request retake and keep buyer-visible release blocked.
6. Run the strict Bedrock eval before promoting model or prompt changes that affect recovery behavior.

Production readiness drill:

1. Sign in as Inspector and upload a real JPEG/PNG/WebP through the presigned S3 path.
2. Confirm private object metadata, byte size, checksum, and protected preview URL.
3. Trigger image analysis and verify SQS job creation, worker completion, Bedrock provider metadata, and audit events.
4. Sign in as Reviewer and accept, reject, or edit the resulting suggestions.
5. Generate the grade/report, approve the exact report version, and finalize only after blockers clear.
6. Confirm the related EventBridge event appears in the DynamoDB operational timeline and shares the correlation ID with the Postgres audit trail.
7. Simulate a failed image job and a failed domain-event delivery in a safe environment, recover each, and confirm Platform Health records recovery without duplicate business facts.
