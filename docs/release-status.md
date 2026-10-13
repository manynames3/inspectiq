# Release Status and Backend Safety Gate

This document separates Git visibility, frontend delivery, and backend compatibility. Scope: the unmerged `agent/inspection-recon-operations` branch; `main` remains the historical baseline plus a pointer to the active work.

## Verified Baseline

- Frontend: Supreme AI Ventures styling and evidence workbench at `2b49dee`, deployed to [InspectIQ Pages](https://inspectiq.pages.dev/). Documentation/test-only updates do not imply an API rollout.
- AWS backend: last successful [apply at `f0c8697`](https://github.com/manynames3/inspectiq/actions/runs/30098914862). A deployment plan is not an apply.
- Reviewed [AWS plan at `2b49dee`](https://github.com/manynames3/inspectiq/actions/runs/38357983624): zero additions, three in-place Lambda code updates, zero destruction. It was **not applied** because code/data compatibility is a separate gate from infrastructure safety.
- Native: [Android CI at `2b49dee`](https://github.com/manynames3/inspectiq/actions/runs/38339742078) passed both jobs; the [tour capture](images/tour/README.md) records the actual arm64 APK and emulator provenance.
- Database: a read-only production ledger check on 2026-10-13 confirmed numbered migrations `0001`–`0007` are applied. Those migrations, startup persistence code, and Terraform are unchanged relative to `f0c8697`.

## Why the New AWS Backend Is Not Yet Applied

The newer condition-report QC backend requires a `gradeEvidenceFingerprint` and a report-source fingerprint to prevent approving or publishing stale facts. The old backend did not save these fields. New demo seeds do not upgrade existing persisted records.

A read-only aggregate check found two legacy grades and one finalized report using a legacy grade. A local reproduction removed only the fingerprint from a finalized, buyer-ready record: readiness became blocked as stale, but regrading was rejected because finalized inspections are immutable. New QC exceptions may also require explicit review. This is a real compatibility boundary, not a missing SQL migration or a reason to invent a current fingerprint for historical evidence.

Do not silently backfill fingerprints from today's facts, bypass QC, rewrite historical approval, or label old records as validated by a policy that did not exist when they were published.

## Required Backend Promotion Decision

Before applying the newer API:

1. Choose an explicit legacy-record policy: preserve published artifacts as historical records and require a new reviewed inspection for a current-policy release, or implement an audited reviewer-led amendment/reinspection flow. Both must retain immutable prior versions and disclose limitations.
2. Verify that policy with persisted-record upgrade tests, not just newly seeded memory records. Include finalized legacy reports, mutable drafts, changed damage, identity limitations, recon readiness, and rollback.
3. Verify a recoverable production backup/restore point and inspect the exact Terraform plan being applied. Reject unexpected destruction, replacement, privilege/network changes, and persistent-resource changes.
4. Review the changed Bedrock prompt with the no-fallback model-promotion gate and appropriate rights-cleared evidence. Deterministic contract success is not a measured recall/precision result.
5. After apply, verify authenticated QC/report/recon behavior and legacy-record handling in addition to health and public evaluation listing.

The existing AWS workflow saves and applies its own plan in one run. Dispatching a separate `apply` run creates a fresh plan; it does **not** apply a previously reviewed plan artifact. See the [workflow](../.github/workflows/deploy-aws.yml), [production readiness](production-readiness.md), and [runbook](runbook.md).
