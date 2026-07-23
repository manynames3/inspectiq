# Inspection-to-Reconditioning Implementation Plan

## Goal

Extend InspectIQ from a condition-report workflow into a wholesale facility operations slice:

`check-in -> inspection -> published CR -> recon estimate -> consignor authorization -> work order -> QC -> sale readiness`

The existing React, Lambda API, Neon/Postgres, S3/SQS/Bedrock, outbox/EventBridge, RBAC, and audit boundaries remain. This work does not add auction bidding, valuation, payments, transportation, tracking hardware, or a repair-pricing database.

## Existing Seams To Reuse

- `packages/shared`: Zod contracts, roles, permissions, grading output, and domain-event envelopes.
- `apps/api/src/store.ts`: deterministic domain behavior, audit records, readiness rules, and outbox creation.
- `apps/api/src/app.ts`: authenticated, role-checked HTTP handlers.
- `apps/api/src/db`: numbered SQL migrations and Postgres persistence.
- `services/grading-python`: independently testable deterministic grade rules.
- `apps/web`: operational tables, status pills, evidence review, and role-aware navigation.

## Delivery Order

1. Replace letter/100-point output with a bounded 0.0-5.0 InspectIQ Reference Grade. Store suggested and approved values separately; missing evidence remains a blocker.
2. Add a separate urgency calculation with score, classification, and explicit reasons.
3. Add explicit inspection, recon-authorization, work-order, QC, and sale-readiness states with guarded transitions.
4. Add consignor accounts/policies, intake/sale/location facts, recommendations, authorizations, work orders, tasks, QC, and readiness assessments.
5. Implement policy evaluation, partial authorization, idempotent work-order creation, overrun reauthorization, and structured readiness blockers.
6. Expose one API-backed vertical slice with object-level RBAC and audit/outbox events.
7. Add Recon Decisions, Shop Board, and Auction Operations Queue views using existing UI patterns.
8. Seed scenarios that demonstrate automatic approval, manual approval, partial approval, overrun, failed QC, and sale-ready completion.
9. Add Python, TypeScript, API, and frontend tests, then update focused documentation and the concise README.

## Compatibility Strategy

- Keep the existing report lifecycle status while existing inspection/report pages are migrated.
- Add separate business-state fields immediately; new recon and operations behavior must use them rather than infer state from AI/report jobs.
- Preserve existing local deterministic providers and deployed AWS integrations.
- Keep Postgres authoritative. DynamoDB remains a disposable operational projection.
- Continue publishing minimal, versioned, non-PII events through the transactional outbox.

## Vertical-Slice Acceptance

A seeded vehicle can be checked in, assigned, inspected, graded on the 0.0-5.0 scale, published, estimated, partially authorized under a consignor policy, converted into work orders only for authorized items, blocked on an overrun, reauthorized, completed, passed through QC, and marked sale-ready. Every decision is persisted, role-checked, audited, and represented by an outbox event.

## Explicit Limits

- Costs and grade lift are illustrative.
- InspectIQ Reference Grade is not AutoGrade, MMR, or another proprietary score.
- ADAS work is referred to a qualified third party.
- The first pass provides a production-minded vertical slice, not a full repair-pricing, scheduling, or auction platform.

## Implementation Status

Completed in this change set:

- bounded 0.0–5.0 suggested and reviewer-approved condition grades;
- independent urgency score, classification, reasons, count, and ordering;
- explicit inspection, authorization, work-order, QC, and sale-readiness transitions;
- normalized recon/facility entities and numbered Postgres migration;
- snapshotted consignor authorization policy and service/vehicle limits;
- partial authorization, idempotent work-order generation, overrun reauthorization, and failed-QC recovery;
- API-backed Auction Operations, Recon Decision, and Shop Board workspaces;
- expanded visual condition-report sections with explicit unobserved/out-of-scope language;
- six API-enforced roles with consignor account access checks;
- versioned outbox events covering the end-to-end business workflow;
- realistic deterministic seed scenarios; and
- TypeScript, API, web, mobile, and Python policy coverage.

Still requires external proof before a production claim:

- applying the new Cognito groups and migration to a controlled environment;
- field-user validation and sustained concurrency/load evidence;
- customer-specific repair pricing, labor rules, and authorization terms; and
- rights-cleared model evaluation representative of the target inspection population.
