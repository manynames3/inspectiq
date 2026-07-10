# AI Governance

AI output is advisory only.

Controls:

- Vision suggestions are stored as pending records.
- Vision output is prompt-versioned and validated against `VisionOutputSchema`.
- Image-analysis jobs are idempotent and auditable before suggestions are materialized.
- Image quality scores and retake policy are separate from damage confidence.
- Damage candidates include confidence, severity, and repair estimate range for reviewer triage.
- Edited suggestions remain review records until a reviewer accepts them.
- Accepted suggestions become confirmed facts only after human action.
- Damage candidates from vision create damage items only on acceptance.
- Report drafts are schema-validated before persistence.
- Low confidence, missing evidence, or severe damage routes to human review.
- Retake-required quality warnings hold buyer-visible release until a reviewer resolves them.
- Buyer-visible release is blocked while required evidence, failed analysis, unreviewed suggestions, missing grade, or missing final report remain.
- AI never approves or finalizes a report; Reviewer approval is bound to an exact optimistic version before finalization.
- Audit events preserve provider/model, prompt version, schema, latency, token/cost metadata, confidence, review action, approval, and finalization.
- Monthly model operations are idempotently reserved in DynamoDB before invocation; limits preserve evidence and return `COST_GUARD_REACHED` rather than spending silently.
- Model/prompt promotion requires the no-fallback Bedrock evaluation; deterministic CI proves only contract mechanics.
