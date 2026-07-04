# AWS Deployment Plan

Target architecture:

```txt
React
-> API Gateway + Lambda or ECS/Fargate API
-> Neon Free Postgres for low-cost portfolio deployment or Aurora Postgres for AWS-native production
-> S3 image objects
-> SQS/EventBridge image-analysis jobs
-> Lambda or ECS image worker
-> Bedrock/Rekognition/custom model
-> validated suggestion records
-> audit trail
```

Supporting services:

- Java grading service on ECS/Fargate when independent scaling or ownership is justified.
- Step Functions for report workflow retries and long-running status.
- Secrets Manager for model and database credentials.
- KMS for S3/RDS encryption.
- CloudWatch logs, metrics, alarms, and dashboards.
- Cognito or enterprise OIDC for role claims.

Deployment stages:

1. Package API and workers as containers.
2. Configure VPC, subnets, security groups, and Aurora.
3. Deploy S3 buckets with encryption and blocked public access.
4. Add presigned upload endpoint.
5. Wire queues and workers.
6. Deploy Step Functions report workflow.
7. Map the existing RBAC actions to Cognito/OIDC groups and JWT claims.
8. Add CloudWatch dashboards for image analysis success, missing angle rate, human review rate, grade latency, finalization rate, and suggestion acceptance.

Persistence migration:

1. Keep the current `MemoryStore` behavior as a test fixture only.
2. Implement a Postgres repository behind the same store-facing operations.
3. Add migrations for `inspections`, `vehicle_photos`, `photo_analysis_results`, `vision_suggestions`, `damage_items`, `condition_grades`, `ai_report_jobs`, `ai_report_drafts`, `final_reports`, and `audit_events`.
4. Wrap reviewer accept/edit/reject, damage confirmation, grading, and finalization in transactions.
5. Store image bytes only in S3; keep Postgres to object keys, checksums, MIME metadata, provider outputs, and audit facts.
6. Add backups, retention, append-only audit conventions, and data export policy before production use.

Image worker requirements:

- idempotency key per photo/provider/prompt version;
- retry policy and DLQ;
- raw provider output stored separately from validated output;
- `VisionOutputSchema` validation before suggestions are created;
- image-quality retake routing before buyer-visible release;
- provider latency, failure, and schema-rejection metrics.
