# AI Governance

AI output is advisory only.

Controls:

- Vision suggestions are stored as pending records.
- Accepted or edited suggestions become confirmed facts only after human action.
- Damage candidates from vision create damage items only on acceptance.
- Report drafts are schema-validated before persistence.
- Low confidence, missing evidence, or severe damage routes to human review.
- AI never finalizes a report.
- Audit events preserve provider, prompt version, confidence, review action, and finalization.

