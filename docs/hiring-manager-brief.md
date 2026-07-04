# Hiring Manager Brief

## Executive Signal

InspectIQ is not trying to impress with a flashy AI wrapper. It is built around the operational work that makes vehicle inspection software valuable: consistent evidence capture, trusted condition facts, human accountability, buyer-visible readiness, and recoverable failure handling.

The strongest signal is the shape of the system. It treats image AI as an input to a workflow, not as the workflow. Model output is validated, routed to reviewer decisions, blocked from buyer-facing release until confirmed, and recorded with provider/prompt/audit metadata.

## Business Problem

InspectIQ supports wholesale and offsite inspection workflows where buyers, sellers, lenders, and operations teams need trusted condition data before vehicle sale. The product problem is not "use AI on photos"; it is reducing dispute risk by making image evidence, damage facts, condition reports, seller disclosure, and reviewer approval consistent and auditable.

## Why It Maps To Automotive Inspection Teams

- Required-angle checklist covers front, rear, side, interior, engine bay, odometer, and VIN plate evidence.
- Image analysis returns angle confidence, image-quality scores, retake policy, quality warnings, damage candidates, OCR/VIN/odometer extraction, severity, and repair estimate range.
- Reviewers convert AI suggestions into facts only by accept/edit/reject decisions.
- Backend readiness blockers prevent buyer-visible release while required evidence, retake issues, failed analysis, or unreviewed AI suggestions remain.
- The workbench shows CR readiness, buyer-visible VDP readiness, reconditioning estimate, and arbitration risk.
- Buyer-ready report export keeps internal model/schema details out of end-user output.
- Audit events preserve photo analysis, schema validation metadata, reviewer decisions, grading, report drafting, edits, and finalization.

## Stack Mapping

- React + TypeScript workbench for inspector/reviewer/admin roles.
- Node + Express REST API with Zod request/output validation.
- Java Spring Boot grading service boundary for deterministic business rules.
- Postgres schema, Drizzle table definitions, and optional `PERSISTENCE_MODE=postgres` persistence using `pg`.
- Upload intent and image-analysis job records shaped for S3 plus SQS/EventBridge worker processing.
- Deterministic local providers shaped around Bedrock/Rekognition/custom-model interfaces.
- Cloudflare Pages Functions and KV snapshot support for hosted walkthroughs.
- AWS target: React -> API Gateway/Lambda or ECS -> Neon Free Postgres or Aurora -> S3 images -> SQS/EventBridge -> image worker -> Bedrock/Rekognition/custom model -> validated suggestions -> audit trail.

## Intentional Local Tradeoffs

- AI is deterministic locally so the walkthrough is reliable without paid model credentials.
- Deterministic image analysis still uses the production-shaped contract: angle, image quality, damage, OCR, confidence, repair estimate, provider metadata, prompt version, raw output, validated output, and audit event.
- Local server persists to a JSON snapshot by default, Cloudflare Pages can persist to KV, and `PERSISTENCE_MODE=postgres` provides a real relational path. A full production version should move from snapshot persistence to per-operation repository transactions.
- Browser uploads use small data URLs for preview; upload intent and photo metadata show the intended S3/R2 presigned-object path.
- The Java grading service is optional locally; the API fallback keeps the workflow available while preserving the service boundary.
- Auth is role-header based locally; production should use Cognito/OIDC claims mapped to RBAC actions.

## What I Would Build Next In Production

- Replace whole-store Postgres snapshot writes with per-operation repository methods and narrower transaction boundaries.
- S3/R2 object storage with presigned uploads, EXIF stripping, image normalization, and retryable ingestion jobs.
- Queue-backed image worker using the existing image-analysis job contract, idempotency keys, dead-letter handling, and model-provider metadata.
- Bedrock/Rekognition/custom model adapter with confidence thresholds and rejected-output audit records.
- Operational dashboards for image analysis success, missing angle rate, human review rate, grade latency, finalization rate, and suggestion acceptance.
- Real authentication, object-level authorization, CloudWatch/X-Ray tracing, alarms, and runbooks.

## Five-Minute Walkthrough

1. Open Dashboard: "This is a wholesale inspection queue. The key outcomes are CR readiness, buyer-visible release, and arbitration risk."
2. Switch to Inspector, create an inspection, attach the required photo set, and run analysis: "Inspectors own capture and analysis execution."
3. Open the detail workbench: "The model contract validates angle, image quality, damage, OCR, confidence, and repair estimate before creating suggestions; image jobs move through queued/running/completed states."
4. Switch to Reviewer and accept/edit/reject suggestions: "AI is advisory; accepted suggestions become facts and trigger audit events."
5. Confirm damage and check recon/arbitration status: "Damage decisions feed reconditioning estimate, seller disclosure, and release blockers."
6. Calculate grade, draft report, edit, finalize, and export buyer report: "The CR uses confirmed facts, finalization is terminal, and buyer output hides internal schema/model details."
7. Open Audit and Platform Health: "This is the operations story: schema validation, prompt versions, metrics, RBAC, and failure handling."

## Hiring Manager Signal

This project is strongest when explained as a workflow reliability exercise, not an AI showcase. It shows that the engineer can ship a coherent vertical slice, keep AI constrained by schemas and human review, reason about operational metrics, and map a local implementation to enterprise production architecture without overclaiming.

What I would expect the candidate to explain clearly:

- why the highest-risk problem is buyer trust, not just damage detection;
- why required angles and image quality matter before any model score matters;
- why accepted AI suggestions become facts only through reviewer action;
- why grading is deterministic and reports are generated from confirmed facts;
- why local deterministic providers are a reliability choice for review, not a substitute for production CV;
- how the same contract moves to S3, SQS/EventBridge, Postgres, and Bedrock/Rekognition/custom models.

See `docs/implementation-boundary.md` for the crisp "real vs deterministic local" explanation.
