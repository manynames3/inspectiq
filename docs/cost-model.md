# Cost Model

Rough assumptions for 1,000 inspections:

- 10 photos per inspection.
- 10,000 image objects stored in S3.
- 10,000 image-analysis model calls.
- 1,000 report-generation model calls.
- API and worker requests through Lambda or containers.
- Aurora/RDS and CloudWatch as the steady baseline.

Main cost drivers:

- Multimodal image analysis calls.
- Report generation tokens.
- Postgres baseline capacity.
- CloudWatch log volume.
- Image storage and transfer.

Cost controls:

- Deterministic local providers for development and tests.
- Retake detection before expensive model calls where possible.
- Store thumbnails and lifecycle older originals.
- Use idempotency to avoid duplicate jobs.
- Apply log sampling and retention policies.
