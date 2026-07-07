# Security

Local review:

- Role-aware UI controls and API RBAC for inspector, reviewer, and admin actions.
- Inspector: inspection intake, photo evidence capture, and image analysis.
- Reviewer: AI suggestion review, damage confirmation, grading, report drafting, and finalization.
- Admin: full workflow access, including record correction and destructive exceptions.
- No hardcoded secrets.
- Synthetic vehicle records and license-safe photographic fixtures only.

Production plan:

- Cognito or enterprise OIDC.
- JWT validation in service middleware, with API Gateway forwarding requests to Lambda. Read-only evaluation preview is explicitly separated from authenticated mutation paths.
- RBAC for inspector, reviewer, and admin actions.
- S3 presigned uploads with object-level authorization, scoped object keys, byte-size validation, MIME validation for JPEG/PNG/WebP, and SHA-256 checksum metadata.
- S3 and RDS encryption.
- Secrets Manager for database and provider credentials.
- Least-privilege IAM for API, workers, Step Functions, and queues.
- CloudTrail for infrastructure audit.

Production hardening still required before real vehicle/customer data:

- Disable role switching for authenticated users in all production builds.
- Audit sensitive read access for photos, reports, and audit-event views.
- Add tenant/account boundaries if multiple sellers, consignors, or clients share the same deployment.
- Strip EXIF metadata and normalize uploaded images before model analysis or buyer-visible preview.
- Run backup/restore and credential-rotation drills.
