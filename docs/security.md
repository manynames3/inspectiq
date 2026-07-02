# Security

Local demo:

- Role selector for inspector, reviewer, and admin.
- No hardcoded secrets.
- Synthetic data and generated placeholder images only.

Production plan:

- Cognito or enterprise OIDC.
- JWT validation at API Gateway or service middleware.
- RBAC for inspector, reviewer, and admin actions.
- S3 presigned uploads with object-level authorization.
- S3 and RDS encryption.
- Secrets Manager for database and provider credentials.
- Least-privilege IAM for API, workers, Step Functions, and queues.
- CloudTrail for infrastructure audit.

