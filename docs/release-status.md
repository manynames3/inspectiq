# Release Status and Backend Safety Gates

This document separates Git visibility, frontend delivery, and backend compatibility. Scope: the unmerged `agent/inspection-recon-operations` branch; `main` remains the historical baseline plus a pointer to the active work.

## Verified Baseline

- Frontend: Supreme AI Ventures styling and evidence workbench, deployed at [`6deeb1b`](https://github.com/manynames3/inspectiq/actions/runs/38359117411) to [InspectIQ Pages](https://inspectiq.pages.dev/). The new reinspection UI is a subsequent branch implementation, not yet that deployment.
- AWS backend: last successful [apply at `f0c8697`](https://github.com/manynames3/inspectiq/actions/runs/30098914862). A deployment plan is not an apply.
- Reviewed [AWS plan at `2b49dee`](https://github.com/manynames3/inspectiq/actions/runs/38357983624): zero additions, three in-place Lambda code updates, zero destruction. It was **not applied** because code/data compatibility is a separate gate from infrastructure safety.
- Native: [Android CI at `2b49dee`](https://github.com/manynames3/inspectiq/actions/runs/38339742078) passed both jobs; the [tour capture](images/tour/README.md) records the actual arm64 APK and emulator provenance.
- Database: a read-only production ledger check on 2026-10-13 confirmed numbered migrations `0001`–`0007` are applied. The subsequent branch changes add `0008` and serialized startup; they are not yet applied.

## Why the New AWS Backend Is Not Yet Applied

The newer condition-report QC backend requires a `gradeEvidenceFingerprint` and a report-source fingerprint to prevent approving or publishing stale facts. The old backend did not save these fields. New demo seeds do not upgrade existing persisted records.

A read-only aggregate check found two legacy grades and one finalized report using a legacy grade. A local reproduction removed only the fingerprint from a finalized, buyer-ready record: readiness became blocked as stale, but regrading was rejected because finalized inspections are immutable. New QC exceptions may also require explicit review. This is a real compatibility boundary, not a missing SQL migration or a reason to invent a current fingerprint for historical evidence.

Do not silently backfill fingerprints from today's facts, bypass QC, rewrite historical approval, or label old records as validated by a policy that did not exist when they were published.

## Authorized History-Preservation Policy

The owner authorized a separately audited reinspection and AWS rollout on 2026-10-13. [ADR 0014](adr/0014-audited-reinspection-with-immutable-history.md) records the implemented policy: preserve the original report, grade, inspection facts, and versions; append actor/reason lineage audits; create a fresh draft with intake metadata only. Historical web/native reports and exports disclose the current-policy limitation. No evidence, approvals, spending authority, or work are carried forward.

Real Postgres tests cover an actual `0001`–`0007` legacy schema upgraded to `0008`, unchanged prior content, persisted replacement/reload, conflicting requests, rollback, and concurrent cold-start migrations. These establish migration/workflow behavior, not retrospective approval or production model accuracy.

Final local `make verify-full` passed on 2026-10-13: 146 API tests (including 11 real Postgres cases), 52 web tests, 53 native tests, security/workflow checks, deterministic vision evaluation, builds, Python suites, Terraform validation, browser E2E, and all 13 visual/accessibility/overflow comparisons. Visual baselines were not updated. Browser QA also created a local-only replacement through the real reason dialog and verified its empty evidence state and original-version link. Physical-device capture and authenticated production reinspection have not been verified for this release.

Production snapshot `snap-icy-butterfly-atd3j37p` (`inspectiq-pre-reinspection-2026-10-13`) was created from the existing main Neon branch on 2026-10-13 at 07:38:40 UTC; it expires 2026-10-20 at 08:00 UTC. Listing confirmed it exists. No restore has been exercised. Before deployment, aggregate content digests were recorded for the one published inspection, grade, and report; production currently has no report-version rows for that publication. Verify the same content after rollout, excluding the new nullable lineage columns from inspection comparison.

### Existing API Availability Issue

The web deployment at [commit `6deeb1b`](https://github.com/manynames3/inspectiq/actions/runs/38359117411) succeeded, and [all eight branch CI jobs](https://github.com/manynames3/inspectiq/actions/runs/38359124729) passed. Its required live smoke nevertheless reproduced intermittent 500/preflight failures from the unchanged `f0c8697` AWS API. Serial health/detail/preflight probes succeeded; Lambda error stacks identified bootstrap Postgres serialization failures, not missing frontend assets.

The active branch now fixes writer snapshot/lock ordering, commit acknowledgment, and failed-runtime cache recovery. The recorded real Postgres tests failed before and passed after the fix; [ADR 0013](adr/0013-postgres-writer-snapshots-and-runtime-recovery.md) explains the constraints. Those source fixes are **not** a live API repair until AWS is safely promoted. Do not report the release as a clean end-to-end production pass merely because one warmed request succeeds.

### Promotion Gates

Before applying the newer API:

1. Preserve published history using the authorized, implemented audited reinspection policy. Never fabricate current fingerprints for legacy facts.
2. Verify persisted-record upgrade tests and UI/export handling, alongside mutable drafts, changed damage, identity limitations, recon readiness, and rollback. Branch tests are not production proof.
3. Verify a recoverable production backup/restore point and inspect the exact Terraform plan being applied. Reject unexpected destruction, replacement, privilege/network changes, and persistent-resource changes.
4. Review the changed Bedrock prompt with the no-fallback model-promotion gate and appropriate rights-cleared evidence. Deterministic contract success is not a measured recall/precision result.
5. After apply, verify authenticated QC/report/recon behavior and legacy-record handling in addition to health and public evaluation listing.

The AWS workflow saves and applies its own plan in one run. Dispatching a separate `apply` run creates a fresh plan; it does **not** apply a previously reviewed plan artifact. The new [plan guard](../scripts/check-aws-code-plan.mjs) checks that exact saved plan immediately before apply, allowing only in-place code/computed changes to the three existing InspectIQ Lambdas and rejecting other resource/configuration actions. See the [workflow](../.github/workflows/deploy-aws.yml), [production readiness](production-readiness.md), and [runbook](runbook.md).

The paid 108-image, no-fallback Bedrock gate is awaiting explicit spending approval (requested ceiling: $10). It has not been run for this release. Do not bypass it, equate deterministic evaluation with real-provider evidence, or label the AWS rollout complete while that gate is pending.
