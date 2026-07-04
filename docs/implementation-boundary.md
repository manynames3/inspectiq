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
- Deterministic grading rules in Java with an equivalent Node fallback for reliable local operation.
- Postgres schema, Drizzle table definitions, and optional `PERSISTENCE_MODE=postgres` persistence through the existing `pg` client.
- Cloudflare Pages deployment path for a hosted walkthrough.

## Deterministic Local By Design

- Vision and report providers are deterministic so tests and walkthroughs do not fail because of missing model credentials, model latency, cost, or nondeterministic output.
- Local file/KV persistence exists for reliable walkthroughs and repeatable tests. Postgres mode exists for a real relational path, but the next production step is a per-operation repository rather than whole-store snapshot writes.
- Browser image uploads use small preview payloads; production should write image objects through presigned S3 upload URLs.
- Role headers simulate authenticated claims; production should use Cognito or enterprise OIDC.

## Production Path

```txt
React workbench
-> API Gateway + Lambda or ECS/Fargate API
-> Postgres repository with migrations, indexes, and transaction-scoped writes
-> Presigned S3 image upload
-> S3 metadata event or API-created job
-> SQS/EventBridge image-analysis queue
-> Lambda/ECS image worker
-> Bedrock/Rekognition/custom model
-> VisionOutputSchema validation
-> vision_suggestions + photo_analysis_results + audit_events
-> reviewer accept/edit/reject
-> Java grading service or in-process rules, depending on ownership
-> report job workflow
-> finalized condition report
```

## Java Boundary Decision

The Java service is intentionally small. The right interview explanation is:

> I separated grading to show how deterministic, auditable business rules can live behind a versioned service boundary. I would keep that boundary if grading is independently owned, reused by other systems, or released on a different cadence. I would collapse it into the Node API if the team is small and the boundary adds operational cost without ownership benefit.

## Image Analysis Decision

The local provider is not a model-quality claim. It is a contract and workflow claim:

- output must include required angle, confidence, image-quality scores, quality warnings, damage candidates, repair estimate range, OCR values, and human-review routing;
- output must validate before persistence;
- raw and validated outputs are stored separately;
- every AI-generated fact remains advisory until a reviewer accepts or edits it;
- retake-required image quality warnings block buyer-visible release until resolved.
