# Release Status and Backend Safety Gates

This document separates Git visibility, frontend delivery, and backend compatibility. Scope: the unmerged `agent/inspection-recon-operations` branch; `main` remains the historical baseline plus a pointer to the active work.

## Verified Baseline

- Frontend: Supreme AI Ventures styling, evidence workbench, and compatible reinspection/history surfaces deployed at [`9d10913`](https://github.com/manynames3/inspectiq/actions/runs/38370130534) to [InspectIQ Pages](https://inspectiq.pages.dev/); immutable deployment URL [6fdf5596](https://6fdf5596.inspectiq.pages.dev/). Three new files were uploaded. The required read-only live smoke passed on 2026-10-13. Production browser QA confirmed the older API's report is labeled current-QC unverified and exposes no unsupported reinspection action.
- AWS backend: last successful [apply at `f0c8697`](https://github.com/manynames3/inspectiq/actions/runs/30098914862). A deployment plan is not an apply.
- Reviewed [AWS plan at `9d10913`](https://github.com/manynames3/inspectiq/actions/runs/38370130011): zero additions, three in-place Lambda code updates, zero destruction. The guard parsed the actual saved plan and accepted only those code/computed changes. Apply and post-apply steps were **skipped**; the model gate remains separate from infrastructure safety.
- Native: [Android CI at `0d58344`](https://github.com/manynames3/inspectiq/actions/runs/38373633881) passed both the internal arm64 APK and the Maestro emulator journey; the application source is unchanged from `9d10913`. The older [tour capture](images/tour/README.md) retains its exact APK/emulator provenance. Emulator success is not physical-device or authenticated field proof.
- Branch CI: [all eight jobs at `9d10913`](https://github.com/manynames3/inspectiq/actions/runs/38370051612) passed, including Linux visual regression, real Postgres, and browser E2E.
- Database: a read-only production ledger check on 2026-10-13 confirmed numbered migrations `0001`–`0007` are applied. The subsequent branch changes add `0008` and serialized startup; they are not yet applied.

### Android Emulator Follow-up

The `9d10913` x86 APK compiled, but its [Maestro journey](https://github.com/manynames3/inspectiq/actions/runs/38370051703/job/115204499722) failed when a recurring **Quickstep launcher** ANR modal obscured accessibility. The captured screenshot shows the expected Review queue and 22 findings behind that system modal; logcat identifies `com.android.launcher3`, with no captured InspectIQ fatal stack. This is not a passing native journey or proof of physical-device performance.

The follow-up [test-only change `0d58344`](https://github.com/manynames3/inspectiq/commit/0d583447b0559a7e3fc276def42c9e1f61fb8210) closes only the exact Android Quickstep modal, with three bounded attempts, at transition boundaries. It preserves every product assertion and cannot dismiss an InspectIQ ANR. All 18 workflow/plan tests and Maestro syntax checks passed. The [emulator rerun](https://github.com/manynames3/inspectiq/actions/runs/38373633881) **passed both jobs**, including the complete Maestro journey. The application source remains identical to the deployed/tested `9d10913` revision.

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

The active branch now fixes writer snapshot/lock ordering, commit acknowledgment, and failed-runtime cache recovery. The recorded real Postgres tests failed before and passed after the fix; [ADR 0013](adr/0013-postgres-writer-snapshots-and-runtime-recovery.md) explains the constraints. The newer `9d10913` read-only browser smoke passed, but those source fixes are **not** a live API repair until AWS is safely promoted. A passing warmed tour does not establish recovered cold-start concurrency or verification of the new authenticated release path.

### Promotion Gates

Before applying the newer API:

1. Preserve published history using the authorized, implemented audited reinspection policy. Never fabricate current fingerprints for legacy facts.
2. Verify persisted-record upgrade tests and UI/export handling, alongside mutable drafts, changed damage, identity limitations, recon readiness, and rollback. Branch tests are not production proof.
3. Verify a recoverable production backup/restore point and inspect the exact Terraform plan being applied. Reject unexpected destruction, replacement, privilege/network changes, and persistent-resource changes.
4. Review the changed Bedrock prompt with the no-fallback model-promotion gate and appropriate rights-cleared evidence. Deterministic contract success is not a measured recall/precision result.
5. After apply, verify authenticated QC/report/recon behavior and legacy-record handling in addition to health and public evaluation listing.

The AWS workflow saves and applies its own plan in one run. Dispatching a separate `apply` run creates a fresh plan; it does **not** apply a previously reviewed plan artifact. The new [plan guard](../scripts/check-aws-code-plan.mjs) checks that exact saved plan immediately before apply, allowing only in-place code/computed changes to the three existing InspectIQ Lambdas and rejecting other resource/configuration actions. See the [workflow](../.github/workflows/deploy-aws.yml), [production readiness](production-readiness.md), and [runbook](runbook.md).

The owner rejected the proposed $10 ceiling and authorized **at most $1 total** on 2026-10-13. A [free, cost-only CountTokens preflight](../evals/bedrock-cost-preflight-2026-10-13.json) counted the exact 108 transformed inputs for the unchanged `photo-analysis-v5-recall-review` prompt: 246,200 input tokens. At the published US geographic Sonnet 4.6 rates ($3.30 input / $16.50 output per million tokens), inference inputs would cost $0.81246, leaving only $0.18754 for all outputs (about 105 output tokens per image). The unchanged 1,400-token-per-response limit yields a $3.30726 single-attempt upper bound; inference retries could add charges. This is an input count and upper bound, **not an actual-inference cost, an enforced cap, or an accuracy result**. No paid inference ran; actual inference spending for this attempt is **$0**.

The full, no-fallback model gate remains unrun: completion within $1 is not established. The paid evaluation runner does not yet have a persistent, retry-safe spending cap; do not dispatch it under this authorization. Do not change models, shrink the corpus, lower thresholds, or count a partial/preflight run as promotion success to fit the budget. AWS remains at `f0c8697` until the complete gate passes within authorized spending. The promotion workflow now rejects cost-only reports even if their utility exits successfully. [AWS confirms token counting is free](https://docs.aws.amazon.com/bedrock/latest/userguide/count-tokens.html); [published provider rates](https://www-cdn.anthropic.com/files/4zrzovbb/website/3684c2faafb97418665782cea0001f439f74b1d2.pdf) include the US geographic premium.
