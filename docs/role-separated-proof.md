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

## Recon Coordinator

Responsibilities:

- create and revise recon recommendations;
- submit estimates for policy or consignor authorization;
- coordinate authorized work;
- record quality control; and
- recalculate sale readiness.

Proof in app/API:

- `recon.estimate_created`
- `recon.authorization_requested`
- `work_order.created`
- `quality_control.passed`
- `vehicle.sale_readiness_changed`

## Consignor Approver

Responsibilities:

- view only represented consignor accounts;
- approve, decline, or request revision;
- see policy-authorized work separately from personal decisions.

Proof in app/API:

- object-level access returns `403` for an unrelated consignor;
- `recon.item_authorized`
- `recon.item_declined`

## Technician

Responsibilities:

- update assigned and authorized work;
- record progress, blockers, and revised estimates;
- send completed work to quality control.

Proof in app/API:

- `work_order.started`
- `work_order.blocked`
- `recon.reauthorization_required`

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

API integration tests continue the published report through policy authorization, manual approval and decline, idempotent work-order creation, overrun reauthorization, failed-QC recovery, and sale readiness. They also reject unauthorized consignor access.

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

Terraform defines the additional Recon Coordinator, Consignor Approver, and Technician Cognito groups. A live environment must apply that plan and assign test users before claiming a six-user live Cognito walkthrough; local role-header and API integration proof do not substitute for that deployment evidence.
