# Tradeoffs

- The application prioritizes the complete inspection workflow while using a bridge persistence adapter for the deployed backend.
- The API includes Postgres schema and Drizzle table definitions; local server state uses a file snapshot, tests use an in-memory store for speed, and the deployed backend uses Neon Postgres behind the same store facade.
- The Java grading service is intentionally small. It is useful for showing a deterministic service boundary, but a small team might collapse it into the Node API until rules become independently owned.
- Deterministic AI providers are not pretending to be real model quality. They provide repeatable local behavior, image-quality and damage contract coverage, schema validation, and failure-mode coverage.
- Image-quality scoring is explicitly modeled because operational inspection systems fail when photos are blurry, poorly framed, low-light, or not buyer-trustworthy even if a damage classifier returns a high confidence.
- Edited AI suggestions do not become facts until explicit acceptance. That creates one extra reviewer click, but keeps the evidence model explainable.
- The local workflow completes report jobs synchronously to keep the interview flow reliable. The data model still represents async jobs so report calls can move to SQS or Step Functions when retry and latency requirements justify it.
- Terraform deploys the live AWS backend, but remote state, environment promotion, alarm notification targets, and rollback automation still need to be added before team production use.
