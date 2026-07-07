# Production Readiness

InspectIQ is production-shaped, not a claim that a portfolio dataset is enough for a buyer-visible automotive inspection launch. This document separates implemented proof from the remaining gates that would be required before running the system as a real inspection platform.

## Current Proof

| Area | Current proof in repo/live stack |
| --- | --- |
| End-to-end workflow | Inspector capture, image analysis, reviewer accept/reject/edit, damage confirmation, grading, report draft/finalization, and audit trail are implemented through API and UI tests. |
| AWS serverless path | Cloudflare Pages calls API Gateway/Lambda; image analysis can run through SQS -> Lambda worker -> Bedrock multimodal provider; objects are stored in private S3; state is persisted in Neon Postgres. |
| Human-in-the-loop control | AI output creates advisory suggestions only. CR/VDP readiness, damage records, and reports depend on reviewer decisions. |
| Auth and authorization | Cognito/OIDC JWT validation, role claims, RBAC, object-level inspection access, and read-only evaluation preview are enforced by the API. |
| Upload intake | JPEG, PNG, and WebP schemas enforce MIME and size limits; presigned mode requires scoped object bucket/key metadata, byte size, and SHA-256 checksum. |
| Operations | Platform Health exposes SLOs, alert signals, queue/DLQ recovery steps, AI contract metadata, and implementation boundaries. |
| CI | TypeScript, unit/API/component tests, and build checks are wired through repository scripts and GitHub Actions. |

## Production Gates

### 1. Real Image ML Evaluation

Before any buyer-visible confidence claim, the image pipeline needs a labeled corpus of real inspection images:

- front/rear/side/interior/engine/odometer/VIN angles;
- clean vehicles, known damage, subtle scratches, dents, glass, wheels, interior wear;
- bad captures: blur, glare, dark interior, partial VIN, dirty odometer, missing vehicle, bad crop;
- capture sources: mobile/offsite, dealer listing, auction lane, recon shop, indoor/outdoor lighting.

Required metrics:

- angle accuracy;
- OCR accuracy for VIN and odometer;
- damage precision, recall, and false-positive rate;
- retake precision and recall;
- latency and cost per analyzed image;
- reviewer override rate.

Bedrock multimodal remains useful for advisory reasoning and structured summaries. A production condition platform should pair it with dedicated image-quality, OCR, angle, and damage-detection models when the business requires calibrated damage decisions.

### 2. Production Image Pipeline

The current S3/presigned path proves the storage architecture. Production still needs:

- EXIF stripping;
- image resizing/normalization;
- thumbnail generation;
- malware/content scanning policy;
- checksum enforcement;
- S3 lifecycle and retention rules;
- KMS key-policy review;
- CDN/private preview policy;
- failed-upload cleanup.

### 3. Auth, Sessions, and Object Authorization

The API already validates JWTs and object-level access. Production should add:

- enterprise OIDC/Cognito group provisioning;
- no role switching for authenticated users;
- session timeout and refresh policy;
- audit records for sensitive reads, not only writes;
- tenant/account boundaries if multiple sellers or clients share the platform;
- negative authorization tests for every photo, report, suggestion, damage, and audit endpoint.

### 4. Persistence and Data Durability

Neon Postgres is deployed, but the highest-concurrency paths should mature further:

- DB-first repositories for inspection, photo, suggestion, audit, report, and job hot paths;
- targeted transactions instead of broad snapshot synchronization;
- migration workflow with rollback strategy;
- backup/restore drills;
- retention policy for image metadata, audit events, and finalized reports;
- indexes verified against expected queue/reviewer workloads.

### 5. Event-Driven Reliability

The SQS worker path exists. Production proof should include:

- idempotency tests for duplicate SQS delivery;
- retry classification for provider throttling vs schema failure vs missing image object;
- DLQ replay tooling;
- queue age alarms;
- worker concurrency limits matched to Bedrock throttling behavior;
- operational drill: fail an image job, recover it, and prove readiness blockers clear.

### 6. Operational Readiness

Platform Health documents the intended operating model. Production should add:

- CloudWatch alarm notifications;
- request/job/inspection trace correlation;
- dashboards for API latency, worker failures, queue age, Bedrock throttles, DB latency, and S3 errors;
- runbooks tested by someone other than the author;
- frontend/Lambda/Terraform/database rollback instructions;
- staged deployment promotion.

### 7. End-User Readiness

The UI is credible for review, but daily production use needs field validation:

- mobile/offsite inspector capture tests;
- retake guidance tied to real camera quality;
- reviewer assignment and SLA workflows;
- bulk queue actions;
- report approval/version workflow;
- accessibility pass;
- screenshot regression checks for dense dashboard/workbench pages.

## Interview Framing

The concise answer:

> InspectIQ proves the architecture, workflow, and governance shape. To make it production ready, I would validate the image models with a labeled real-world corpus, harden the image ingestion pipeline, mature the Postgres hot paths, prove SQS/DLQ recovery, and run role-based user testing with inspectors and reviewers. Bedrock is valuable for multimodal reasoning, but buyer-visible damage claims need evaluated ML metrics and human approval.

