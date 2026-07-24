# Architecture

InspectIQ is a production-shaped inspection workflow implemented as a monorepo with React/Vite web, Expo/React Native mobile, a TypeScript Express Lambda API/worker, shared Zod schemas, Neon Postgres, a Python operations-projector Lambda, and a narrow optional Python grading boundary.

The architecture is intentionally boring where reliability matters: explicit state transitions, schema-validated model output, append-style audit events, deterministic grading, role-aware actions, and backend-derived readiness blockers. The AI path is advisory by design; it accelerates review without silently becoming the source of truth.

## Runtime Shape

```mermaid
flowchart LR
  UI[React inspection workbench on Cloudflare Pages] --> API[API Gateway + Node Lambda]
  API --> RBAC[Role/action checks]
  API --> Schemas[Shared Zod schemas]
  API --> Store[Workflow store facade]
  Store --> FileStore[Local file snapshot for development]
  Store --> PG[Neon Postgres persistence mode]
  API --> S3[S3 presigned image uploads]
  API --> Queue[SQS image-analysis queue]
  Queue --> Worker[Lambda image worker]
  API --> Vision[Vision provider interface]
  Vision --> LocalVision[Deterministic local provider]
  Worker --> BedrockVision[Bedrock multimodal provider]
  API --> Jobs[Image-analysis jobs]
  API --> Python[Python grading service]
  API --> Report[Report provider interface]
  Report --> LocalReport[Deterministic local report provider]
  Report --> BedrockReport[Bedrock report provider]
  API --> Audit[Audit trail]
  API --> Outbox[Postgres domain outbox]
  Worker --> Outbox
  Outbox --> Events[EventBridge custom bus]
  Events --> Projector[Python operations projector]
  Projector --> DDB[DynamoDB idempotency and operations state]
```

## Product Flow

```txt
Create inspection
-> capture required photo evidence
-> queue image analysis
-> validate angle, quality, damage, OCR, confidence, and estimate output
-> create advisory suggestions
-> reviewer accept/edit/reject
-> confirmed damage and evidence update readiness
-> reviewer-approved 0.0-5.0 InspectIQ Reference Grade
-> AI-assisted report draft from confirmed facts
-> reviewer version approval
-> immutable condition-report publication
-> recon recommendations and illustrative estimates
-> consignor policy or user authorization
-> authorized facility work orders
-> quality control
-> structured sale-readiness assessment
-> audit trail and metrics
```

## Core Boundaries

| Boundary | Why it exists |
| --- | --- |
| Shared schemas | Keep API, UI, provider output, and tests aligned around explicit contracts. |
| Vision provider | Swap deterministic local analysis for the Bedrock multimodal provider without changing reviewer workflow. |
| Image-analysis jobs | Model queue/retry/idempotency even when local analysis completes immediately. |
| Python grading service | Show how deterministic condition rules can be versioned and owned separately when justified. |
| Readiness blockers | Keep CR/VDP/buyer-visible release decisions backend-derived instead of UI-only. |
| Consignor authorization | Keep facility recommendations separate from the economic decision and snapshot the policy used for every automatic authorization. |
| Authorized work orders | Prevent recommendations or pending estimates from becoming executable shop work. |
| Audit events | Preserve a defensible chain of custody for AI suggestions, human decisions, grading, and finalization. |
| Domain events + projection | Publish minimal versioned non-PII events after commit; suppress duplicate delivery and keep operational reads separate from relational truth. |

## Data Ownership

Postgres tables are shaped around operational facts rather than UI screens:

- `inspections` own vehicle intake and workflow status.
- `vehicle_photos` own object metadata, declared/detected angle, quality, and analysis status.
- `image_analysis_jobs` own queued/running/completed/failed/dead-letter execution state.
- `photo_analysis_results` store raw and validated provider output separately.
- `vision_suggestions` remain advisory until a reviewer accepts or edits them.
- `damage_items`, `condition_grades`, `ai_report_drafts`, and `final_reports` represent confirmed downstream facts.
- `identity_verifications` store accepted VIN/odometer cross-checks; `report_versions` preserve reviewer-visible report history.
- `consignor_accounts` and `recon_authorization_policies` own economic-control rules.
- `vehicle_intakes`, `inspection_assignments`, `vehicle_location_events`, and `sale_assignments` own facility and sale context.
- `recon_recommendations` and `recon_authorizations` keep proposals separate from spending decisions.
- `work_orders`, `work_order_tasks`, and `quality_control_results` own authorized execution and verification.
- `sale_readiness_assessments` preserve the calculated release decision and structured blockers.
- `audit_events` record reviewer and system decisions.
- `domain_events` are the transactional outbox; DynamoDB stores only idempotency, short-lived timelines, latest projected state, and monthly model usage.

## Production Deployment Shape

```txt
React workbench
-> Cloudflare Pages
-> API Gateway + Lambda API
-> Neon Postgres persistence
-> presigned S3 uploads
-> API-created image-analysis jobs
-> SQS queue
-> Lambda image worker
-> Bedrock multimodal model
-> VisionOutputSchema validation
-> suggestions + audit trail
-> reviewer workflow
-> consignor authorization
-> authorized work orders and quality control
-> sale-readiness assessment
-> EventBridge domain events
-> Python projector
-> DynamoDB operations projection
```

The local workflow uses deterministic providers so it works without model credentials. The deployed backend uses Cloudflare Pages/mobile clients, Cognito OIDC/PKCE, Lambda-side JWT/JWKS validation, Neon, S3, SQS, Bedrock, EventBridge, Python/Lambda projection, DynamoDB, Secrets Manager, CloudWatch/X-Ray, alarms, and a budget. The remaining production work is independent field-data evaluation, DB-first aggregate repositories, real-user iteration, and sustained SLO/cost evidence.

## Failure Posture

The system is designed around recoverable workflow failures:

- unsupported image files fail validation before persistence;
- provider failures create failed analysis records and audit events;
- schema rejection prevents untrusted model output from becoming suggestions;
- retake-required image quality blocks buyer-visible release;
- unreviewed suggestions block release;
- a recommendation cannot create executable work before authorization;
- a revised estimate beyond tolerance blocks work and requires reauthorization;
- failed quality control returns the work order to progress and blocks sale readiness;
- finalization is terminal for normal workflow users;
- E2E tests prove the rendered app can complete create -> analyze -> review -> grade -> draft -> approve -> finalize -> export, and optimistic versions reject stale reviewer writes.
