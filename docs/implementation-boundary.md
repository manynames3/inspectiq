# Implementation Boundary

This project is strongest when presented as a production-shaped inspection workflow, not as a claim that local deterministic providers are production computer vision.

## Real In The Repo

- End-to-end inspection workflow from intake through required photos, analysis, suggestion review, grading, report draft, finalization, and audit trail.
- Role-aware Inspector, Reviewer, and Admin actions enforced in UI and API RBAC.
- State machine guards for evidence completion, grading, report generation, finalization, and post-finalization immutability.
- Shared Zod schemas for API inputs, vision output, grading output, report output, and suggestion edits.
- Vision-provider contract storing raw output, validated output, provider name, prompt version, confidence, image-quality scores, and audit metadata.
- Image-analysis job records with queued/running/completed/failed/dead-letter state and idempotency keys.
- Upload intent endpoint and photo records carrying object bucket, object key, thumbnail key, byte size, MIME type, and checksum metadata.
- Backend-derived readiness blockers for CR readiness, VDP readiness, and buyer-visible release.
- Buyer-ready text report export that avoids schema/provider/internal debug language.
- Deterministic grading rules in Python with an equivalent Node fallback for reliable local operation.
- Postgres schema, Drizzle table definitions, and deployed `PERSISTENCE_MODE=postgres` persistence against Neon through the existing `pg` client.
- S3 presigned upload intent, private object metadata, and image redirect flow.
- SQS-backed image-analysis jobs processed by a Lambda worker.
- Bedrock multimodal provider using the same `VisionOutputSchema` contract as local analysis.
- Live uploaded-photo proof command for Cognito, presigned S3 uploads, SQS/Bedrock image analysis, reviewer approval, finalization, buyer-visible readiness, and audit events.
- Formal vision evaluation command and dataset for angle accuracy, OCR accuracy, damage false positives, retake precision, and retake recall.
- JWT verification path with RS256/JWKS validation plus API object-level inspection authorization tests.
- Platform Health SLO panels plus Terraform-managed CloudWatch alarms and dashboard widgets.
- Cloudflare Pages deployment for the hosted walkthrough and AWS API Gateway/Lambda for the backend.

## Deterministic Local By Design

- Vision and report providers are deterministic so tests and walkthroughs do not fail because of missing model credentials, model latency, cost, or nondeterministic output.
- Local reference evidence exists for reliable walkthroughs and repeatable tests. The deployed backend disables reference-evidence loading and expects captured uploads. The Hyundai Tucson, Toyota Camry, Honda Accord, Ford Escape, Nissan Rogue, and Subaru Outback records now use VIN-specific listing photos for the main exterior/interior evidence slots and real listing-provided odometer or VIN-label-area views where public listings expose them. Remaining engine-bay gaps use documented exact year/make/model gallery references rather than unrelated photos.
- Local file persistence exists for reliable walkthroughs and repeatable tests. The deployed backend uses Neon Postgres with transactional row-level upserts/deletes through the store bridge. The next production step is DB-first repositories for the busiest mutation paths.
- Local browser uploads can use small preview payloads; the deployed path writes image objects through presigned S3 upload URLs.
- Role headers simulate authenticated claims for local tests; the deployed frontend uses Cognito hosted OIDC and the API validates JWTs through API Gateway and service middleware.

## Production Path

```txt
React workbench
-> Cloudflare Pages
-> API Gateway + Lambda API
-> Neon Postgres persistence
-> Presigned S3 image upload
-> API-created SQS image-analysis job
-> Lambda image worker
-> Bedrock multimodal model
-> VisionOutputSchema validation
-> vision_suggestions + photo_analysis_results + audit_events
-> reviewer accept/edit/reject
-> Python grading service or in-process rules, depending on ownership
-> report job workflow
-> finalized condition report
```

The deployed backend enforces Cognito JWTs at API Gateway and validates JWT/JWKS claims again in the API service before applying object-level inspection authorization. Cognito groups and role claims map to Inspector, Reviewer, or Admin; owner/operator email allowlists can bootstrap a role for live walkthrough accounts; authenticated users without an app role claim or email mapping default to the least-privileged Inspector role unless `REQUIRE_JWT_ROLE_CLAIM=true` is set. Local development keeps role headers so tests and walkthroughs remain fast.

## Python Boundary Decision

The Python service is intentionally small. The right interview explanation is:

> I separated grading to show how deterministic, auditable business rules can live behind a versioned service boundary. I would keep that boundary if grading is independently owned, reused by other systems, or released on a different cadence. I would collapse it into the Node API if the team is small and the boundary adds operational cost without ownership benefit.

## Image Analysis Decision

The local provider is not a model-quality claim. It is a contract and workflow claim:

- output must include required angle, confidence, image-quality scores, quality warnings, damage candidates, repair estimate range, OCR values, and human-review routing;
- output must validate before persistence;
- raw and validated outputs are stored separately;
- every AI-generated fact remains advisory until a reviewer accepts or edits it;
- retake-required image quality warnings block buyer-visible release until resolved.
- model/prompt changes should pass `npm run eval:vision` before promotion.
