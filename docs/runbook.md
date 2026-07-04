# Runbook

Local checks:

1. `npm install`
2. `npm test`
3. `npm run eval:vision`
4. `npm run build`
5. `npm run dev`

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
- Upload intent rejected: verify MIME type is JPEG, PNG, or WebP and byte size is below the configured limit.
- Image analysis stuck pending: inspect `image_analysis_jobs` for queued/running/failed/dead_letter status and retry or request retake.
- Java grading service unavailable: the API falls back to identical local grading rules for workflow continuity.
- Report generation failed: check provider env vars and retry the job endpoint.
- Incomplete inspection: accept photo-angle suggestions for all required photo angles.
- Finalization blocked: call `/api/inspections/:id/readiness` and resolve blocker issues before releasing the buyer-visible report.
- Buyer report export fails: verify a report record exists and call `/api/reports/:id/export`.

Failed image-analysis job recovery:

1. Confirm the alert: `inspectiq-image-queue-age` or `inspectiq-image-dlq-visible`.
2. Open the affected inspection audit trail and find `image_analysis.queued`, `image_analysis.started`, and `photo.analysis_failed`.
3. Inspect the job row, SQS payload, provider name, prompt version, object bucket/key, MIME type, and checksum.
4. If the provider/schema issue is transient and the image is usable, retry the job.
5. If the object is missing, corrupt, blurry, poorly framed, or low light, request retake and keep buyer-visible release blocked.
6. Run the strict Bedrock eval before promoting model or prompt changes that affect recovery behavior.
