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
| Real vs deterministic boundary | Live uses Cognito, Lambda, Neon, S3, SQS, Bedrock, EventBridge, a Python projector, DynamoDB, and CloudWatch. Local defaults to deterministic providers for repeatable CI. |
| Role separation | Inspector captures/analyzes, Reviewer resolves findings/grades/approves/finalizes, and Admin monitors/replays/recoveries. See `docs/role-separated-proof.md`. |
| Real-photo evidence | Source-documented listing/dealer photo sets plus quality edge cases. See `sample-data/real-photo-evidence-pack.md` and `sample-data/IMAGE_CREDITS.md`. |
| Model evaluation | A reproducible 108-image challenge corpus (12 independent sources x 9 variants) gates schema, angle, OCR, damage, and retake behavior. Local CI is contract proof; real Bedrock runs are manual promotion evidence. |
| Operations proof | Platform Health shows outbox delivery, EventBridge/DLQ state, projector health, duplicate suppression, model usage, and Admin replay/recovery controls. |
| Visual regression | `npm run test:screenshots` captures dashboard, workbench, suggestions, damage, reports, audit, platform health, and mobile capture. |

## Repo Health And Developer Workflow

| Signal | Proof |
| --- | --- |
| CI | [InspectIQ CI](https://github.com/manynames3/inspectiq/actions/workflows/ci.yml) runs Node/web/mobile checks, Python grading/projector tests, Postgres integration, Terraform validation, browser E2E, and visual regression. |
| Live deploy | [Deploy Cloudflare Pages](https://github.com/manynames3/inspectiq/actions/workflows/deploy-cloudflare-pages.yml) builds the frontend against the AWS API URL and deploys to Pages. |
| Public live smoke | `make live-smoke` verifies the read-only dashboard, inspection detail evidence, and Platform Health on `inspectiq.pages.dev`. |
| Fast local confidence | `make verify-fast` runs full TypeScript checks and unit tests. |
| Full local confidence | `make verify-full` runs lint, typecheck, tests, vision contract evaluation, builds, Python services, Terraform validation, browser E2E, and visual regression. |
| Workspace cleanup | `make clean-generated` removes generated caches without deleting `node_modules`. |

See `docs/developer-workflow.md` for when to use each command and which generated folders to avoid during agent-assisted development.

## 90-Second Demo

| Dashboard | Inspection Workbench |
| --- | --- |
| ![InspectIQ dashboard](docs/images/dashboard.png) | ![InspectIQ inspection workbench](docs/images/inspection-workbench.png) |
| AI Suggestion Review | Audit Trail |
| ![InspectIQ AI suggestion review](docs/images/suggestion-review.png) | ![InspectIQ audit trail](docs/images/audit-trail.png) |

## Live Vs Repeatable Local Path

The live authenticated path uses Cloudflare Pages, Cognito, API Gateway, Lambda, Neon Postgres, private S3 image objects, SQS image-analysis jobs, Bedrock multimodal analysis, EventBridge domain events, a Python operations-projector Lambda, DynamoDB operational projections, and CloudWatch/X-Ray visibility. Local development defaults to deterministic providers and file persistence so tests and code review stay repeatable. Both paths use the same schema contracts, state machine, reviewer approval workflow, and audit-event model.

For deployed proof with real uploaded photos, run `npm run test:live-upload` with a Cognito JWT and a required-angle photo directory. See `docs/live-production-proof.md`.

For a generated walkthrough artifact, run `npm run proof:video` against a local dev stack. It records login -> inspect -> attach evidence -> analyze -> review -> finalize -> audit -> platform health into `docs/images/inspectiq-proof.webm`.

## Engineering Iterations

InspectIQ was tightened through review passes focused on reducing walkthrough risk, production ambiguity, and end-user friction. The useful signal is not that every production feature is finished; it is that each iteration closes a concrete risk and keeps the tradeoff explainable.

| Concern found | Improvement made | Tradeoff or reasoning |
| --- | --- | --- |
| Image analysis needed stronger evidence grounding | Added source-documented vehicle photo sets, bad-capture cases, a model evaluation report, and a deployed Bedrock multimodal provider. | Local analysis stays deterministic so CI and interviews do not fail on credentials, latency, or provider drift; the same schema contract is used for Bedrock. |
| Reference data could be mistaken for model output | Separated source-manifest mappings from Bedrock/local analysis, removed unsupported Ford/Nissan/Honda damage claims, stopped metadata-derived OCR, and added startup reconciliation plus audit corrections. | A source photo, declared checklist slot, model finding, and reviewer-confirmed fact are different evidence classes; the UI and metrics must never collapse them into one claim. |
| Evaluation labels overstated visible damage | Replaced a mislabeled Prius "severe dent," a duplicated clean-panel "scratch," and duplicate interior pixels with 12 hash-distinct, source-documented offline cases. | Ground truth must be defensible from pixels, provenance, and dataset identity; evaluator assets are not operational inspection evidence. |
| The first live positive case was not representative of U.S. wholesale inventory | Replaced the public proof record with a source-attributed 2022 Ford Escape SE from Copart lot `51175056`; Bedrock identified the visible rear collision damage at 98% confidence and a Reviewer accepted it. | Marketplace evidence is operationally relevant, but its images stay out of Git. The listing's wide VIN-label image is retained as retake-quality evidence; the full VIN is accepted only after a lot/mileage match and an independent NHTSA check-digit decode. |
| A low-quality VIN image was also labeled as an analysis failure | Split completed-but-unusable evidence from true provider/job failure in readiness logic and added regression coverage. | A retake needs field recapture; an analysis failure needs retry or operator recovery. Combining them gives users the wrong action and corrupts operational metrics. |
| Roles were too similar | Split Inspector, Reviewer, and Admin responsibilities in UI, API RBAC, tests, and proof docs. | Local role sessions mirror enterprise OIDC roles for repeatable walkthroughs; deployed flow uses Cognito/JWT claims. |
| Field capture needed a production-shaped mobile path | Added an Expo/React Native client with Cognito PKCE, SecureStore sessions, SQLite assignment/upload queues, offline capture, idempotent sync, local quality guidance, and role-specific workflows. | Only capture is offline-capable; reviewer, grading, report, and admin mutations remain online to avoid unsafe conflict resolution on buyer-visible facts. |
| Android tab controls overlapped three-button system navigation | Made the native tab bar bottom-inset aware and added layout coverage for devices with and without a system-navigation inset. | Safe areas are a functional input boundary, not cosmetic padding; controls must remain tappable across gesture and button navigation modes. |
| Clean-runner CI exposed local-cache, emulator, and renderer assumptions | Added workflow contract tests, made mobile/APK verification build shared contracts first, configured KVM before Maestro, handled the API 35 emulator's launcher-only ANR before product assertions, moved Gradle initialization behind Expo's native-project boundary, fixed test time/order, and reviewed separate macOS/Linux visual baselines. | Generated `android/` files stay out of source control, hardware acceleration avoids unreliable software-emulator timeouts, emulator operating-system failures remain distinct from app failures, and each renderer keeps its own approved 3% visual gate. |
| Async operations needed durable delivery semantics | Added a transactional Postgres outbox, EventBridge domain events, a Python operations-projector Lambda, DynamoDB idempotency/projections, an SQS DLQ, replay controls, and correlation IDs. | Neon remains authoritative; DynamoDB is limited to disposable operational projections and duplicate suppression rather than becoming a second system of record. |
| A DynamoDB authorization failure looked like a spent model budget | Distinguished true quota exhaustion from reservation infrastructure failures and granted the Lambda role the table-scoped `PutItem`/`UpdateItem` actions required by transactional usage reservations. | Cost controls must fail closed, but operators need the real failure category; otherwise an IAM defect is misdiagnosed as normal FinOps enforcement. |
| Concurrent Lambda cold starts exposed boot-time write contention | Made loaded Postgres cold starts read-only and covered bootstrap persistence decisions with regression tests; repaired reference evidence is persisted only with an explicit mutation or initialization path. | Parallel GET and CORS preflight traffic must never become an implicit database write workload; business mutations retain the transactional row/version checks. |
| Live apply exposed the account's 10-concurrency Lambda quota | Kept the projector on unreserved concurrency instead of adding a reservation AWS cannot honor while preserving its 10-execution safety pool. | EventBridge retry limits, idempotent DynamoDB writes, low user-driven event volume, and DLQ replay bound risk without claiming an unavailable quota or adding idle infrastructure. |
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

The `angle` confidence shown for an actual model run means the image appears usable for the required checklist angle. It is not a guarantee that the vehicle has no damage. Reference listing images are shown as source-manifest mappings without an AI confidence percentage. Damage confidence is tracked separately in model findings and only becomes a confirmed condition item after reviewer accept/edit.

Reference evidence is never presented as model inference. Source manifests provide the vehicle/photo association and intended checklist slot; a reviewer confirms that mapping. Reference metadata is not converted into OCR output, and the seeded queue contains no confirmed damage unless the linked image visibly supports the claim. Real Bedrock results remain distinct through provider, model, prompt, latency, token, cost, and audit metadata.

A production-grade inspection platform would use a hybrid AI/ML approach: image-quality checks for blur/glare/framing, a dedicated angle classifier, OCR tuned for VIN and odometer capture, a trained damage-detection model with measured precision/recall, and Bedrock multimodal reasoning for structured summaries, exception handling, and report language. InspectIQ keeps this boundary explicit so the walkthrough shows responsible AI workflow design without overstating model certainty.

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
12. Edit, approve, and explicitly confirm finalization as a reviewer.
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

The live path is Cloudflare Pages or Expo/React Native -> Cognito -> API Gateway -> Lambda API -> Neon Postgres, private S3 evidence, and SQS/Lambda/Bedrock image analysis. Transactional outbox events publish to EventBridge; a Python 3.12 Lambda projects idempotent operational state into on-demand DynamoDB. Cloudflare Pages and Neon are external managed services; Terraform provisions the AWS resources in `infra/terraform`.

Request flow: users sign in through Cognito OIDC/PKCE, clients send JWT-authenticated REST calls through API Gateway, and the Lambda API validates Cognito JWT/JWKS claims before schema validation, RBAC, object authorization, relational persistence, and audit logging. Image uploads use presigned S3 URLs; analysis jobs move through SQS to a bounded-concurrency worker before Bedrock output is schema-validated and stored as advisory findings.

Deployment flow: GitHub Actions runs CI, Postgres integration, browser/mobile checks, Python tests, Lambda packaging, and Terraform validation. The `production` environment records the plan artifact and requires an explicit `apply` workflow input; Wrangler deploys the web client. Android CI builds an x86_64 Maestro test APK and a separate installable arm64 APK.

Security: Cognito OIDC and groups drive role-aware access. The Lambda service validates JWT/JWKS claims on protected API calls and applies object-level authorization; the separate `/api/evaluation/*` surface is read-only. S3 blocks public access with encryption enabled, Secrets Manager stores the Neon URL, mobile tokens use SecureStore, and IAM is scoped by runtime role. The HTTP API has a JWT authorizer resource, but the current catch-all routing deliberately relies on service-side validation so public health/evaluation routes can share one integration; this is documented rather than presented as gateway enforcement.

Observability and cost controls: CloudWatch/X-Ray, 30-day log retention, alarms, SNS notifications, and the `inspectiq-ops` dashboard cover API/worker/projector errors, latency, SQS age, both DLQs, pending outbox age, Bedrock throttling, and cost-guard rejections. DynamoDB conditionally reserves each model operation before a call and enforces monthly defaults of 250 image analyses and 50 report drafts. An AWS Budget alerts at $25 forecast, $40 actual, and the $50 monthly ceiling.

Service selection decisions:

| Service | Decision | Rationale |
| --- | --- | --- |
| Lambda + API Gateway | Used | Fits a bursty inspection API and image worker without paying for idle container capacity. The API remains a single cohesive service until ownership, scaling, or release cadence justify splitting it. |
| Neon Postgres | Used as system of record | Inspection records, photos, suggestions, damage items, reports, users, roles, and audit events are relational and benefit from transactions, constraints, and explainable joins. |
| S3 | Used for images | Vehicle photos belong in object storage, not the database. The app stores object keys, metadata, checksums, and protected preview intents in Postgres. |
| SQS + DLQ | Used for image analysis | The current async workflow needs durable dispatch, retries, backoff, and failed-job recovery. SQS is enough for a single image-analysis worker path. |
| DynamoDB | Used for operational projection | Event idempotency, a 30-day operational timeline, latest projected inspection state, and monthly Bedrock reservations use on-demand capacity and TTL. Neon remains authoritative. |
| OpenSearch | Not used in this version | Useful once VIN/OCR/damage-note/report search, similarity search, or marketplace-scale discovery outgrows indexed Postgres queries. Current queues and tables do not need a search cluster. |
| Kinesis | Not used in this version | Useful for high-throughput streaming telemetry or auction-lane event ingestion. Current user-driven inspection events are transactional workflow events, not a continuous stream. |
| EventBridge | Used for domain events | Versioned inspection, upload, analysis, retake, review, and report events fan out to the Python projector with bounded retries and an SQS DLQ. SQS remains the work queue for image analysis. |
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
  Clients[React web and Expo mobile] --> Auth[Cognito OIDC and PKCE]
  Clients --> API[API Gateway and Lambda API]
  API --> PG[Neon Postgres]
  API --> S3[Private S3 images]
  API --> SQS[SQS image jobs]
  SQS --> Worker[Lambda image worker]
  Worker --> Bedrock[Bedrock multimodal model]
  Worker --> PG
  API --> Bus[EventBridge domain bus]
  Worker --> Bus
  Bus --> Projector[Python projector Lambda]
  Projector --> DDB[DynamoDB operations projection]
```

## Scope

This is a production-shaped reference implementation with hosted web and AWS backend paths plus a native Expo client. Local development defaults to deterministic providers and file persistence; the deployed path includes Lambda, Neon, S3, SQS, Bedrock, EventBridge, the Python operations projector, DynamoDB, Cognito, Secrets Manager, CloudWatch/X-Ray, alarms, and recovery controls.

Remaining production hardening is called out directly in `docs/production-readiness.md`: replace the 12-source challenge base with a statistically representative, independently labeled field corpus; continue the row-delta store bridge toward aggregate-specific DB-first repositories; and collect real inspector/reviewer feedback plus sustained load, reliability, and seven-day idle-cost evidence.

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
| Image analysis | Deterministic CI provider plus deployed SQS -> Lambda -> Bedrock provider using one strict schema; metadata records model, prompt, latency, tokens, cost, fallback, and failure category | Promote models only after the manual Bedrock run passes a larger independently labeled field corpus and calibrated thresholds |
| Persistence | In-memory tests, durable local snapshots, numbered migrations, and deployed Neon row-delta transactions with conditional versions for inspections, suggestions, and reports | Replace the remaining hydrated store bridge with aggregate-specific DB-first repositories before high-concurrency production use |
| Image storage | Presigned private S3 uploads with stable operation IDs, checksum/metadata capture, protected previews, lifecycle cleanup, and mobile normalization/EXIF removal | Add production thumbnail/CDN policy and retention/legal-hold rules driven by actual customers |
| Domain events | Transactional Postgres outbox -> EventBridge -> Python projector -> idempotent DynamoDB state, with TTL, retry, DLQ, health, and replay | Add consumers only when another bounded context has a real ownership or integration requirement |
| Python grading | Optional FastAPI service plus identical Node fallback for deterministic local reliability | Keep separate only when grading rules need independent ownership, versioning, or reuse |
| Report generation | Async-shaped job model with deterministic local provider | Dedicated queue or Step Functions orchestration only if report retries, waits, and branch logic justify the extra control plane |

## Tech Stack

- React, TypeScript, Vite, React Router, CSS; Expo/React Native with native camera and offline capture.
- Node.js, Express, Zod, structured logging, request IDs.
- Shared TypeScript schemas.
- Python FastAPI grading service.
- Postgres schema and Drizzle table definitions.
- Optional Postgres persistence mode using the existing `pg` client.
- Local file snapshot persistence plus Neon Postgres persistence for the deployed backend.
- S3-style image storage interface.
- SQS image jobs, EventBridge domain events, and an idempotent Python 3.12 DynamoDB projector.
- Provider interfaces with deterministic local AI and Bedrock implementations.
- Vitest, Supertest, React Testing Library, pytest.
- Terraform-managed AWS Lambda, API Gateway, S3, SQS/DLQs, EventBridge, DynamoDB, Secrets Manager, Cognito, SNS, CloudWatch/X-Ray, budget, alarms, and dashboard.

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
- `IMAGE_ANALYSIS_QUEUE_URL`
- `DOMAIN_EVENT_BUS_NAME`
- `DOMAIN_EVENT_DLQ_URL`
- `OPERATIONS_TABLE_NAME`
- `BEDROCK_MONTHLY_IMAGE_LIMIT`
- `BEDROCK_MONTHLY_REPORT_LIMIT`
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
- `identity_verifications`
- `condition_grades`
- `ai_report_jobs`
- `ai_report_drafts`
- `final_reports`
- `report_versions`
- `audit_events`
- `domain_events`
- `schema_migrations`

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
-> schema validation -> Postgres suggestions/audit/outbox -> EventBridge
-> Python projector -> idempotent DynamoDB operations state
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

AI never approves or finalizes reports. A Reviewer must resolve blockers, approve an exact report version with a comment, and separately confirm finalization; stale versions return `409 VERSION_CONFLICT`.

## Human-In-The-Loop Governance

- Suggestions stay pending until reviewed.
- Edited suggestions remain review records until a reviewer explicitly accepts them.
- Only accepted suggestions become facts.
- Damage candidates create damage items only after acceptance.
- Low confidence or missing evidence forces human review.
- Finalization requires valid state, complete evidence, and an approved current report version.
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

The API tests cover the full create-to-finalize flow, idempotent mobile uploads, optimistic conflicts, report approval/versioning, analysis metadata, readiness blockers, schema failures, reviewer assignments, domain outbox events, audit history, export, and post-finalization immutability. Browser E2E covers create -> attach -> analyze -> assign/review -> grade -> draft -> approve -> finalize -> export -> audit through the rendered React app. Mobile tests cover role claims, session behavior, offline retry, local quality policy, and native inspection cards; the Android workflow runs a Maestro Evaluation Workspace journey.

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

The deployed Python projector is tested separately:

```bash
make verify-projector
```

## Observability

Implemented across local and deployed paths: correlation/request IDs, structured logs, model/prompt/token/cost metadata, audit and domain events, X-Ray tracing, Platform Health projections, DLQ state/replay, CloudWatch metrics/alarms, and optional SNS email notifications.

Production metrics include image analysis success rate, image retake rate, image-analysis queue latency, missing required angle rate, human review rate, grade generation latency, report finalization rate, suggestion acceptance rate, buyer-visible ready rate, and p95 API latency.

## Security

Local review uses role-aware sessions and API RBAC. The deployed path uses Cognito OIDC/PKCE, Lambda-side JWT/JWKS validation, group/role claims, object-level inspection authorization, SecureStore on mobile, stable upload idempotency keys, private S3 presigned uploads, short-lived protected previews, encryption, Secrets Manager, and scoped IAM. Set `REQUIRE_JWT_ROLE_CLAIM=true` when group provisioning is fully managed to fail closed on unmapped claims. API Gateway currently routes the catch-all integration without route-level authorization so health/evaluation and protected endpoints can coexist; protected routes still fail closed in the Lambda service.

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
-> Postgres audit + domain outbox
-> EventBridge
-> Python operations projector
-> DynamoDB operational view
```

Terraform in `infra/terraform` defines the live backend, Cognito groups, custom EventBridge bus, Python projector, DynamoDB operations table, alarms, budget, and GitHub OIDC deploy role. The JWT authorizer resource exists for future route decomposition; current protected catch-all requests are enforced by Lambda-side JWT validation.

## Cost Awareness

Major drivers:

- S3 image storage.
- Multimodal image-analysis calls.
- Report-generation tokens.
- API/worker compute.
- Neon Postgres compute/storage.
- CloudWatch logs.

For 1,000 inspections with 10 images each, model calls dominate variable cost. Local deterministic providers avoid CI spend; deployed Bedrock calls require an explicit user action and an idempotent DynamoDB reservation. The stack uses on-demand/scale-to-zero services, bounded Lambda concurrency, 30-day logs, default model quotas, and a $50 monthly AWS budget rather than always-on OpenSearch or container capacity.

## Failure Handling

Handled or documented:

- Unsupported file type validation.
- Provider failure records.
- Invalid schema rejection.
- Unknown photo angle routing.
- Image quality retake policy.
- Duplicate analysis handling.
- Duplicate EventBridge suppression and domain-event DLQ replay.
- Monthly model-call guardrails with `429 COST_GUARD_REACHED`.
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

- Independent field data with adjudicated labels and real Bedrock promotion results by model/prompt version.
- Real inspector/reviewer usability studies, measured task time, and sustained workload/SLO evidence.
- Aggregate-specific DB-first repositories replacing the remaining row-delta store bridge.
- Production thumbnail/CDN and evidence retention/legal-hold policies.
- A second environment only when release volume justifies its idle and operational cost.

## Resume Bullets

See `docs/resume-bullets.md` for short, technical, and business-impact versions.
