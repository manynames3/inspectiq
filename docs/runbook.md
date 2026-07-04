# Runbook

Local checks:

1. `npm install`
2. `npm test`
3. `npm run build`
4. `npm run dev`

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
