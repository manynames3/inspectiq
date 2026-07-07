# InspectIQ

[![CI](https://github.com/manynames3/inspectiq/actions/workflows/ci.yml/badge.svg)](https://github.com/manynames3/inspectiq/actions/workflows/ci.yml)

AI-assisted wholesale vehicle inspection workbench for condition-report readiness.

InspectIQ is a production-shaped vertical slice of an automotive inspection system: required photo evidence, advisory image analysis, human confirmation, deterministic grading, buyer-visible readiness, condition-report generation, and an auditable decision trail.

Live walkthrough: https://inspectiq.pages.dev

Hiring-manager review link: https://inspectiq.pages.dev/?review=1

The hosted walkthrough offers a read-only Evaluation Workspace for public review. Cognito review credentials are available on request for the authenticated Inspector/Reviewer/Admin production proof path.

## Who This Is For

InspectIQ is built for wholesale and offsite vehicle inspection teams: inspectors capturing required photo evidence, reviewers validating AI-assisted findings, and operations leads monitoring condition-report readiness, failed image jobs, and audit history.

The product standardizes how vehicle evidence moves from capture to human review to buyer-visible condition reporting. It helps teams reduce incomplete inspections, inconsistent damage facts, weak photo evidence, arbitration risk, and untraceable AI-assisted decisions.

The core value is workflow reliability. AI can suggest required photo angles, image-quality issues, OCR values, and visible damage candidates, but reviewers approve facts before they affect CR readiness, VDP visibility, recon estimates, arbitration risk, or final reports.

## Production Proof At A Glance

| Proof point | Current evidence |
| --- | --- |
| Live app | https://inspectiq.pages.dev |
| No-login review | https://inspectiq.pages.dev/?review=1 starts the read-only Evaluation Workspace directly. |
| Architecture | ![AWS Architecture](docs/architecture_aws.png) |
| Real vs deterministic boundary | Live uses Cognito, API Gateway, Lambda, Neon, S3, SQS, Bedrock, and CloudWatch. Local defaults to deterministic providers for repeatable CI and interviews. |
| Role separation | Inspector captures/analyzes, Reviewer accepts/grades/finalizes, Admin monitors/recovers. See `docs/role-separated-proof.md`. |
| Real-photo evidence | Source-documented listing/dealer photo sets plus quality edge cases. See `sample-data/real-photo-evidence-pack.md` and `sample-data/IMAGE_CREDITS.md`. |
| Model evaluation | 24-case suite currently passes local thresholds for angle, OCR, damage, false positives, and retakes. See `docs/model-evaluation-report.md`. |
| Operations proof | Platform Health shows live runtime status and has Admin-only local failure simulation/recovery. |
| Visual regression | `npm run test:screenshots` captures dashboard, workbench, suggestions, damage, reports, audit, platform health, and mobile capture. |

## Repo Health And Developer Workflow

| Signal | Proof |
| --- | --- |
| CI | [InspectIQ CI](https://github.com/manynames3/inspectiq/actions/workflows/ci.yml) runs Node checks, Python grading tests, Terraform validation, and local browser E2E. |
| Live deploy | [Deploy Cloudflare Pages](https://github.com/manynames3/inspectiq/actions/workflows/deploy-cloudflare-pages.yml) builds the frontend against the AWS API URL and deploys to Pages. |
| Public live smoke | `make live-smoke` verifies the read-only dashboard, inspection detail evidence, and Platform Health on `inspectiq.pages.dev`. |
| Fast local confidence | `make verify-fast` runs full TypeScript checks and unit tests. |
| Full local confidence | `make verify-full` runs lint, typecheck, tests, vision eval, builds, Python grading, Terraform validate, and local E2E. |
| Workspace cleanup | `make clean-generated` removes generated caches without deleting `node_modules`. |

See `docs/developer-workflow.md` for when to use each command and which generated folders to avoid during agent-assisted development.

## 90-Second Demo

| Dashboard | Inspection Workbench |
| --- | --- |
| ![InspectIQ dashboard](docs/images/dashboard.png) | ![InspectIQ inspection workbench](docs/images/inspection-workbench.png) |
| AI Suggestion Review | Audit Trail |
| ![InspectIQ AI suggestion review](docs/images/suggestion-review.png) | ![InspectIQ audit trail](docs/images/audit-trail.png) |

## Live Vs Repeatable Local Path

The live authenticated path uses Cloudflare Pages, Cognito, API Gateway, Lambda, Neon Postgres, private S3 image objects, SQS image-analysis jobs, Bedrock multimodal analysis, and CloudWatch operations visibility. Local development defaults to deterministic providers and file persistence so interviews, tests, and code review stay repeatable. Both paths use the same schema contracts, state machine, reviewer approval workflow, and audit-event model.

For deployed proof with real uploaded photos, run `npm run test:live-upload` with a Cognito JWT and a required-angle photo directory. See `docs/live-production-proof.md`.

For a generated walkthrough artifact, run `npm run proof:video` against a local dev stack. It records login -> inspect -> attach evidence -> analyze -> review -> finalize -> audit -> platform health into `docs/images/inspectiq-proof.webm`.

## Engineering Iterations

InspectIQ was tightened through review passes focused on reducing walkthrough risk, production ambiguity, and end-user friction. The useful signal is not that every production feature is finished; it is that each iteration closes a concrete risk and keeps the tradeoff explainable.

| Concern found | Improvement made | Tradeoff or reasoning |
| --- | --- | --- |
| Image analysis needed stronger evidence grounding | Added source-documented vehicle photo sets, bad-capture cases, a model evaluation report, and a deployed Bedrock-shaped provider path. | Local analysis stays deterministic so CI and interviews do not fail on credentials, latency, or provider drift; the same schema contract is used for Bedrock. |
| Roles were too similar | Split Inspector, Reviewer, and Admin responsibilities in UI, API RBAC, tests, and proof docs. | Local role sessions mirror enterprise OIDC roles for repeatable walkthroughs; deployed flow uses Cognito/JWT claims. |
| Production readiness was buried in docs | Added Platform Health production proof: auth mode, role source, API URL, persistence mode, provider, queue health, latest analysis, and failed/recovered job status. | Makes architecture observable in the product instead of asking a reviewer to trust a diagram. |
| Operations story lacked a live failure path | Added Admin-only local failure simulation and recovery for image-analysis jobs. | Proves retry/DLQ thinking without injecting real AWS failures; simulation is guarded and disabled by default in production. |
| Persistence looked transitional | Moved the deployed Postgres path toward row-level upsert/delete for inspection, photo, suggestion, audit, and report hot paths. | The current bridge is credible for a hosted vertical slice; a high-concurrency production system should continue toward DB-first repositories. |
| Dense screens could regress across viewports | Added Playwright screenshot regression for dashboard, workbench, suggestions, damage, platform health, and mobile capture. | Visual proof is generated from the app instead of relying only on static screenshots. |
| Architecture could look over-scaffolded | Kept the main AWS diagram to services actually used, with inferred/planned items labeled separately in docs. | Avoids name-dropping services like Step Functions or Rekognition unless the workflow truly needs them. |
| README was too text-heavy for a first pass | Moved live URL, architecture, proof points, screenshots, real-vs-local boundary, and walkthrough commands near the top. | A recruiter can see visual proof quickly; a technical reviewer can still drill into docs and code. |

## What This Demonstrates

This repo is designed to answer a hiring manager's core question: can this engineer turn an ambiguous operational workflow into a reliable system with clear boundaries, credible tradeoffs, and a path to production?

It demonstrates:

- domain understanding of wholesale/offsite inspection workflows, CR readiness, VDP readiness, buyer trust, seller disclosure, reconditioning estimates, and arbitration risk;
- end-to-end product execution across React, TypeScript, Node, Python, Postgres schema design, REST APIs, RBAC, audit trails, and browser E2E tests;
- responsible AI design where model output is validated, treated as advisory, reviewed by humans, and kept out of buyer-facing output until confirmed;
- production architecture thinking around private S3 image storage, protected short-lived image previews, async image-analysis workers, Neon Postgres persistence, metrics, runbooks, and AWS Lambda deployment.

It does not use Cox Automotive branding, proprietary data, or unlicensed assets. Vehicle records are representative sample records, and reference imagery/local test fixtures use documented public sources in `sample-data/IMAGE_CREDITS.md`.

## Business Problem

Wholesale condition reports need consistent photo evidence, clear damage facts, explainable grading, buyer trust, seller disclosure, and accountable review. AI can speed up inspection workflows, but it should not silently become the source of truth. InspectIQ keeps AI advisory and makes reviewers confirm facts before they affect grade, CR readiness, VDP visibility, reconditioning estimates, or report output.

## AI/ML Boundary

InspectIQ uses Bedrock multimodal analysis as an advisory review layer, not as an unchecked damage authority. A multimodal model can classify photo angle, summarize visible damage, extract readable VIN/odometer text, and return schema-validated suggestions for a reviewer. The UI treats those outputs as evidence requiring human confirmation before they affect buyer-visible reports.

The `angle` or `evidence` confidence shown on photo cards means the image appears usable for the required checklist angle. It is not a guarantee that the vehicle has no damage. Damage confidence is tracked separately in reviewer suggestions and only becomes a confirmed condition item after reviewer accept/edit.

A production-grade inspection platform would use a hybrid AI/ML approach: image-quality checks for blur/glare/framing, a dedicated angle classifier, OCR tuned for VIN and odometer capture, a trained damage-detection model with measured precision/recall, and Bedrock multimodal reasoning for structured summaries, exception handling, and report language. InspectIQ keeps this boundary explicit so the demo shows responsible AI workflow design without overstating model certainty.

## Product Walkthrough

1. Open the dashboard and choose an inspection.
2. Create a new inspection when needed.
3. Use the Inspector role to attach required photo evidence or upload vehicle photos.
4. Run image analysis and validate the structured AI output.
5. Switch to the Reviewer role and resolve findings marked `Reviewer confirmation required`.
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

![AWS Architecture](docs/architecture_aws.png)

The live path is Cloudflare Pages -> Cognito -> API Gateway -> Lambda API -> Neon Postgres, private S3 image objects, SQS image-analysis jobs, Lambda image worker, Bedrock multimodal analysis, and CloudWatch operations visibility. Cloudflare Pages and Neon Postgres are external services; the AWS resources are provisioned by Terraform in `infra/terraform`.

Request flow: users sign in through Cognito, the React/Vite workbench sends JWT-authenticated REST calls through API Gateway, and the Lambda API performs schema validation, RBAC, object-level authorization, workflow persistence, and audit logging. Image uploads use presigned S3 URLs, while image-analysis jobs move through SQS to the Lambda worker before Bedrock output is validated and stored.

Deployment flow: GitHub Actions runs CI, local E2E, Python tests, Lambda packaging, and Terraform validation. The Cloudflare Pages workflow deploys the frontend with Wrangler. AWS infrastructure is Terraform-managed; the repo validates Terraform in CI, while AWS apply remains an explicit operator action.

Security: Cognito OIDC and groups drive role-aware access, API Gateway enforces JWTs on the normal API route, the separate `/api/evaluation/*` route is read-only for public review, the service repeats JWT/JWKS validation, S3 blocks public access with server-side encryption, Secrets Manager stores the Neon connection string, and Lambda IAM is scoped to required S3, SQS, Secrets Manager, and Bedrock actions.

Observability and cost controls: CloudWatch log groups, alarms, and the `inspectiq-ops` dashboard cover API errors, worker errors, API latency, SQS queue age, and DLQ depth. Bedrock calls happen on explicit analysis/report actions rather than page loads, and deterministic local providers keep CI and local development from spending on model calls.

Service selection decisions:

| Service | Decision | Rationale |
| --- | --- | --- |
| Lambda + API Gateway | Used | Fits a bursty inspection API and image worker without paying for idle container capacity. The API remains a single cohesive service until ownership, scaling, or release cadence justify splitting it. |
| Neon Postgres | Used as system of record | Inspection records, photos, suggestions, damage items, reports, users, roles, and audit events are relational and benefit from transactions, constraints, and explainable joins. |
| S3 | Used for images | Vehicle photos belong in object storage, not the database. The app stores object keys, metadata, checksums, and protected preview intents in Postgres. |
| SQS + DLQ | Used for image analysis | The current async workflow needs durable dispatch, retries, backoff, and failed-job recovery. SQS is enough for a single image-analysis worker path. |
| DynamoDB | Not used in this version | Useful later for very high-write idempotency keys, ephemeral job checkpoints, or device sync state, but not as the primary store for this relational CR workflow. |
| OpenSearch | Not used in this version | Useful once VIN/OCR/damage-note/report search, similarity search, or marketplace-scale discovery outgrows indexed Postgres queries. Current queues and tables do not need a search cluster. |
| Kinesis | Not used in this version | Useful for high-throughput streaming telemetry or auction-lane event ingestion. Current user-driven inspection events are transactional workflow events, not a continuous stream. |
| EventBridge | Deferred | Useful for publishing domain events such as `inspection.finalized` or `retake.required` to downstream systems. The current repo has one internal API/worker bounded context, so SQS keeps the operational surface smaller. |
| Step Functions | Deferred | Useful when image/report processing needs explicit waits, branches, compensation, or multi-provider fallback orchestration. Current image analysis is a straightforward queue worker path. |
| Rekognition | Deferred | Useful as a narrow OCR, label, moderation, or image-quality fallback. Bedrock is the implemented provider because the product slice needs one validated multimodal contract for angle, quality, OCR, damage reasoning, repair estimate, confidence, and reviewer routing. |

Render the diagram with:

```bash
make diagram
```

See `docs/architecture-notes.md` for the inspected source files, render prerequisites, and exclusions.

Optional logical flow:

```mermaid
flowchart LR
  Web[Cloudflare Pages React workbench] --> Auth[Cognito OIDC]
  Web --> API[API Gateway + Lambda API]
  API --> PG[Neon Postgres]
  API --> S3[Private S3 images]
  API --> SQS[SQS image jobs]
  SQS --> Worker[Lambda image worker]
  Worker --> Bedrock[Bedrock multimodal model]
  Worker --> PG
```

## Scope

This is a production-shaped reference implementation with a live hosted frontend and AWS backend. Local development still defaults to deterministic providers and file persistence for repeatable tests, while the deployed path uses Cloudflare Pages, API Gateway, Lambda, Neon Postgres, S3 presigned uploads, SQS, Bedrock multimodal analysis, Secrets Manager, Cognito resources, CloudWatch logs, alarms, and a dashboard.

Remaining production hardening is called out directly in `docs/production-readiness.md`: expand the model evaluation set with labeled production images, mature the image pipeline, move the highest-concurrency persistence paths to DB-first repositories, prove queue/DLQ recovery, and add environment promotion/rollback automation.

For the concise interview explanation, see `docs/implementation-boundary.md`.

## Documentation Map

- `docs/hiring-manager-brief.md`: business framing, stack mapping, walkthrough, and production next steps.
- `docs/developer-workflow.md`: verification ladder, CI alignment, generated-folder guidance, and live proof commands.
- `docs/architecture.md`: component boundaries, runtime flow, data ownership, and failure handling.
- `docs/implementation-boundary.md`: what is real in the repo, what is deterministic locally, and how to explain it.
- `docs/production-readiness.md`: implemented proof, remaining production gates, and the honest interview framing.
- `docs/state-machine.md`: workflow states and legal transitions.
- `docs/image-analysis-contract.md`: model output contract, schema validation, and reviewer routing.
- `docs/live-production-proof.md`: deployed uploaded-photo proof for Cognito, S3, SQS, Bedrock, Neon persistence, reviewer approval, report finalization, and audit events.
- `docs/role-separated-proof.md`: Inspector, Reviewer, and Admin proof paths.
- `docs/vision-evaluation.md`: image-analysis evaluation set, metrics, thresholds, and promotion command.
- `docs/model-evaluation-report.md`: current evaluation metrics, coverage, failure cases, and promotion standard.
- `docs/ai-governance.md`: prompt/version metadata, human review, and audit posture.
- `docs/aws-deployment-plan.md`: AWS production shape and migration path.
- `docs/security.md`, `docs/observability.md`, `docs/runbook.md`: operational hardening notes.
- `sample-data/real-photo-evidence-pack.md`: source-documented reference vehicles and bad-capture examples.

## Real Vs Deterministic Local

| Area | Implemented in this repo | Production replacement |
| --- | --- | --- |
| Inspection workflow | Working React/TypeScript UI, role-aware actions, REST API, state machine, audit trail | Same workflow behind enterprise auth, object-level authorization, and operational SLAs |
| Image analysis | Deterministic local provider plus deployed SQS -> Lambda -> Bedrock multimodal provider using the same strict schema contract and `npm run eval:vision` evaluation set; outputs remain advisory until reviewer confirmation | Larger labeled evaluation corpus, calibrated angle/OCR/damage metrics, dedicated image-quality and damage-detection models, and provider fallback policy |
| Persistence | In-memory tests, local JSON snapshot, and deployed `PERSISTENCE_MODE=postgres` against Neon with row-level upsert/delete transactions | Direct DB-first repositories for the highest-concurrency production paths, retention, backups, and audit durability |
| Image storage | Deployed presigned S3 upload intent, private S3 objects, protected preview intent, object key metadata, MIME type, byte size, and checksum capture | EXIF stripping, image normalization, thumbnails, lifecycle, KMS key policy, and CDN/object access policy hardening |
| Python grading | Optional FastAPI service plus identical Node fallback for deterministic local reliability | Keep separate only when grading rules need independent ownership, versioning, or reuse |
| Report generation | Async-shaped job model with deterministic local provider | Dedicated queue or Step Functions orchestration only if report retries, waits, and branch logic justify the extra control plane |

## Tech Stack

- React, TypeScript, Vite, React Router, CSS.
- Node.js, Express, Zod, structured logging, request IDs.
- Shared TypeScript schemas.
- Python FastAPI grading service.
- Postgres schema and Drizzle table definitions.
- Optional Postgres persistence mode using the existing `pg` client.
- Local file snapshot persistence plus Neon Postgres persistence for the deployed backend.
- S3-style image storage interface.
- Queue-backed image analysis jobs and async-shaped report jobs.
- Provider interfaces with deterministic local AI and Bedrock implementations.
- Vitest, Supertest, React Testing Library, pytest.
- Terraform-managed AWS Lambda, API Gateway, S3, SQS/DLQ, Secrets Manager, Cognito, CloudWatch alarms, and dashboard.

## Local Setup

```bash
npm install
npm run dev
```

Open:

- Web: `http://localhost:5173`
- API health: `http://localhost:4000/api/health`

Optional Python service:

```bash
cd services/grading-python
python -m pip install -r requirements.txt
uvicorn app.main:app --reload --port 8080
```

The API falls back to equivalent local grading rules when the Python service is not running so the inspection workflow remains usable.

## Environment Variables

Copy `.env.example` to `.env` if you want to customize:

- `PORT`
- `WEB_ORIGIN`
- `VISION_PROVIDER=local|bedrock`
- `REPORT_PROVIDER=local|bedrock`
- `GRADING_SERVICE_URL`
- `PERSISTENCE_MODE=file|memory|postgres`
- `ENABLE_REFERENCE_EVIDENCE=true|false`
- `ENABLE_EVALUATION_MODE=true|false`
- `INSPECTIQ_STORE_FILE`
- `DATABASE_URL`
- `IMAGE_BUCKET`
- `PG_POOL_SIZE`
- `PG_IDLE_TIMEOUT_MS`
- `AUTH_MODE=jwt`
- `OIDC_ISSUER`
- `OIDC_AUDIENCE`
- `DEFAULT_AUTH_ROLE=inspector`
- `REQUIRE_JWT_ROLE_CLAIM=false|true`
- `AUTH_ADMIN_EMAILS`
- `AUTH_REVIEWER_EMAILS`
- `AUTH_INSPECTOR_EMAILS`
- `VITE_AUTH_MODE=oidc`
- `VITE_DEFAULT_AUTH_ROLE=inspector`
- `VITE_ENABLE_REFERENCE_EVIDENCE=true|false`
- `VITE_ENABLE_EVALUATION_MODE=true|false`
- `VITE_COGNITO_DOMAIN`
- `VITE_COGNITO_CLIENT_ID`

Postgres mode:

```bash
export PERSISTENCE_MODE=postgres
export DATABASE_URL='postgres://user:password@localhost:5432/inspectiq'
npm run dev:api
```

The API applies `apps/api/src/db/schema.sql` on startup, loads existing rows, and persists workflow mutations back to Postgres. Local file mode remains the default for reliable interview walkthroughs.

Refresh reference inspection data:

```bash
npm run seed
PERSISTENCE_MODE=postgres DATABASE_URL='postgres://user:password@host/db' npm run seed
```

The seed command replaces the persisted reference queue with VIN-specific listing evidence for the listed vehicles. VIN plate and odometer closeups are generated per vehicle only when the public listing does not expose that required angle. Deployed AWS infrastructure sets `ENABLE_REFERENCE_EVIDENCE=false`; production users upload captured photos instead of loading reference sets through the UI.

Vision evaluation:

```bash
npm run eval:vision
AWS_REGION=us-east-1 VISION_PROVIDER=bedrock BEDROCK_VISION_FALLBACK=fail npm run eval:vision
```

The evaluation command runs `evals/vision-eval-set.json` against the configured provider and reports angle accuracy, OCR accuracy, damage recall/type accuracy, damage false-positive rate, retake precision, and retake recall.

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
npm run typecheck
npm run lint
npm run build
```

Run the browser E2E flow against a clean memory-backed dev stack:

```bash
PERSISTENCE_MODE=memory npm run dev
npm run test:e2e
```

The API tests cover the full create-to-finalize flow, upload intent metadata, image-analysis job records, readiness blockers, schema validation failures, evidence completeness gates, AI suggestion review, SLA assignment metadata, audit trail events, buyer-ready report export, and post-finalization immutability guards. The browser E2E script covers role-specific dashboard context, create -> attach photos -> analyze -> reviewer SLA queue -> reviewer acceptance -> grade -> draft report -> finalize -> export buyer report -> audit verification through the rendered React app.

Capture viewport regression evidence:

```bash
PERSISTENCE_MODE=memory npm run dev
npm run test:screenshots
```

This writes dashboard, inspection workbench, suggestions queue, damage, reports, audit, platform health, and mobile capture screenshots to `docs/images/regression`.

Generate the 90-second walkthrough artifact:

```bash
PERSISTENCE_MODE=memory npm run dev
npm run proof:video
```

This writes `docs/images/inspectiq-proof.webm` and records the role-separated local flow from login through finalization and Platform Health.

Run the deployed uploaded-photo proof against Cognito, S3, SQS, Bedrock, Neon persistence, reviewer approval, report finalization, and audit events:

```bash
npm run prepare:live-photos -- --out /tmp/inspectiq-live-photos-ford

LIVE_API_BASE_URL=https://imml0cczh7.execute-api.us-east-1.amazonaws.com \
LIVE_ID_TOKEN="$(cat /tmp/inspectiq-live-auth/inspector.idtoken)" \
LIVE_REVIEWER_TOKEN="$(cat /tmp/inspectiq-live-auth/reviewer.idtoken)" \
LIVE_REQUIRE_SEPARATE_ROLES=true \
LIVE_PHOTO_DIR=/tmp/inspectiq-live-photos-ford \
npm run test:live-upload
```

See `docs/live-production-proof.md` for the AWS CLI commands that mint separate Inspector and Reviewer JWTs from Cognito. The proof fails if it uses inline/sample evidence, misses Bedrock analysis, skips reviewer confirmation, leaves buyer-visible release blocked, or lacks required audit events.

Python tests:

```bash
cd services/grading-python
python -m pip install -r requirements.txt
python -m pytest
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

Local review uses role-aware UI controls and API RBAC for Inspector, Reviewer, and Admin workflows. The deployed path uses Cognito hosted OIDC, API Gateway JWT enforcement, Lambda-side JWT/JWKS validation, Cognito group or role-claim mapping, optional email-based bootstrap role mapping for owner/operator accounts, least-privilege Inspector fallback for authenticated users without an app role claim, object-level authorization, S3 presigned uploads, protected short-lived image preview URLs, encrypted S3 storage, Secrets Manager, and least-privilege IAM. Set `REQUIRE_JWT_ROLE_CLAIM=true` after Cognito groups are fully managed to fail closed on unmapped missing role claims.

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

The Terraform in `infra/terraform` deploys the AWS resources used by the live backend. Cognito groups and the API Gateway JWT authorizer are enabled by default for the authenticated Pages walkthrough.

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
- JWT verification path and object-level inspection authorization tests.
- Vision evaluation thresholds for angle, OCR, damage false positives, and retake quality.

## Production Tradeoffs

I would discuss:

- Keep the current deterministic row-delta Postgres store bridge for the hosted walkthrough; move hot paths to direct DB-first repository methods before high-concurrency multi-reviewer production use.
- Keep Python grading separate only if condition rules are independently owned, versioned, or reused outside the Node API.
- Stay on Lambda for the current bursty image-analysis worker; consider containers only if native image tooling or runtime duration outgrows Lambda limits.
- Treat Bedrock output as untrusted input: validate schemas, store raw and validated output, and require human confirmation before facts affect reports.
- Use presigned S3 uploads with MIME validation, object-level authorization, checksum capture, and lifecycle policies.
- Add reviewer queues and SLA metrics only after the core evidence-to-report workflow is stable.
- Put audit events in durable relational storage with append-only conventions before using this for compliance.

## Future Improvements

- Larger labeled model evaluation set with production-like auction photos and confidence calibration.
- Reviewer queue with assignment and SLA filters.
- Thumbnail generation and image metadata extraction.
- Alarm notification targets and dashboard promotion across dev/stage/prod.
- Cross-browser frontend flow tests.

## Resume Bullets

See `docs/resume-bullets.md` for short, technical, and business-impact versions.
