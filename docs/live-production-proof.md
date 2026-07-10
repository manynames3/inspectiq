# Live Production Proof

This proof path is separate from the browser walkthrough. It exists to prove the deployed stack can process real uploaded vehicle photos under real auth, not just local reference evidence.

## What It Verifies

`npm run test:live-upload` creates a fresh inspection through the deployed API and verifies:

- Cognito/OIDC JWT authentication and role permissions.
- Inspector-created inspection intake.
- Separate-role proof where an Inspector captures evidence and a Reviewer reviews, approves a report version, and finalizes.
- Presigned upload intents for required vehicle photos.
- S3/object-storage photo registration and protected preview intents.
- SQS-backed image-analysis job completion.
- Bedrock-backed `VisionOutputSchema` validation unless explicitly disabled for local validation.
- Reviewer accept/edit decisions for AI suggestions.
- Required-photo checklist completion from human-confirmed photo angles.
- Deterministic condition grading.
- AI report draft creation, reviewer version approval/comment, and explicit finalization.
- Buyer-visible readiness.
- Audit events for intake, upload, analysis, review, grade, report approval, and finalization.
- EventBridge projection of `report.finalized` into DynamoDB with duplicate-safe event identity and visible DLQ/projector health.

## Inputs

Use a directory with one JPEG, PNG, or WebP for each required angle. Filenames must contain one of these tokens:

| Required angle | Filename token examples |
| --- | --- |
| `front` | `front.jpg`, `front-left.jpg`, `grille.jpg` |
| `rear` | `rear.jpg`, `back.jpg` |
| `driver_side` | `driver-side.jpg`, `left-side.jpg` |
| `passenger_side` | `passenger-side.jpg`, `right-side.jpg` |
| `interior` | `interior.jpg`, `cabin.jpg`, `dashboard.jpg` |
| `engine_bay` | `engine-bay.jpg`, `under-hood.jpg` |
| `odometer` | `odometer.jpg`, `mileage.jpg` |
| `vin_plate` | `vin-plate.jpg`, `vin.jpg` |

The script intentionally fails if any required angle is missing. For a production readiness proof, do not use generated fixtures or the local reference-evidence button.

## Prepare A Source-Documented Photo Set

The preferred proof input is a folder of captured inspection photos. For repeatable smoke testing, the repo also provides a helper that downloads the documented Ford Escape listing photo set into `/tmp` without committing third-party images:

```bash
npm run prepare:live-photos -- --out /tmp/inspectiq-live-photos-ford
```

The helper writes `sources.txt` next to the images. It uses real vehicle listing photos for front, rear, driver side, passenger side, interior, odometer, and VIN plate, plus an exact-model engine-bay reference because the listing does not publish that angle.

## Mint Cognito JWTs

For operator-run live proof, use an existing Cognito user and avoid printing the token into shell history:

```bash
export COGNITO_USER_POOL_ID="$(terraform -chdir=infra/terraform output -raw cognito_user_pool_id)"
export COGNITO_CLIENT_ID="$(terraform -chdir=infra/terraform output -raw cognito_user_pool_client_id)"
export INSPECTIQ_INSPECTOR_USERNAME="inspector@inspectiq.local"
export INSPECTIQ_INSPECTOR_PASSWORD="<password from your secure note manager>"
export INSPECTIQ_REVIEWER_USERNAME="reviewer@inspectiq.local"
export INSPECTIQ_REVIEWER_PASSWORD="<password from your secure note manager>"

mkdir -p /tmp/inspectiq-live-auth
aws cognito-idp admin-initiate-auth \
  --region us-east-1 \
  --user-pool-id "$COGNITO_USER_POOL_ID" \
  --client-id "$COGNITO_CLIENT_ID" \
  --auth-flow ADMIN_USER_PASSWORD_AUTH \
  --auth-parameters USERNAME="$INSPECTIQ_INSPECTOR_USERNAME",PASSWORD="$INSPECTIQ_INSPECTOR_PASSWORD" \
  --query 'AuthenticationResult.IdToken' \
  --output text > /tmp/inspectiq-live-auth/inspector.idtoken

aws cognito-idp admin-initiate-auth \
  --region us-east-1 \
  --user-pool-id "$COGNITO_USER_POOL_ID" \
  --client-id "$COGNITO_CLIENT_ID" \
  --auth-flow ADMIN_USER_PASSWORD_AUTH \
  --auth-parameters USERNAME="$INSPECTIQ_REVIEWER_USERNAME",PASSWORD="$INSPECTIQ_REVIEWER_PASSWORD" \
  --query 'AuthenticationResult.IdToken' \
  --output text > /tmp/inspectiq-live-auth/reviewer.idtoken
```

The Cognito app client allows `ADMIN_USER_PASSWORD_AUTH` for this operator proof path. The hosted browser login still uses the normal OIDC authorization-code flow.

## Command

```bash
LIVE_API_BASE_URL=https://imml0cczh7.execute-api.us-east-1.amazonaws.com \
LIVE_ID_TOKEN="$(cat /tmp/inspectiq-live-auth/inspector.idtoken)" \
LIVE_REVIEWER_TOKEN="$(cat /tmp/inspectiq-live-auth/reviewer.idtoken)" \
LIVE_REQUIRE_SEPARATE_ROLES=true \
LIVE_PHOTO_DIR=/tmp/inspectiq-live-photos-ford \
npm run test:live-upload
```

For an admin-only smoke test, omit `LIVE_REVIEWER_TOKEN` and `LIVE_REQUIRE_SEPARATE_ROLES`. For interview proof, prefer the separate Inspector and Reviewer command above.

## GitHub Actions

The manual workflow `.github/workflows/live-smoke.yml` runs the same proof against the deployed API. Configure these repository secrets first:

| Secret | Purpose |
| --- | --- |
| `LIVE_ID_TOKEN` | Inspector or Admin Cognito/OIDC JWT for inspection creation, upload, and analysis. |
| `LIVE_REVIEWER_TOKEN` | Reviewer or Admin Cognito/OIDC JWT for suggestion review, grade, draft, approval, and finalization. |
| `LIVE_PHOTO_SET_ZIP_BASE64` | Base64-encoded zip containing the required-angle real photo set. |

Create the photo secret from a local required-angle folder:

```bash
cd /absolute/path/to/real-vehicle-photo-set
zip -r /tmp/inspectiq-live-photos.zip .
base64 -i /tmp/inspectiq-live-photos.zip | pbcopy
```

Paste the copied value into the `LIVE_PHOTO_SET_ZIP_BASE64` repository secret.

## Expected Output

The command prints a JSON proof artifact:

```json
{
  "ok": true,
  "inspectionId": "<uuid>",
  "captureRole": "inspector",
  "reviewerRole": "reviewer",
  "separateRoleProof": true,
  "uploadedPhotos": 8,
  "suggestionsReviewed": 8,
  "providers": ["bedrockVisionProvider"],
  "grade": "B 86",
  "buyerVisibleReady": true,
  "auditEvents": [
    "ai_report.generated",
    "condition.grade_generated",
    "image_analysis.queued",
    "inspection.created",
    "photo.analyzed",
    "photo.uploaded",
    "report.approved",
    "report.finalized",
    "suggestion.accepted"
  ],
  "operationalProjection": {
    "event": { "eventType": "report.finalized", "inspectionId": "<uuid>" },
    "projector": { "configured": true },
    "eventDlq": { "visibleMessages": 0 }
  }
}
```

Keep this output with the interview notes after running a live walkthrough. It is stronger evidence than screenshots because it proves the authenticated storage, analysis, review, and audit path.

## Last Verified Live (Pre-Event-Projection Baseline)

The following historical run was verified on July 5, 2026 before report approval and the EventBridge projector were added. It proves the earlier S3/SQS/Bedrock/Neon role-separated path, not the new projection gate. Replace it with a fresh artifact after deployment:

```json
{
  "ok": true,
  "inspectionId": "d5e57106-1f1a-4fda-87ca-1d66d860aee6",
  "captureActor": "Field Inspector",
  "captureRole": "inspector",
  "reviewerActor": "Review Lead",
  "reviewerRole": "reviewer",
  "separateRoleProof": true,
  "uploadedPhotos": 8,
  "suggestionsReviewed": 10,
  "providers": ["bedrockVisionProvider"],
  "grade": "A 100",
  "buyerVisibleReady": true
}
```

## Current Reference Evidence Boundary

Local reference records still exist for deterministic review and tests. Deployed production has reference evidence disabled and expects uploaded vehicle photos. The Hyundai, Toyota, Honda, Ford, Nissan, and Subaru local reference records now use VIN-specific listing photos for the main exterior/interior evidence slots and listing-provided odometer or VIN-label-area views where public listings expose them. Missing public-listing engine-bay photos use exact year/make/model references.
