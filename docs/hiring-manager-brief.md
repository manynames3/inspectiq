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

- React/Vite web workbench plus Expo/React Native mobile workflows for Inspector, Reviewer, and Admin.
- Node + Express REST API with Zod request/output validation.
- Python FastAPI grading service boundary for deterministic business rules.
- Postgres schema, Drizzle table definitions, and deployed `PERSISTENCE_MODE=postgres` persistence using Neon and `pg`.
- S3 presigned upload intent, private object metadata, and photo image redirect flow.
- SQS-backed image-analysis jobs processed by a Lambda worker.
- Transactional domain outbox -> EventBridge -> Python 3.12 Lambda -> idempotent DynamoDB operations projection, TTL timeline, and model-usage guard.
- Deterministic local providers plus deployed Bedrock multimodal provider behind the same schema contract.
- Vision evaluation command/dataset for angle, OCR, false-positive, and retake metrics.
- JWT verification path and API object-level authorization tests.
- Platform Health SLO panels, outbox/projector/DLQ state, CloudWatch/X-Ray alarms, SNS notifications, and failed-job/event recovery controls.
- Cloudflare Pages frontend and AWS API Gateway/Lambda backend.
- Deployed shape: web/mobile -> Cognito -> API Gateway/Lambda -> Neon/S3 -> SQS/Lambda/Bedrock -> validated suggestions/audit/outbox -> EventBridge/Python projector -> DynamoDB operational state.

## Intentional Local Tradeoffs

- AI is deterministic locally so tests and local walkthroughs are reliable without model credentials.
- Deterministic image analysis and Bedrock image analysis use the same production-shaped contract: angle, image quality, damage, OCR, confidence, repair estimate, provider metadata, prompt version, raw output, validated output, and audit event.
- Local server persists to a JSON snapshot by default; the deployed backend persists normalized rows to Neon Postgres through transactional row-level upserts/deletes. A high-concurrency production version should move the busiest mutation paths to DB-first repositories.
- Local browser uploads can use small data URLs for preview; deployed web/mobile uploads use stable operation IDs and S3 presigned object URLs. Mobile capture persists assignments/operations in SQLite and photos in the app sandbox until sync succeeds.
- The Python grading service is optional locally; the API fallback keeps the workflow available while preserving the service boundary.
- Local auth is role-header based for deterministic testing; the deployed walkthrough uses Cognito hosted OIDC/PKCE, Lambda-side JWT/JWKS validation, Cognito groups, SecureStore, and object-level inspection authorization.

## What I Would Build Next In Production

- Replace the remaining hydrated row-delta store bridge with aggregate-specific DB-first repositories as concurrency grows.
- Expand 12 independent evaluation sources into a statistically representative, adjudicated field corpus and record real Bedrock promotion artifacts.
- Add production thumbnail/CDN and evidence retention/legal-hold policy.
- Collect inspector/reviewer usability data, sustained load evidence, and measured SLO/cost results.

## Five-Minute Walkthrough

1. Open Dashboard: "This is a wholesale inspection queue. The key outcomes are CR readiness, buyer-visible release, and arbitration risk."
2. Switch to Inspector, create an inspection, attach the required photo set, and run analysis: "Inspectors own capture and analysis execution."
3. Open the detail workbench: "The model contract validates angle, image quality, damage, OCR, confidence, and repair estimate before creating suggestions; image jobs move through queued/running/completed states."
4. Switch to Reviewer and accept/edit/reject suggestions: "AI is advisory; accepted suggestions become facts and trigger audit events."
5. Confirm damage and check recon/arbitration status: "Damage decisions feed reconditioning estimate, seller disclosure, and release blockers."
6. Calculate grade, draft, edit, approve the exact version, confirm finalization, and export: "The CR uses confirmed facts; buyer output hides internal schema/model details."
7. Open Audit and Platform Health: "This is the operations story: correlated audit/outbox events, EventBridge projection, duplicate suppression, cost guard, metrics, RBAC, and recovery."

## Hiring Manager Signal

This project is strongest when explained as a workflow reliability exercise, not an AI showcase. It shows that the engineer can ship a coherent vertical slice, keep AI constrained by schemas and human review, reason about operational metrics, and map a local implementation to enterprise production architecture without overclaiming.

What I would expect the candidate to explain clearly:

- why the highest-risk problem is buyer trust, not just damage detection;
- why required angles and image quality matter before any model score matters;
- why accepted AI suggestions become facts only through reviewer action;
- why grading is deterministic and reports are generated from confirmed facts;
- why local deterministic providers are a reliability choice for review, not a substitute for production CV;
- why SQS is the work queue while EventBridge distributes versioned business events, why DynamoDB is a projection rather than the source of truth, and when Step Functions, Kinesis, OpenSearch, or Rekognition would add real value.

See `docs/implementation-boundary.md` for the crisp "real vs deterministic local" explanation.
