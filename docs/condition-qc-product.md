# InspectIQ: condition-report QC product contract

## Product and boundary

The initial product is an inspection capture/import, condition-report drafting, and evidence-quality-control workflow for vehicle remarketing. Its differentiator must be independently demonstrated inspection quality and less reviewer effort—not an unsupported AI accuracy claim. Acquisition is the preferred business outcome; acquisition interest, customer demand, and pricing are not yet validated.

Use InspectIQ to capture photographs or import permitted photographs. Inspector notes/checklist observations are a second, explicitly attributed source. An automatically updated preliminary report is available before grading; the buyer-release workflow still requires complete evidence, a current reviewer-approved reference grade, a reviewed report, and explicit human finalization.

Ship one organization per deployment initially. Organization isolation means separate infrastructure/data/auth configuration, not merely different UI labels. The current application is not a shared multi-tenant service. An externally supported bolt-on ingestion API is later scope, even though internal application endpoints exist.

## Implemented workflow

- QC distinguishes missing views/incomplete uploads from reviewable model judgments. Missing evidence cannot be overridden.
- Every pending/edited model finding must be decided through the existing finding workflow. Uncertain candidates are retained, including multiple defects in a photograph.
- Uploaded duplicate files are detected by normalized SHA-256 checksums. This is exact-duplicate detection, not perceptual duplicate or comprehensive wrong-vehicle detection.
- VIN and mileage are independently labeled verified, discrepancy, or unable to verify. Only a complete human-confirmed reading tied to an uploaded, non-synthetic identity image can verify intake metadata. Leading zeros and separators in mileage are normalized.
- Reviewers acknowledge limitations or override judgments with a required reason. The decision and evidence fingerprint are audited. Acknowledgment never upgrades identity to verified.
- Manual damage entries can link to the inspection's photos. Cross-inspection photo attribution is rejected; manual API entries cannot masquerade as model-confirmed findings.
- Inspector checklist observations include area, outcome, note, optional supporting photo, actor, timestamp, and retry-safe operation ID. In-person observations remain attributed rather than photo-verified.
- Checklist damage not represented in structured grading inputs is flagged for a line item or explicit limitation.
- Deterministic preliminary report sections update from the recorded evidence and notes automatically. Narrative drafting is still an explicit, role-controlled action; no model call is made for every keystroke.
- Grading facts and report sources are fingerprinted. Changed grading facts require recalculation/approval; changed report evidence or grade requires a new draft. Regenerating resets report approval.
- Publication checks authoritative QC state server-side. Buyer exports independently retain identity status and evidence limitations even if a reviewer edits the narrative.
- Web evidence can open large with previous/next and keyboard navigation; mobile uses the existing enlarged photo viewer. Both have QC decisions and checklist entry. Mobile notes/decisions require a connection and are not silently queued offline.

These are workflow safeguards, not proof that damage detection reaches its target. The default deterministic local provider and reference media remain demonstrations, not real-photo validation.

## Detection scope and release acceptance

Primary evaluation categories:

1. Obvious dents.
2. Substantial scratches/scuffs or visible paint damage.
3. Broken glass or exterior lights.
4. Missing/damaged exterior parts.

Small hairline marks, hidden/internal/mechanical faults, valuation certification, and structural certification are not promised. The runtime taxonomy currently represents some lights/parts as `crack` or `unknown` with a precise explanation; evaluation uses the four categories above. Do not describe this as a dedicated trained parts detector.

Freeze “obvious” before predictions: a qualified independent observer can identify the defect from the supplied image at normal viewing size; the defect has a definite location and rights-cleared supporting photo. Ground truth is the source of eligibility, not the model's confidence or ability to see it. Record boundary/ambiguous cases separately without removing genuine misses after a run.

User-selected target: at least 95% recall of obvious in-scope defects. Adopted precision guardrail: at least 90% of emitted in-scope predictions supported by independent labels. Model scores are uncalibrated; 0.95 confidence is not 95% accuracy.

Any public claim additionally needs documented sample denominators, held-out vehicles, all four categories and clean controls, uncertainty, and independent review of vehicle-level clustering and representativeness. A handful of nearby cars can validate functionality and expose failures, but cannot establish fleet-wide accuracy.

## Field validation protocol

1. **Functional runs now:** photograph permitted nearby vehicles in all eight required views and close-ups of known defects. Include clean panels, glare, dirt/reflections, poor light, blurred images, duplicate photos, wrong intake VIN/mileage, and at least one offline capture/reconnect run. Test imported photos too.
2. **Separate development from evaluation:** tune prompts using development vehicles only. Reserve different vehicles and photograph hashes for the final test. Freeze model ID, prompt version, code commit, scope definitions, and independent labels before running predictions.
3. **Rights/provenance:** maintain photo hashes and references to ownership, written permission, a suitable license, or public-domain evidence. Listing availability alone is not evidence of reuse/training rights. Internet images are supplementary challenge cases, not automatically ground truth.
4. **Blind labeling:** a competent person labels visible defects without seeing InspectIQ predictions; a separate adjudicator resolves disagreements. Model output must never become its own ground truth.
5. **Run actual inference:** use the configured real-image provider against stored photo bytes. Preserve raw output, all candidates (including rejected/low-certainty ones), timing, token/cost metrics, failures, and recapture decisions. Do not silently replace failed inference with fixture output.
6. **Match predictions once:** the adjudicator records one-to-one evidence/location/category matches. Extra predictions of the same defect count as false positives; a model abstention on known visible damage still counts as a miss. Freeze matching rules in the referenced protocol.
7. **Reviewer value:** compare the same vehicle tasks with and without InspectIQ using separate reviewers and balanced assignment across vehicles. Measure active reviewer seconds, misses, unsupported claims, recaptures, and model cost. Time savings must not come from skipping required review. Set a commercial savings threshold after the baseline is measured; no savings claim is currently supported.
8. **Compute:** fill the evaluation template and run:

   `npm run eval:field-qc -w @inspectiq/api -- /absolute/path/to/run.json`

   Output includes denominators, per-category recall/precision, descriptive Wilson intervals, abstentions, and paired reviewer-time differences. Exit 1 means point targets/coverage are not met; exit 2 means invalid input. Exit 0 means only that supplied point targets and category/control coverage pass—not commercial certification.

The calculator checks structural consistency, duplicate hashes, tuning leakage, separate labeler/adjudicator identities, pre-run label timestamps, and reference-provider exclusion. It also reports whether each category independently meets the point targets; a pooled score must not hide a weak category. Independence, licensing, honest matching, and real inference provenance remain documentary attestations requiring external verification. Wilson intervals assume independent findings; they are not vehicle-cluster-adjusted.

No field-run manifest/results are included yet. Synthetic unit tests validate the calculator and guards only.

## Acquisition/commercial evidence still required

- Rights-cleared, independently labeled held-out real-car results; categorized misses, false positives, and robustness under difficult capture conditions.
- A measured reviewer-time baseline and assisted results with no quality regression; actual inference/storage/operating costs per vehicle.
- A qualified user's review of report terminology/disclosures and workflow usefulness. No customer visits are required now, but eventual customer validation cannot be replaced by internal tests.
- A production deployment recovery/restore exercise, permission-isolation and upload-security checks, concurrency/load evidence, mobile-device field proof, and a repeatable handover runbook.
- A clear code/dependency/data-rights inventory, reproducible deployment, secrets ownership, software bill of materials, and known-limitations list.
- Buyer-facing presentation/export polish and a supported integration/ingestion contract before selling as a bolt-on. Current buyer export remains plain text; this work does not claim a finished enterprise PDF/package.

Read `docs/runbook.md` and `docs/implementation-boundary.md` for the existing AWS path and deployment limits. This change does not provision paid infrastructure, deploy to production, create a shared-tenant service, or prove an acquisition moat.

Before upgrading a persisted deployment, define a legacy-record policy: old grades/drafts without freshness fingerprints cannot satisfy the new release checks. Mutable records need recalculation and redrafting; finalized historical records remain immutable and require an explicit correction/replacement workflow. This change does not silently certify or overwrite historical reports.

## Acceptance checks

- No metadata-only identity verification.
- No silent one-candidate cap or low-certainty damage filtering.
- No cross-vehicle evidence links.
- Notes-only preliminary draft is attributed and never buyer-final.
- Missing uploads/views cannot be overridden.
- Subjective overrides have actor/reason/evidence audit records.
- Stale evidence and stale grades cannot be published.
- Editing/regenerating requires approval again.
- Evaluation sessions remain read-only.
- Unknown condition stays explicit in reports and exports.
- Independent evaluation rejects fixture results and leakage; abstentions cannot improve recall by removing misses.

Automated checks exercise these safeguards. Independent real-photo performance and enterprise readiness are separate, outstanding gates.
