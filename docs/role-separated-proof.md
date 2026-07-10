# Role-Separated Workflow Proof

InspectIQ is intentionally role-separated so the walkthrough does not look like a single admin user clicking through everything.

## Inspector

Responsibilities:

- create assigned inspections;
- capture or upload required photo evidence;
- run image analysis;
- respond to image-quality retake guidance.

Proof in app/API:

- `inspection.created`
- `photo.uploaded`
- `image_analysis.queued`
- `photo.analyzed`

## Reviewer

Responsibilities:

- accept, reject, or edit AI suggestions;
- confirm damage;
- calculate condition grade;
- generate/edit, approve a version, and confirm finalization of the condition report.

Proof in app/API:

- `suggestion.accepted`
- `suggestion.rejected`
- `damage.added`
- `condition.grade_generated`
- `ai_report.generated`
- `report.approved`
- `report.finalized`

## Admin

Responsibilities:

- view Platform Health;
- simulate and recover failed image-analysis jobs in local mode;
- manage operational exceptions.
- inspect EventBridge/projector/DynamoDB health and replay failed domain events.

Proof in app/API:

- `image_analysis.failure_simulated`
- `image_analysis.requeued`
- `domain_event.replayed`
- `domain_event.dlq_replayed`
- Platform Health recovery status

## Local Browser Proof

```bash
npm run dev
npm run test:e2e
```

The E2E test starts an Inspector session, creates an inspection, loads evidence, analyzes photos, switches to Reviewer, resolves suggestions, grades, drafts, approves the current version, finalizes, exports a buyer report, and checks audit output.

## Live Separate-Role Proof

```bash
LIVE_API_BASE_URL=https://imml0cczh7.execute-api.us-east-1.amazonaws.com \
LIVE_ID_TOKEN="$(cat /tmp/inspectiq-live-auth/inspector.idtoken)" \
LIVE_REVIEWER_TOKEN="$(cat /tmp/inspectiq-live-auth/reviewer.idtoken)" \
LIVE_REQUIRE_SEPARATE_ROLES=true \
LIVE_PHOTO_DIR=/tmp/inspectiq-live-photos-ford \
npm run test:live-upload
```

This proves the Inspector JWT handles capture/analyze and the Reviewer JWT handles review/approval/finalization. Admin operations are demonstrated separately in Platform Health because combining an Admin token with the role proof weakens the authorization evidence.
