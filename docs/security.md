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
- JWT validation at API Gateway or service middleware.
- RBAC for inspector, reviewer, and admin actions.
- S3 presigned uploads with object-level authorization.
- S3 and RDS encryption.
- Secrets Manager for database and provider credentials.
- Least-privilege IAM for API, workers, Step Functions, and queues.
- CloudTrail for infrastructure audit.
