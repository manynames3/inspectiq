# Security

Local review:

- Role-aware UI controls and API RBAC for inspector, reviewer, and admin actions.
- Inspector: inspection intake, photo evidence capture, and image analysis.
- Reviewer: AI suggestion review, damage confirmation, grading, report drafting/version approval, and finalization.
- Admin: full workflow access, including record correction and destructive exceptions.
- No hardcoded secrets.
- Synthetic vehicle records, sourced reference imagery for local reference records, and generated identity evidence only.

Implemented deployed controls:

- Cognito OIDC Authorization Code + PKCE for web/mobile, Cognito groups, and JWT role claims.
- JWT validation in service middleware, with API Gateway forwarding requests to Lambda. Read-only evaluation preview is explicitly separated from authenticated mutation paths.
- RBAC for inspector, reviewer, and admin actions.
- S3 presigned uploads with object-level authorization, scoped object keys, byte-size validation, MIME validation for JPEG/PNG/WebP, and SHA-256 checksum metadata.
- S3 encryption and managed Postgres transport/storage controls.
- Secrets Manager for database and provider credentials.
- Least-privilege IAM for API Lambda, image worker Lambda, S3, SQS, Secrets Manager, Bedrock, and CloudWatch.
- Separate Python projector IAM for conditional DynamoDB writes; EventBridge target and DLQ permissions are resource-scoped.
- SecureStore for mobile tokens, SQLite/sandbox separation for offline operations/photos, and sign-out cleanup.
- Stable mobile operation IDs, checksums, and idempotent upload confirmation.
- CloudTrail for infrastructure audit.

Production hardening still required before real vehicle/customer data:

- Decompose public and protected API Gateway routes and attach the existing JWT authorizer to protected routes; current service middleware is the protected-route enforcement point.
- Audit sensitive read access for photos, reports, and audit-event views.
- Add tenant/account boundaries if multiple sellers, consignors, or clients share the same deployment.
- Add enterprise MFA/session/revocation policy and prove group provisioning/rotation drills.
- Run backup/restore and credential-rotation drills.
