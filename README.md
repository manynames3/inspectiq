# InspectIQ

[![CI](https://github.com/manynames3/inspectiq/actions/workflows/ci.yml/badge.svg)](https://github.com/manynames3/inspectiq/actions/workflows/ci.yml)

Vehicle inspection and imaging workflow for wholesale and offsite operations.

[Live app](https://inspectiq.pages.dev) | [No-login review](https://inspectiq.pages.dev/?review=1) | [Architecture](docs/architecture.md) | [Production boundary](docs/implementation-boundary.md)

InspectIQ helps inspection teams collect complete photo evidence, review AI-assisted findings, and release an auditable condition report. AI suggests; a human decides what becomes a vehicle fact.

## The Problem

Wholesale condition reports break down when evidence is incomplete or inconsistent:

- required angles are missing or unusable;
- VIN and odometer evidence cannot be verified;
- reviewers spend time finding the right photo for each issue;
- damage descriptions and recon estimates vary by reviewer;
- buyers cannot trace a disclosure back to its evidence and approval history.

InspectIQ keeps capture, analysis, review, grading, reporting, and audit history in one workflow.

## Users

| Role | Primary job |
| --- | --- |
| Inspector | Capture required evidence, resolve retakes, and submit photos for analysis. |
| Reviewer | Confirm, edit, or reject findings; grade the vehicle; approve the report. |
| Admin | Manage exceptions, monitor the platform, and recover failed work. |

## Workflow

1. Create or receive an assigned inspection.
2. Capture the required vehicle angles on web or mobile.
3. Upload privately to S3 and queue analysis through SQS.
4. Validate Bedrock output against a strict schema.
5. Require a Reviewer decision before a finding becomes confirmed damage or identity evidence.
6. Grade the inspection, approve the report version, and release it when all blockers are resolved.
7. Preserve uploads, model runs, decisions, corrections, and finalization in the audit trail.

## Product Views

| Inspection queue | Inspection workbench |
| --- | --- |
| ![InspectIQ inspection queue](docs/images/regression/dashboard.png) | ![InspectIQ inspection workbench](docs/images/regression/inspection-workbench.png) |

## Live Proof

| Proof | Evidence |
| --- | --- |
| Public walkthrough | The read-only [Evaluation Workspace](https://inspectiq.pages.dev/?review=1) requires no credentials. |
| Authenticated workflow | Cognito roles separate Inspector, Reviewer, and Admin actions. See [role-separated proof](docs/role-separated-proof.md). |
| Real image analysis | A Copart marketplace photo moved through private S3, SQS, Lambda, Bedrock, schema validation, and Reviewer acceptance before becoming a confirmed damage record. See [the recorded model trace](evals/marketplace-bedrock-proof.json). |
| Operations | Platform Health exposes queue state, outbox delivery, EventBridge/DLQ status, projector health, model usage, and recovery controls. |
| Verification | CI runs TypeScript, Python, Postgres integration, browser E2E, visual regression, mobile, and Terraform checks. |

The marketplace run is one traceable workflow proof, not an accuracy benchmark. The source image is not committed to this repository.

## Architecture

![AWS Architecture](docs/architecture_aws.png)

```text
React web / Expo mobile
        |
    Cognito JWT
        |
API Gateway -> Node.js Lambda -> Neon Postgres
        |              |
        |              +-> outbox -> EventBridge -> Python projector -> DynamoDB
        |
        +-> private S3 -> SQS -> image worker Lambda -> Bedrock
```

### Service Boundaries

- **Neon Postgres** is the business system of record.
- **S3** stores private photo evidence; clients use presigned uploads and short-lived previews.
- **SQS** isolates image upload from model latency and supports retry and DLQ recovery.
- **Bedrock** returns advisory angle, quality, OCR, and damage findings.
- **EventBridge** carries versioned domain events from the transactional outbox.
- **DynamoDB** holds idempotency records, operational timelines, and model-usage reservations. It is not a second business database.
- **CloudWatch and X-Ray** cover logs, metrics, traces, alarms, and the operations dashboard.

Why other AWS services were deferred is documented in [ADR 0009](docs/adr/0009-aws-orchestration-and-vision-services.md).

## AI Boundary

Bedrock is an advisory provider, not the source of truth.

- Raw and validated model output are stored separately.
- Invalid output fails schema validation.
- Model, prompt, latency, token, cost, and fallback metadata are recorded.
- VIN or odometer text is not accepted unless it is legible and reviewed.
- Damage candidates become damage items only after Reviewer acceptance or correction.
- Buyer-facing reports exclude model payloads and internal confidence details.

Local development uses deterministic providers so tests remain repeatable. The deployed path uses S3, SQS, Lambda, and Bedrock with the same contracts.

Read the [image-analysis contract](docs/image-analysis-contract.md), [AI governance notes](docs/ai-governance.md), and [model evaluation report](docs/model-evaluation-report.md).

## Mobile Capture

The Expo/React Native client provides:

- required-angle camera overlays;
- post-capture resolution, exposure, glare, and blur guidance;
- offline photo storage in the application sandbox;
- SQLite-backed upload operations with stable IDs and checksums;
- bounded retry and visible blocked-upload states;
- Cognito Authorization Code + PKCE and SecureStore sessions.

Only capture works offline. Review, grading, reporting, and administrative mutations require a connection.

## Run Locally

Requirements: Node.js 22+, npm, and Python 3.12 for the Python services.

```bash
cp .env.example .env
npm ci
npm run seed
npm run dev
```

Open `http://localhost:5173`.

Local development defaults to in-memory or file persistence and deterministic providers. See [developer workflow](docs/developer-workflow.md) for Postgres, Cognito, AWS, and mobile setup.

## Verify

```bash
make verify-fast             # TypeScript build, typecheck, and unit tests
make verify-full             # Full local suite, E2E, visual checks, Python, Terraform
make verify-production-proof # Live-review verification ladder
```

Useful targeted commands:

```bash
make verify-api
make verify-web
make verify-mobile
make terraform-validate
npm run eval:vision
```

GitHub Actions also provides manually approved AWS deployment, Cloudflare Pages deployment, live smoke, real-upload proof, Bedrock evaluation, and Android E2E workflows.

## Repository Map

```text
apps/api/                    Lambda-ready Node.js API and image worker
apps/web/                    React/TypeScript workbench
apps/mobile/                 Expo/React Native client
packages/shared/             Schemas, permissions, and shared contracts
services/grading-python/     Deterministic Python grading boundary
services/operations-projector/ EventBridge projection Lambda
infra/terraform/             AWS infrastructure
evals/                       Reproducible model-contract evaluation
docs/                        Architecture, ADRs, proof, security, and runbooks
```

## Current Limits

InspectIQ is a working reference implementation with a live AWS backend. It is not a commercial inspection service.

- The 108-image challenge corpus is useful for contract regression, not statistical field validation.
- One live marketplace damage result does not establish production precision or recall.
- Mobile angle selection is inspector-driven; there is no deployed on-device angle classifier yet.
- Damage findings do not yet include reviewer-adjustable image regions or segmentation.
- The current buyer export is not yet a polished PDF and photo package.
- Generic CSV and signed webhook integrations are not implemented.
- Some Postgres flows still hydrate the in-memory domain store; high-concurrency use would require direct aggregate repositories.
- Commercial use requires rights-cleared field data, security review, customer integration work, and a controlled inspector pilot.

External marketplace evidence is source-attributed and stored privately for workflow proof. Marketplace images are not redistributed in this repository and remain subject to their source terms.

## Documentation

- [Hiring manager brief](docs/hiring-manager-brief.md)
- [Implementation boundary](docs/implementation-boundary.md)
- [Production readiness](docs/production-readiness.md)
- [Engineering iterations](docs/engineering-iterations.md)
- [Architecture and tradeoffs](docs/architecture.md)
- [State machine](docs/state-machine.md)
- [Security](docs/security.md)
- [Observability](docs/observability.md)
- [Runbook](docs/runbook.md)
- [Live production proof](docs/live-production-proof.md)
