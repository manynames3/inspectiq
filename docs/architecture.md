# Architecture

InspectIQ is a production-shaped inspection workflow implemented as a monorepo with a React/Vite workbench, TypeScript Express API, shared Zod schemas, Neon Postgres persistence for the deployed backend, and a narrow Java grading service boundary.

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
  API --> Java[Java grading service]
  API --> Report[Report provider interface]
  Report --> LocalReport[Deterministic local report provider]
  Report --> BedrockReport[Bedrock report provider]
  API --> Audit[Audit trail]
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
-> deterministic grade
-> AI-assisted report draft from confirmed facts
-> reviewer finalization
-> buyer-ready report export
-> audit trail and metrics
```

## Core Boundaries

| Boundary | Why it exists |
| --- | --- |
| Shared schemas | Keep API, UI, provider output, and tests aligned around explicit contracts. |
| Vision provider | Swap deterministic local analysis for the Bedrock multimodal provider without changing reviewer workflow. |
| Image-analysis jobs | Model queue/retry/idempotency even when local analysis completes immediately. |
| Java grading service | Show how deterministic condition rules can be versioned and owned separately when justified. |
| Readiness blockers | Keep CR/VDP/buyer-visible release decisions backend-derived instead of UI-only. |
| Audit events | Preserve a defensible chain of custody for AI suggestions, human decisions, grading, and finalization. |

## Data Ownership

Postgres tables are shaped around operational facts rather than UI screens:

- `inspections` own vehicle intake and workflow status.
- `vehicle_photos` own object metadata, declared/detected angle, quality, and analysis status.
- `image_analysis_jobs` own queued/running/completed/failed/dead-letter execution state.
- `photo_analysis_results` store raw and validated provider output separately.
- `vision_suggestions` remain advisory until a reviewer accepts or edits them.
- `damage_items`, `condition_grades`, `ai_report_drafts`, and `final_reports` represent confirmed downstream facts.
- `audit_events` record reviewer and system decisions.

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
```

The local workflow uses deterministic providers so it works without model credentials. The deployed backend uses Cloudflare Pages, Cognito hosted OIDC, API Gateway JWT enforcement, Lambda-side JWT/JWKS validation, Neon Postgres, S3, SQS, Bedrock, Secrets Manager, CloudWatch logs, alarms, and a dashboard. The remaining production hardening is to expand the model evaluation corpus with labeled production-like images, move hot paths to DB-first repositories as concurrency grows, and add environment promotion/rollback automation.

## Failure Posture

The system is designed around recoverable workflow failures:

- unsupported image files fail validation before persistence;
- provider failures create failed analysis records and audit events;
- schema rejection prevents untrusted model output from becoming suggestions;
- retake-required image quality blocks buyer-visible release;
- unreviewed suggestions block release;
- finalization is terminal for normal workflow users;
- E2E tests prove the rendered app can complete create -> analyze -> review -> grade -> finalize -> export.
