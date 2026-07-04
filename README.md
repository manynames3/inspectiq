# InspectIQ

AI-assisted wholesale vehicle inspection workbench for condition-report readiness.

InspectIQ is a production-shaped vertical slice of an automotive inspection system: required photo evidence, advisory image analysis, human confirmation, deterministic grading, buyer-visible readiness, condition-report generation, and an auditable decision trail.

Live walkthrough: https://inspectiq.pages.dev

## What This Demonstrates

This repo is designed to answer a hiring manager's core question: can this engineer turn an ambiguous operational workflow into a reliable system with clear boundaries, credible tradeoffs, and a path to production?

It demonstrates:

- domain understanding of wholesale/offsite inspection workflows, CR readiness, VDP readiness, buyer trust, seller disclosure, reconditioning estimates, and arbitration risk;
- end-to-end product execution across React, TypeScript, Node, Java, Postgres schema design, REST APIs, RBAC, audit trails, and browser E2E tests;
- responsible AI design where model output is validated, treated as advisory, reviewed by humans, and kept out of buyer-facing output until confirmed;
- production architecture thinking around S3 image storage, async image-analysis workers, Neon Postgres persistence, metrics, runbooks, and AWS Lambda deployment.

It does not use Cox Automotive branding, proprietary data, or unlicensed assets. Vehicle records are synthetic, and bundled sample photos use license-safe public image sources documented in `sample-data/IMAGE_CREDITS.md`.

## Business Problem

Wholesale condition reports need consistent photo evidence, clear damage facts, explainable grading, buyer trust, seller disclosure, and accountable review. AI can speed up inspection workflows, but it should not silently become the source of truth. InspectIQ keeps AI advisory and makes reviewers confirm facts before they affect grade, CR readiness, VDP visibility, reconditioning estimates, or report output.

## Product Walkthrough

1. Open the dashboard and choose an inspection.
2. Create a new inspection when needed.
3. Use the Inspector role to attach required photo evidence or upload vehicle photos.
4. Run image analysis and validate the structured AI output.
5. Switch to the Reviewer role for suggestions labelled `AI suggestion - requires human confirmation`.
6. Accept, reject, or edit suggestions.
7. Confirmed photo-angle suggestions update required evidence completeness.
8. Accepted damage candidates become human-confirmed damage items.
9. Check CR readiness, VDP readiness, buyer-visible status, reconditioning estimate, and arbitration risk.
10. Calculate the condition grade from confirmed evidence.
11. Generate a schema-validated AI report draft.
12. Edit and finalize the report as a reviewer.
13. Review the audit trail and Platform Health scorecard.

## What To Review First

| If you have... | Review this |
| --- | --- |
| 2 minutes | Live app, dashboard, one finalized inspection, and `docs/hiring-manager-brief.md` |
| 5 minutes | `docs/interview-talking-points.md` and the create -> analyze -> review -> finalize flow |
| 15 minutes | `docs/architecture.md`, `docs/implementation-boundary.md`, and `docs/aws-deployment-plan.md` |
| Code review time | `apps/api/src/store.ts`, `apps/api/src/app.ts`, `packages/shared/src/index.ts`, and `apps/web/scripts/e2e-inspection-flow.mjs` |

## Architecture

```mermaid
flowchart TD
  Web[React + TypeScript workbench on Cloudflare Pages] --> API[API Gateway + Node.js Lambda]
  API --> Shared[Shared Zod schemas]
  API --> Store[MemoryStore facade]
  Store --> FileStore[Local file snapshot]
  Store --> PostgresStore[Neon Postgres persistence mode]
  API --> S3[S3 presigned uploads]
  API --> SQS[SQS image-analysis queue]
  SQS --> Worker[Lambda image worker]
  API --> Vision[Vision provider interface]
  Vision --> LocalVision[Deterministic local analysis]
  Worker --> BedrockVision[Bedrock multimodal analysis]
  API --> Grade[Java Spring Boot grading service]
  API --> Report[Report provider interface]
  Report --> LocalReport[Deterministic local report provider]
  Report --> BedrockReport[Bedrock report provider]
  API --> Audit[Audit events]
  Store --> PG[(Neon Postgres)]
```

## Scope

This is a production-shaped reference implementation with a live hosted frontend and AWS backend. Local development still defaults to deterministic providers and file persistence for repeatable tests, while the deployed path uses Cloudflare Pages, API Gateway, Lambda, Neon Postgres, S3 presigned uploads, SQS, Bedrock multimodal analysis, Secrets Manager, Cognito resources, CloudWatch logs, alarms, and a dashboard.

Remaining production hardening is called out directly: replace whole-snapshot persistence with per-operation repository writes, enable end-user OIDC in the frontend before turning on the API Gateway JWT authorizer, add model evaluation datasets, and add environment promotion/rollback automation.

For the concise interview explanation, see `docs/implementation-boundary.md`.

## Documentation Map

- `docs/hiring-manager-brief.md`: business framing, stack mapping, walkthrough, and production next steps.
- `docs/architecture.md`: component boundaries, runtime flow, data ownership, and failure handling.
- `docs/implementation-boundary.md`: what is real in the repo, what is deterministic locally, and how to explain it.
- `docs/state-machine.md`: workflow states and legal transitions.
- `docs/image-analysis-contract.md`: model output contract, schema validation, and reviewer routing.
- `docs/ai-governance.md`: prompt/version metadata, human review, and audit posture.
- `docs/aws-deployment-plan.md`: AWS production shape and migration path.
- `docs/security.md`, `docs/observability.md`, `docs/runbook.md`: operational hardening notes.

## Real Vs Deterministic Local

| Area | Implemented in this repo | Production replacement |
| --- | --- | --- |
| Inspection workflow | Working React/TypeScript UI, role-aware actions, REST API, state machine, audit trail | Same workflow behind enterprise auth, object-level authorization, and operational SLAs |
| Image analysis | Deterministic local provider plus deployed SQS -> Lambda -> Bedrock multimodal provider using the same strict schema contract | Model evaluation set, confidence calibration, and provider fallback policy |
| Persistence | In-memory tests, local JSON snapshot, and deployed `PERSISTENCE_MODE=postgres` against Neon | Per-operation Postgres repository with narrower transactions, retention, backups, and audit durability |
| Image storage | Deployed presigned S3 upload intent, private S3 objects, object key metadata, MIME type, byte size, and checksum capture | EXIF stripping, image normalization, thumbnails, lifecycle, KMS key policy, and object-level auth |
| Java grading | Optional Spring Boot service plus identical Node fallback for deterministic local reliability | Keep separate only when grading rules need independent ownership, versioning, or reuse |
| Report generation | Async-shaped job model with deterministic local provider | Queue/Step Functions workflow with model retries, DLQ, provider telemetry, and reviewer approval |

## Tech Stack

- React, TypeScript, Vite, React Router, CSS.
- Node.js, Express, Zod, structured logging, request IDs.
- Shared TypeScript schemas.
- Java Spring Boot grading service.
- Postgres schema and Drizzle table definitions.
- Optional Postgres persistence mode using the existing `pg` client.
- Local file snapshot persistence plus Neon Postgres persistence for the deployed backend.
- S3-style image storage interface.
- Queue-shaped image analysis jobs and Step Functions-style report jobs.
- Provider interfaces with deterministic local AI and Bedrock implementations.
- Vitest, Supertest, React Testing Library, JUnit.
- Terraform-managed AWS Lambda, API Gateway, S3, SQS/DLQ, Secrets Manager, Cognito, CloudWatch alarms, and dashboard.

## Local Setup

```bash
npm install
npm run dev
```

Open:

- Web: `http://localhost:5173`
- API health: `http://localhost:4000/api/health`

Optional Java service:

```bash
cd services/grading-java
mvn spring-boot:run
```

The API falls back to equivalent local grading rules when the Java service is not running so the inspection workflow remains usable.

## Environment Variables

Copy `.env.example` to `.env` if you want to customize:

- `PORT`
- `WEB_ORIGIN`
- `DATABASE_URL`
- `VISION_PROVIDER=local|bedrock`
- `REPORT_PROVIDER=local|bedrock`
- `GRADING_SERVICE_URL`
- `PERSISTENCE_MODE=file|memory|postgres`
- `INSPECTIQ_STORE_FILE`
- `DATABASE_URL`
- `IMAGE_BUCKET`
- `PG_POOL_SIZE`
- `PG_IDLE_TIMEOUT_MS`

Postgres mode:

```bash
export PERSISTENCE_MODE=postgres
export DATABASE_URL='postgres://user:password@localhost:5432/inspectiq'
npm run dev:api
```

The API applies `apps/api/src/db/schema.sql` on startup, loads existing rows, and persists workflow mutations back to Postgres. Local file mode remains the default for reliable interview walkthroughs.

## API Examples

```bash
curl http://localhost:4000/api/inspections

curl -X POST http://localhost:4000/api/inspections \
  -H 'content-type: application/json' \
  -d '{"vin":"5NMJBCAE4RH123456","year":2024,"make":"Hyundai","model":"Tucson","trim":"SEL","mileage":14250,"exteriorColor":"Gray","sellerSource":"Wholesale offsite lane","inspectorName":"John Smith"}'
```

All responses use:

```json
{
  "data": {},
  "requestId": "..."
}
```

Errors use:

```json
{
  "error": {
    "code": "VALIDATION_FAILED",
    "message": "Request validation failed."
  },
  "requestId": "..."
}
```

## Database Schema Overview

The Postgres schema covers:

- `users`
- `inspections`
- `vehicle_photos`
- `image_analysis_jobs`
- `photo_analysis_results`
- `vision_suggestions`
- `damage_items`
- `condition_grades`
- `ai_report_jobs`
- `ai_report_drafts`
- `final_reports`
- `audit_events`

See `apps/api/src/db/schema.sql` and `apps/api/src/db/drizzle-schema.ts`.

## State Machine

The API enforces the documented state machine in `apps/api/src/stateMachine.ts`.

```txt
DRAFT -> NEEDS_PHOTOS -> READY_FOR_GRADING -> GRADED -> AI_DRAFT_PENDING
AI_DRAFT_PENDING -> AI_DRAFTED | HUMAN_REVIEW_REQUIRED | REPORT_FAILED
AI_DRAFTED -> FINALIZED | HUMAN_REVIEW_REQUIRED
HUMAN_REVIEW_REQUIRED -> FINALIZED | AI_DRAFT_PENDING
REPORT_FAILED -> AI_DRAFT_PENDING
```

`FINALIZED` is terminal for normal users.

## Image Analysis Workflow

Local:

1. Attach required photo evidence or upload a vehicle photo.
2. Create an image-analysis job with an idempotency key.
3. Mark the job running and call the vision provider.
4. Validate angle, image quality, damage, OCR, confidence, and repair estimate output with `VisionOutputSchema`.
5. Save raw and validated output separately.
6. Create pending suggestions, including retake-required quality warnings.
7. Human reviewer accepts, rejects, or edits.

Deployed AWS path:

```txt
S3 upload -> SQS -> Lambda image worker -> Bedrock multimodal model
-> schema validation -> Postgres suggestions -> audit event
```

Upload intent:

```bash
curl -X POST http://localhost:4000/api/uploads/intent \
  -H 'content-type: application/json' \
  -H 'x-actor-id: inspector-john-smith' \
  -H 'x-actor-name: John Smith' \
  -H 'x-actor-role: inspector' \
  -d '{"inspectionId":"<inspection-id>","originalFilename":"front.jpg","mimeType":"image/jpeg","byteSize":120000}'
```

## AI Report Workflow

Local report jobs complete immediately through `localReportProvider`, but the data model is async-ready:

```txt
Generate report -> ai_report_jobs -> gather confirmed facts -> provider call
-> schema validation -> ai_report_drafts -> human review or AI_DRAFTED
```

AI never finalizes reports.

## Human-In-The-Loop Governance

- Suggestions stay pending until reviewed.
- Edited suggestions remain review records until a reviewer explicitly accepts them.
- Only accepted suggestions become facts.
- Damage candidates create damage items only after acceptance.
- Low confidence or missing evidence forces human review.
- Finalization requires valid state and complete evidence.
- Buyer-visible release is blocked by missing required angles, unresolved AI suggestions, failed analysis, retake-required image quality, missing grade, or missing final report.
- Audit trail records decisions and state changes.

## Testing

```bash
npm test
npm run test:e2e
npm run typecheck
npm run lint
npm run build
```

The API tests cover the full create-to-finalize flow, upload intent metadata, image-analysis job records, readiness blockers, schema validation failures, evidence completeness gates, AI suggestion review, audit trail events, buyer-ready report export, and post-finalization immutability guards. The browser E2E script covers role-specific dashboard context, create -> attach photos -> analyze -> reviewer acceptance -> grade -> draft report -> finalize -> export buyer report -> audit verification through the rendered React app.

Java tests:

```bash
cd services/grading-java
mvn test
```

## Observability

Implemented locally:

- Request IDs.
- Structured logs.
- Provider names and prompt versions in records.
- Audit events for key decisions.
- Platform Health scorecard.

Production metrics include image analysis success rate, image retake rate, image-analysis queue latency, missing required angle rate, human review rate, grade generation latency, report finalization rate, suggestion acceptance rate, buyer-visible ready rate, and p95 API latency.

## Security

Local review uses role-aware UI controls and API RBAC for Inspector, Reviewer, and Admin workflows. Production design should use Cognito or enterprise OIDC, JWT validation, object-level authorization, S3 presigned uploads, encrypted S3/RDS, Secrets Manager, least-privilege IAM, and CloudTrail.

## AWS Deployment Architecture

The deployed backend shape in `us-east-1` is:

```txt
React
-> Cloudflare Pages
-> API Gateway + Lambda
-> Neon Postgres
-> S3 image objects
-> SQS image jobs
-> Lambda image worker
-> Bedrock multimodal model
-> validated suggestions
-> audit trail
```

The Terraform in `infra/terraform` deploys the AWS resources used by the live backend. Cognito resources are provisioned, but the API Gateway JWT authorizer is intentionally feature-flagged off for the public walkthrough until frontend sign-in is enabled.

## Cost Awareness

Major drivers:

- S3 image storage.
- Multimodal image-analysis calls.
- Report-generation tokens.
- API/worker compute.
- Neon Postgres compute/storage.
- CloudWatch logs.

For 1,000 inspections with 10 images each, model calls dominate variable cost. Local deterministic providers avoid accidental spend during development; the deployed Bedrock path is reserved for explicit image-analysis actions and uses job records for idempotency.

## Failure Handling

Handled or documented:

- Unsupported file type validation.
- Provider failure records.
- Invalid schema rejection.
- Unknown photo angle routing.
- Image quality retake policy.
- Duplicate analysis handling.
- Missing evidence before grading.
- Report job failure and retry path.
- Finalization state guards.
- Double-submit finalization idempotency.

## Production Tradeoffs

I would discuss:

- Replace the current whole-snapshot Postgres adapter with per-operation repository methods before multi-reviewer production use.
- Keep Java grading separate only if condition rules are independently owned, versioned, or reused outside the Node API.
- Stay on Lambda for the current bursty image-analysis worker; consider containers only if native image tooling or runtime duration outgrows Lambda limits.
- Treat Bedrock output as untrusted input: validate schemas, store raw and validated output, and require human confirmation before facts affect reports.
- Use presigned S3 uploads with MIME validation, object-level authorization, checksum capture, and lifecycle policies.
- Add reviewer queues and SLA metrics only after the core evidence-to-report workflow is stable.
- Put audit events in durable relational storage with append-only conventions before using this for compliance.

## Future Improvements

- Per-operation Postgres repository implementation behind the existing schema.
- Frontend OIDC sign-in and API Gateway JWT authorizer enforcement.
- Model evaluation set for angle accuracy, OCR accuracy, damage false positives, and retake precision.
- Reviewer queue with assignment and SLA filters.
- Thumbnail generation and image metadata extraction.
- More CloudWatch dashboards and alarm notification targets.
- Cross-browser frontend flow tests.

## Resume Bullets

See `docs/resume-bullets.md` for short, technical, and business-impact versions.
