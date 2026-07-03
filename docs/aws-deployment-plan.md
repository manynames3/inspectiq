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
