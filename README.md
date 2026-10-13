# InspectIQ

[![CI](https://github.com/manynames3/inspectiq/actions/workflows/ci.yml/badge.svg?branch=agent%2Finspection-recon-operations&event=pull_request)](https://github.com/manynames3/inspectiq/actions/workflows/ci.yml?query=branch%3Aagent%2Finspection-recon-operations)

Evidence-first vehicle inspection, condition-report quality control, and authorized reconditioning. Built by [Supreme AI Ventures](https://supremeaiventures.dev/).

> [!IMPORTANT]
> This is the **active, unmerged `agent/inspection-recon-operations` branch**. `main` remains the historical baseline; the workbench, report/mobile redesign, QC, and recon features described here are not merged into it. See [PR #1](https://github.com/manynames3/inspectiq/pull/1) and the [branch comparison](https://github.com/manynames3/inspectiq/compare/main...agent/inspection-recon-operations).
>
> The live web app was deployed from this branch. Deployment, branch implementation, and production readiness are different claims: the latest frontend does not prove every backend revision is deployed, and neither establishes commercial model accuracy.
>
> The AWS API remains at `f0c8697`. Promoting the newer QC backend is blocked on legacy finalized-record handling; see the [release status and safety gate](docs/release-status.md).

[No-login product tour](https://inspectiq.pages.dev/?review=1) | [Native mobile](apps/mobile/README.md) | [C4 architecture](docs/c4.md) | [ADRs](docs/adr/README.md) | [Implementation boundary](docs/implementation-boundary.md)

InspectIQ helps inspection and auction-facility teams catch missing evidence, questionable identity readings, unresolved damage findings, and report/release blockers before a vehicle is presented to a buyer. The workflow continues into consignor-controlled recon, authorized work, shop QC, and sale release. AI suggests; a human decides what becomes a vehicle fact.

Start with the [product tour](#product-tour) for the visible workflow, [C4 views](docs/c4.md) for system boundaries, and the [ADR index](docs/adr/README.md) for the engineering tradeoffs.

## The Problem

Wholesale condition reports break down when evidence is incomplete or inconsistent:

- required angles are missing or unusable;
- VIN and odometer evidence cannot be verified;
- reviewers spend time finding the right photo for each issue;
- damage descriptions and recon estimates vary by reviewer;
- recon recommendations are mistaken for permission to spend consignor money;
- revised estimates and failed quality control are difficult to track against a sale deadline;
- buyers cannot trace a disclosure back to its evidence and approval history.

InspectIQ keeps condition facts, spending decisions, authorized work, quality control, release blockers, and audit history in one workflow.

## Users

| Role | Primary job |
| --- | --- |
| Inspector | Capture required evidence, resolve retakes, and submit photos for analysis. |
| Reviewer | Confirm, edit, or reject findings; grade the vehicle; approve the report. |
| Recon Coordinator | Prepare estimates, submit authorization requests, and coordinate authorized work and QC. |
| Consignor Approver | Approve, decline, or request revision for represented consignor accounts. |
| Technician | Update assigned, authorized facility work orders. |
| Admin | Manage policies, exceptions, platform health, and recovery. |

## Workflow

1. Create or receive an assigned inspection.
2. Capture the required vehicle angles on web or mobile and cross-check a complete VIN through NHTSA vPIC when needed.
3. Upload privately to S3 and queue analysis through SQS.
4. Validate Bedrock output against a strict schema.
5. Record direct Inspector observations with source attribution; require a Reviewer decision before an AI candidate becomes confirmed damage or identity evidence.
6. Approve the 0.0–5.0 InspectIQ Reference Grade and publish an immutable report version.
7. Create recon recommendations and illustrative estimates without treating them as authorization.
8. Apply a snapshotted Consignor Authorization Policy or route the item to a Consignor Approver.
9. Generate work orders only for authorized items, block overruns for reauthorization, and record QC.
10. Release the vehicle only when the backend sale-readiness assessment has no blockers.

## Product Tour

The desktop workbench uses Supreme AI Ventures' ink-and-mint identity; native field screens stay light and readable. Shared brand tokens align the clients without forcing a desktop layout onto a camera workflow.

### 1. Find the next decision

The role-aware work queue separates incomplete evidence, human review, and buyer-visible release. Search by vehicle/VIN or filter to work that needs action; each record exposes its next step instead of an ambiguous "all good" score.

![Role-aware InspectIQ work queue with explicit next actions](docs/images/tour/work-queue.png)

### 2. Review the evidence, not an AI percentage

A large photo, filmstrip, and photo-linked decisions keep evidence and reviewer action together. Open a photo to enlarge it, move left/right, zoom to 4×, or pan. Missing, unavailable, low-certainty, and retake-required evidence remains visible; no confirmed findings is not a damage-free certification.

<details>
<summary>Open the full evidence-workbench screenshot</summary>

![Evidence-first workbench showing reference demo evidence, reviewer decisions, and report limitations](docs/images/tour/evidence-workbench.png)

</details>

### 3. Separate a draft from an approved release

The paper-style report shows its version, VIN/odometer verification, limitations, reviewer approval, and release record. Unsaved language is labeled as unreviewed and cannot be approved/finalized. A polished preview is not the export format: the current buyer download is text, not a PDF/photo package.

![Report queue separating draft, approval, release, version, and buyer visibility](docs/images/tour/reports.png)

### 4. Capture in the field, synchronize deliberately

The **native Expo/React Native app** provides assigned inspections, required-angle camera guidance, local quality checks, sandboxed photos, SQLite upload operations, retry visibility, and a light field UI. Uploaded and queued photos are distinct. Review/report mutations require connectivity; only capture and cached assignment access work offline. Native evidence viewing supports enlargement, previous/next, swipe navigation, zoom, and pan.

<img src="docs/images/tour/android-workspace.png" alt="Native Android InspectIQ workspace captured from the verified arm64 APK in an emulator" width="320" />

The Android image is a genuine APK capture, not responsive web. The [mobile guide](apps/mobile/README.md) covers Cognito PKCE, offline sync, and internal APK builds. No app-store release or physical-device camera validation is claimed.

Screenshots show illustrative demo data, not customer inspections or damage-detection accuracy. [Capture provenance and image credits](docs/images/tour/README.md) distinguish the local deterministic web tour from the native public evaluation view. The native image demonstrates the workspace, not a tested camera/offline journey.

Operational views:

- **Recon Operations:** compare published or preliminary CR scores, confirmed repair exposure, authorization state, work progress, and sale blockers in one queue;
- **Recon Decisions:** scope estimates and preserve the distinction between a recommendation, consignor authorization, and executable work; and
- **Shop Board:** track authorized work, estimate overruns, reauthorization, and quality control.

## Live Proof

| Proof | Evidence |
| --- | --- |
| Public walkthrough | The [Evaluation Workspace](https://inspectiq.pages.dev/?review=1) requires no credentials; Reviewer/Admin findings and manual damage entries are isolated to the browser session. |
| Authenticated workflow | Cognito roles separate inspection, review, recon, consignor approval, technician, and administrative actions. See [role-separated proof](docs/role-separated-proof.md). |
| Real image analysis | A Copart marketplace photo moved through private S3, SQS, Lambda, Bedrock, schema validation, and Reviewer acceptance before becoming a confirmed damage record. See [the recorded model trace](evals/marketplace-bedrock-proof.json). |
| CR and recon comparison | The live Recon Operations queue contrasts a published 4.7 CR with no confirmed repair findings and `$0` recon against a preliminary 4.1 CR with confirmed rear damage and a `$1,200–$2,500` repair range. The range comes from confirmed damage, not a score-to-dollar lookup. |
| Vehicle reference | NHTSA vPIC decodes a complete VIN into reference metadata. It is not a vehicle-history report, proprietary condition score, or replacement for evidence review. |
| Operations | Platform Health exposes queue state, outbox delivery, EventBridge/DLQ status, projector health, model usage, and recovery controls. |
| Verification | [InspectIQ CI at `2b49dee`](https://github.com/manynames3/inspectiq/actions/runs/38339742074) passed all eight jobs, including Postgres integration, browser E2E, and responsive visual/accessibility regression. [Android CI at the same commit](https://github.com/manynames3/inspectiq/actions/runs/38339742078) passed the native evaluation journey and internal arm64 APK build. These prove this branch's workflow, not a `main` merge or physical-device camera quality. |

The marketplace run is one traceable workflow proof, not an accuracy benchmark. The source image is not committed to this repository.
Review decisions and damage entries created in the Evaluation Workspace stay in browser session storage and never mutate the production inspection record.

## Architecture

The [C4 system-context and container views](docs/c4.md) separate users, application responsibilities, data ownership, and external services. The [ADR index](docs/adr/README.md) explains why those boundaries exist; the [runtime architecture](docs/architecture.md) carries the implementation detail.

![AWS Architecture](docs/architecture_aws.png)

```text
React web / Expo mobile
        |
    Cognito JWT
        |
API Gateway -> Node.js Lambda -> Neon Postgres
        |              |
        |              +-> outbox -> EventBridge -> Python projector -> DynamoDB
        |              +-> consignor policy -> authorized work -> QC -> sale readiness
        |
        +-> private S3 -> SQS -> image worker Lambda -> Bedrock
```

### Service Boundaries

- **Neon Postgres** is the business system of record.
- **S3** stores private photo evidence; clients use presigned uploads and short-lived previews.
- **SQS** isolates image upload from model latency and supports retry and DLQ recovery.
- **Bedrock** returns advisory angle, quality, OCR, and damage findings.
- **NHTSA vPIC** supplies VIN-decoded reference metadata; it does not supply AutoCheck data, ownership history, or a condition score.
- **EventBridge** carries versioned domain events from the transactional outbox.
- **DynamoDB** holds idempotency records, operational timelines, and model-usage reservations. It is not a second business database.
- **CloudWatch and X-Ray** cover logs, metrics, traces, alarms, and the operations dashboard.

Condition grade and operational urgency are separate: grade describes the vehicle; urgency prioritizes facility work. The CR score provides comparison context, while recon cost comes from confirmed findings and coordinator-scoped work rather than a score-to-dollar lookup. Recon recommendations, authorization decisions, and work orders remain separate because the facility recommends work while the consignor retains economic control. See the [inspection-to-recon workflow](docs/inspection-recon-workflow.md) and [authorization policy](docs/recon-authorization-policy.md).

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

Native setup and APK instructions are in [the mobile README](apps/mobile/README.md). The offline boundary is recorded in [ADR 0011](docs/adr/0011-offline-capture-online-decisions.md); the shared brand and evidence-first interaction choices are in [ADR 0012](docs/adr/0012-shared-brand-evidence-first-surfaces.md).

## Quick Start

```bash
cp .env.example .env
npm ci
npm run seed
npm run dev
```

Requirements, environment setup, repository structure, and verification commands are in the [developer workflow](docs/developer-workflow.md).

## Current Limits

InspectIQ is a working reference implementation with a live AWS backend. It is not a commercial inspection service.

- The 108-image challenge corpus is useful for contract regression, not statistical field validation.
- One live marketplace damage result does not establish production precision or recall.
- Mobile angle selection is inspector-driven; there is no deployed on-device angle classifier yet.
- Damage findings do not yet include reviewer-adjustable image regions or segmentation.
- The current buyer export is not yet a polished PDF and photo package.
- Generic CSV and signed webhook integrations are not implemented.
- Some Postgres flows still hydrate the in-memory domain store; high-concurrency use would require direct aggregate repositories.
- Seeded repair costs, durations, grade lift, and authorization limits are illustrative rather than a commercial repair-pricing database.
- The InspectIQ Reference Grade is not Manheim AutoGrade, MMR, or another proprietary score.
- Commercial use requires rights-cleared field data, security review, customer integration work, and a controlled inspector pilot.

External marketplace evidence remains subject to its source terms and is not a licensed training corpus. The marketplace proof does not commit its source image. Workbench screenshots include existing dealer/reference imagery for contextual UI documentation; they do not grant rights to reuse it commercially or establish a rights-cleared field dataset. See the [capture provenance](docs/images/tour/README.md).

## Documentation

- [Condition-report QC product contract and real-car validation protocol](docs/condition-qc-product.md)
- [Implementation boundary](docs/implementation-boundary.md)
- [Inspection-to-recon workflow](docs/inspection-recon-workflow.md)
- [Recon authorization policy](docs/recon-authorization-policy.md)
- [Recon API examples](docs/inspection-recon-api.md)
- [Five-minute recon walkthrough](docs/inspection-recon-demo.md)
- [Production readiness](docs/production-readiness.md)
- [Release status and backend safety gate](docs/release-status.md)
- [Engineering iterations](docs/engineering-iterations.md)
- [Architecture and tradeoffs](docs/architecture.md)
- [C4 system context and containers](docs/c4.md)
- [Architecture decision records](docs/adr/README.md)
- [Tour screenshots and provenance](docs/images/tour/README.md)
- [State machine](docs/state-machine.md)
- [Security](docs/security.md)
- [Observability](docs/observability.md)
- [Runbook](docs/runbook.md)
- [Live production proof](docs/live-production-proof.md)
