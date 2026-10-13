# ADR 0014: Audited Reinspection with Immutable History

Date: 2026-10-13

Status: Accepted and implemented on the unmerged `agent/inspection-recon-operations` branch; not yet deployed to the AWS API.

## Context

Current condition-report QC binds a reviewed grade and report draft to their evidence fingerprints. Persisted legacy records can contain a finalized report without those fingerprints. Treating the old release as current-policy approved would misrepresent its provenance, but changing its report, grade, or publication history would destroy the evidence of what was actually approved.

Finalized records also need an amendment path when new evidence becomes available. Reopening the same record or copying its findings into an apparently reviewed replacement would defeat the immutability and fresh-evidence boundaries.

## Decision

Preserve the original published artifacts and create a separate inspection through `POST /api/inspections/:id/reinspections`.

- Keep the source inspection's existing business fields, final report body/approval/release fields, grade payloads, and report-version rows unchanged. Append linked audit events to the source and replacement; do not fabricate historical fingerprints or silently reapprove the old report.
- Create a new `DRAFT`, version 1, with zero completeness and new timestamps. Copy vehicle-entry metadata and the source's assigned operator only. Do not copy photos, AI findings, identity verification, inspector observations, QC decisions, grades, reports, approvals, facility recon intake, consignor spending authorization, or work orders. Fresh evidence, review, grading, report approval, and release must follow the normal workflow.
- Store nullable lineage fields on the replacement: source inspection ID, source report ID/version, reason, and operation ID. Audit events `inspection.reinspection_requested` and `inspection.reinspection_created` record both IDs, source version, reason, operation ID, and actor.
- Require the dedicated `inspection:reinspect` permission (Inspector, Reviewer, or Admin), existing inspection-level access, a finalized source inspection/report, and the exact current source report version. Existing production authentication and object-access rules remain authoritative; evaluation actors cannot mutate this endpoint.
- Require a trimmed 10–1,000-character reason, UUID `operationId`, and positive integer `expectedReportVersion`; reject extra payload fields. First creation returns `{ inspection, reused: false }` with HTTP 201. A matching retry returns the existing replacement, with its current state intact, as `{ inspection, reused: true }` with HTTP 200.

Idempotency is scoped to **source inspection + operation ID**, not a globally unique workflow key. Reusing that key with a different reason or source report identity/version is a conflict. The database unique index prevents concurrent creation of two replacements for the same key. The API reloads committed state after that specific uniqueness collision, returns the winner only for a matching intent, and rejects a mismatched intent with HTTP 409. An operator may deliberately request another reinspection with a new operation ID; this is not a single-replacement-per-vehicle constraint.

Web and native controls show the historical-release warning and source lineage, require connectivity to create the replacement, and retain the same reason/version/operation ID when retrying a lost response. Creation and review/approval are never queued offline. Native capture also rejects finalized records at the camera screen, not just by hiding a navigation button. Once a new draft is cached, its ordinary offline photo-capture boundary remains [ADR 0011](0011-offline-capture-online-decisions.md); no source evidence is automatically queued into it.

If creation succeeds but native assignment refresh loses its connection, the uncached detail screen exposes an explicit Refresh action and explains that the already-created record should be loaded, not recreated. Reconnection refreshes the existing child and its lineage without resubmitting the creation POST; it does not invent an incomplete cached evidence bundle from the intake-only response.

The bundle's `requiresReinspection` flag identifies finalized legacy records missing the saved grade or report-draft fingerprint. Their report remains viewable as published history, while current buyer-readiness/QC checks stay blocked. The flag is not an authorization bypass or a general certification of every other record: normal freshness and readiness checks still apply. Native older caches that lack the flag show QC status as unverified rather than inferring current-policy approval.

## Persistence and Upgrade

[Migration `0008_audited_reinspections.sql`](../../apps/api/src/db/migrations/0008_audited_reinspections.sql) adds nullable lineage columns, source foreign keys, and the unique operation index. It does not update, backfill, delete, or rewrite historical business rows. The bootstrap schema includes the same additive fields for fresh environments.

Startup runs schema application and numbered-migration ledger checks in one Read Committed transaction under a dedicated transaction-scoped advisory lock. API and worker cold starts therefore serialize their schema/ledger work, and remember successful migration only after commit. Rollback preserves a failed upgrade for retry; this lock is separate from the serialized business-writer lock in [ADR 0013](0013-postgres-writer-snapshots-and-runtime-recovery.md).

Reference-evidence cleanup, duplicate cleanup, report repair, and synthetic recon backfill skip published originals and reinspection descendants. Runtime startup must not rewrite old evidence, report text, grade deductions, identity decisions, or assignment versions. An explicit fresh-seed option is used only when initially constructing the demo recon fixtures; it is not enabled by runtime reconciliation of persisted records.

## Alternatives Considered

- **Backfill a fingerprint from today's evidence:** falsely attributes a current policy/evidence state to a historical approval.
- **Reopen or edit the finalized inspection:** loses the immutable record of what was released and can invalidate downstream recon history.
- **Clone evidence, approvals, and spending decisions:** makes stale facts appear freshly reviewed and risks executing work without new authorization.
- **Expose history with no actionable recovery:** preserves data but strands operators who need a current-policy release. A reasoned, separately reviewed inspection provides that recovery without changing the original.

## Consequences and Release Boundary

The replacement is intentionally empty of evidence and approvals, so it requires real recapture and human work. Historical mileage and other copied entry fields are starting values, not newly verified facts. Source and replacement remain separate records; a newer release does not silently overwrite or withdraw the original, and recon spending does not transfer between them.

Persisted-record upgrade/reload and concurrency regressions check that the source's serialized inspection business fields, report, grades, and report-version content remain identical, while new lineage/audit rows survive reload. This is a business-content invariant, not a claim that physical database storage bytes or the append-only audit row count stay unchanged. These tests and the client guards do not establish damage-detection accuracy, production burst performance, or a completed deployment.

This decision resolves the implemented legacy-record recovery path only. A recoverable backup, reviewed exact infrastructure plan, the independent no-fallback model-promotion gate, AWS apply, and post-deployment authenticated/legacy workflow checks remain governed by [release status](../release-status.md) and the [runbook](../runbook.md). Do not describe branch acceptance as a live backend rollout or model certification.

## Implementation and Evidence

- [Request schema and role permissions](../../packages/shared/src/index.ts), [API endpoint](../../apps/api/src/app.ts), [domain operation and legacy flag](../../apps/api/src/store.ts), and [object-access guards](../../apps/api/src/rbac.ts).
- [Additive migration](../../apps/api/src/db/migrations/0008_audited_reinspections.sql), [schema](../../apps/api/src/db/schema.sql), [persistence and startup serialization](../../apps/api/src/postgresPersistence.ts), [API regressions](../../apps/api/src/app.test.ts), and [persisted upgrade/concurrency regressions](../../apps/api/src/postgresPersistence.integration.test.ts).
- [Web reason dialog and lineage](../../apps/web/src/components/ReinspectionControls.tsx) and [client tests](../../apps/web/src/components/ReinspectionControls.test.tsx).
- [Native reason/lineage controls](../../apps/mobile/src/components/ReinspectionPanel.tsx), [native tests](../../apps/mobile/src/components/ReinspectionPanel.test.tsx), [refresh-disconnect recovery regression](../../apps/mobile/src/screens/InspectionDetailScreen.test.tsx), [locked capture screen](../../apps/mobile/src/screens/CaptureScreen.tsx), and [capture guards](../../apps/mobile/src/screens/CaptureScreen.test.tsx).
