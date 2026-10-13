# Runbook

Local checks:

1. `npm ci`
2. `make verify-fast`
3. `make verify-grading verify-projector`
4. `npm run eval:vision`
5. `npm run build`
6. `npm run dev`

Free Bedrock cost preflight (counts the exact corpus inputs; never runs inference):

```bash
VISION_EVAL_PREFLIGHT_ONLY=true BEDROCK_MODEL_ID=us.anthropic.claude-sonnet-4-6 npm run eval:vision
```

This is not accuracy evidence or a passing promotion gate. Prices are verified only for US Sonnet 4.6. If saving output, use an absolute `VISION_EVAL_OUTPUT` path: npm runs the script in `apps/api`, not the repository root. Missing/unsupported token counts fail closed.

Bedrock model gate, **only after spending authorization and a safe enforceable budget**:

```bash
AWS_REGION=us-east-1 VISION_PROVIDER=bedrock BEDROCK_VISION_FALLBACK=fail npm run eval:vision
```

Current authorization is $1 total, not $1 per retry/run. The paid runner has no persistent retry-safe cap and must not be launched under that limit. The free preflight found a $3.30726 single-attempt upper bound for the unchanged 108-case gate; retries could add charges. AWS promotion is on hold. See [release status](release-status.md). Never use cost-only output, deterministic output, fallback, or a partial corpus as real-model promotion evidence.

Deployed operations walkthrough:

```bash
npm run ops:walkthrough
```

Audited reinspection:

1. Open the finalized inspection as an authorized Inspector, Reviewer, or Admin. Evaluation access is read-only; native reinspection requires an online authenticated session.
2. Record a 10–1,000 character reason and create a separate inspection. `POST /api/inspections/:id/reinspections` requires `operationId` (UUID) and the exact `expectedReportVersion`.
3. If the response is lost, retry the identical payload. A changed reason/version with the same operation ID conflicts; a definite stale-version response requires refreshing authoritative history.
4. Verify the new draft's source inspection/report/version and audit reason. No evidence, grades, approvals, spending authority, or work orders carry forward. Capture fresh evidence and follow normal review/QC/finalization.
5. Keep the original publication available as historical evidence with its current-policy limitation, including exports. Never modify the old report body or synthesize fingerprints to make it appear current.

AWS code promotion:

1. Run `make verify-full` with a disposable real `TEST_DATABASE_URL`; verify the legacy upgrade and concurrent startup tests. Run the no-fallback Bedrock gate with explicitly approved AWS test spending before promoting model/prompt changes.
2. Verify a recoverable database snapshot and record before/after digests of published inspection/report/grade/version rows. Migration `0008_audited_reinspections.sql` is additive; startup serializes schema/ledger writes across API and worker cold starts.
3. Dispatch `deploy-aws.yml` with `action=plan` at the exact release ref and review its artifact. An `apply` dispatch creates a fresh plan: the workflow validates that saved plan immediately before apply, allowing only code/computed-attribute updates to the three existing InspectIQ Lambdas. It rejects infrastructure/configuration changes and all creates/deletes/replacements. Those require separate review, not weakening the guard.
4. After apply, verify ledger `0008`, unchanged historical digests, authenticated reinspection/history behavior, and repeated public/API/browser smoke. One warmed health request is not sufficient evidence of recovered concurrency.

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
