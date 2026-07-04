# Hiring Manager Brief

## Business Problem

InspectIQ supports wholesale and offsite inspection workflows where buyers, sellers, lenders, and operations teams need trusted condition data before vehicle sale. The product problem is not "use AI on photos"; it is reducing dispute risk by making image evidence, damage facts, condition reports, seller disclosure, and reviewer approval consistent and auditable.

## Why It Maps To Automotive Inspection Teams

- Required-angle checklist covers front, rear, side, interior, engine bay, odometer, and VIN plate evidence.
- Image analysis returns angle confidence, image-quality scores, retake policy, quality warnings, damage candidates, OCR/VIN/odometer extraction, severity, and repair estimate range.
- Reviewers convert AI suggestions into facts only by accept/edit/reject decisions.
- The workbench shows CR readiness, buyer-visible VDP readiness, reconditioning estimate, and arbitration risk.
- Audit events preserve photo analysis, schema validation metadata, reviewer decisions, grading, report drafting, edits, and finalization.

## Stack Mapping

- React + TypeScript workbench for inspector/reviewer/admin roles.
- Node + Express REST API with Zod request/output validation.
- Java Spring Boot grading service boundary for deterministic business rules.
- Postgres schema and Drizzle table definitions for production relational state.
- Deterministic local providers shaped around Bedrock/Rekognition/custom-model interfaces.
- Cloudflare Pages Functions and KV snapshot support for hosted walkthroughs.
- AWS target: React -> API Gateway/Lambda or ECS -> Neon Free Postgres or Aurora -> S3 images -> SQS/EventBridge -> image worker -> Bedrock/Rekognition/custom model -> validated suggestions -> audit trail.

## Intentional Local Tradeoffs

- AI is deterministic locally so the walkthrough is reliable without paid model credentials.
- Deterministic image analysis still uses the production-shaped contract: angle, image quality, damage, OCR, confidence, repair estimate, provider metadata, prompt version, raw output, validated output, and audit event.
- Local server persists to a JSON snapshot and Cloudflare Pages can persist to KV; production state belongs in Postgres.
- Browser uploads use small data URLs for preview; production should use S3 presigned uploads and object metadata.
- The Java grading service is optional locally; the API fallback keeps the workflow available while preserving the service boundary.
- Auth is role-header based locally; production should use Cognito/OIDC claims mapped to RBAC actions.

## What I Would Build Next In Production

- Postgres repository implementation behind the current store contract, with migrations and transaction boundaries.
- S3/R2 object storage with presigned uploads, EXIF stripping, image normalization, and retryable ingestion jobs.
- Queue-backed image worker with idempotency keys, dead-letter handling, and model-provider metadata.
- Bedrock/Rekognition/custom model adapter with confidence thresholds and rejected-output audit records.
- Operational dashboards for image analysis success, missing angle rate, human review rate, grade latency, finalization rate, and suggestion acceptance.
- Real authentication, object-level authorization, CloudWatch/X-Ray tracing, alarms, and runbooks.

## Five-Minute Walkthrough

1. Open Dashboard: "This is a wholesale inspection queue. The key outcomes are CR readiness, buyer-visible release, and arbitration risk."
2. Switch to Inspector, create an inspection, attach the required photo set, and run analysis: "Inspectors own capture and analysis execution."
3. Open the detail workbench: "The model contract validates angle, image quality, damage, OCR, confidence, and repair estimate before creating suggestions."
4. Switch to Reviewer and accept/edit/reject suggestions: "AI is advisory; accepted suggestions become facts and trigger audit events."
5. Confirm damage and check recon/arbitration status: "Damage decisions feed reconditioning estimate and seller disclosure."
6. Calculate grade, draft report, edit, and finalize: "The CR uses confirmed facts and finalization is terminal."
7. Open Audit and Platform Health: "This is the operations story: schema validation, prompt versions, metrics, RBAC, and failure handling."

## Hiring Manager Signal

This project is strongest when explained as a workflow reliability exercise, not an AI showcase. It shows that the engineer can ship a coherent vertical slice, keep AI constrained by schemas and human review, reason about operational metrics, and map a local implementation to enterprise production architecture without overclaiming.

See `docs/implementation-boundary.md` for the crisp "real vs deterministic local" explanation.
