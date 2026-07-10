# Production Readiness

InspectIQ is production-shaped, not a claim that a portfolio corpus and low-volume walkthrough are sufficient for buyer-visible automotive decisions. This document separates implemented controls from external proof still required.

## Implemented Proof

| Area | Evidence in repo/live shape |
| --- | --- |
| Workflow | Inspector capture, SQS/Bedrock analysis, reviewer accept/reject/edit, damage, grading, report version approval/finalization, export, and audit are covered by API/browser tests. |
| Native mobile | Expo/React Native roles, Cognito PKCE, SecureStore, SQLite assignment/operation cache, sandboxed photos, offline Inspector capture, bounded sync retries, local QA, and Android build/Maestro workflows. |
| Relational integrity | Numbered migrations, `schema_migrations`, normalized Neon rows, changed-row transactions, conditional versions, `409 VERSION_CONFLICT`, and business/audit/outbox co-commit. |
| Event reliability | Versioned `DomainEventV1` outbox, EventBridge, Python projector, transactional DynamoDB duplicate suppression, TTL timelines, latest state, domain-event DLQ, alarms, and Admin replay. |
| AI governance | Strict schemas, no-fallback promotion workflow, model/prompt/latency/token/cost/failure metadata, monthly reservations, reviewer approval, and buyer-output redaction. |
| Auth | Cognito OIDC/PKCE, JWT/JWKS validation, role claims, RBAC, object authorization, read-only evaluation mode, and no role switching for authenticated users. |
| Operations | Correlation IDs through API/SQS/events, X-Ray, CloudWatch dashboard/alarms, SNS option, Platform Health, failed job/event recovery, and $50 budget thresholds. |
| Quality gates | Node/web/mobile tests, Python grading/projector tests, Postgres service integration in CI, browser E2E, Axe/viewport checks, screenshot regression, Terraform validation, and Android release build. |

## Remaining Production Gates

### 1. Field Model Evidence

The current corpus executes 108 images but derives them from 12 independent rights-cleared sources. Before operational rollout, build an adjudicated field dataset spanning operators, devices, vehicle classes, lighting/weather, clean controls, subtle/material damage, VIN/odometer variations, and auction/offsite backgrounds. Record inter-rater agreement, precision/recall by class, calibration, reviewer override rate, latency, and cost for each model/prompt version. Bedrock remains advisory until that evidence supports the intended risk tier.

### 2. DB-First Repositories

The deployed adapter writes normalized changed rows transactionally and rejects stale versioned updates, but it still hydrates the store facade and uses a global advisory lock. Replace this bridge with aggregate-specific inspection/photo/suggestion/report/audit/job repositories and narrow transactions before high-concurrency multi-tenant use. Preserve the current outbox and optimistic-concurrency invariants.

### 3. Image Delivery Policy

Mobile normalization and EXIF removal, private S3 uploads, checksums, and abandoned-multipart cleanup are implemented. Production still needs thumbnail/CDN design, retention/legal hold, backup/restore, key-policy review, malware/content policy, and documented deletion/export requirements.

### 4. Identity and Tenant Operations

Prove enterprise group provisioning, refresh/revocation, password/MFA policy, sensitive-read auditing, tenant/account boundaries, support escalation, and negative authorization tests against every object type. Decompose API Gateway routes and attach the JWT authorizer when the public/protected route split is stable.

### 5. Sustained Operations

Run load/soak tests against expected concurrency; verify Neon pool behavior, Lambda throttles, Bedrock quotas, SQS age, outbox recovery, DLQ replay, and rollback. Have someone other than the author execute the runbook. Record seven-day idle cost and at least one controlled failed-job and failed-event recovery artifact.

### 6. Real-User Validation

Observe actual inspectors and reviewers. Measure capture completion, retake frequency, sync recovery, time to decision, queue aging, keyboard/accessibility use, report corrections, and support incidents. Iterate from those observations rather than adding speculative features.

## Honest Interview Framing

> InspectIQ proves the workflow, event, mobile, governance, and low-idle serverless shape. The remaining gap is external evidence: a representative labeled field corpus, sustained workload/SLO results, DB-first repositories at real concurrency, and feedback from working inspectors and reviewers. Bedrock output is advisory, and buyer-visible facts remain human-approved.
