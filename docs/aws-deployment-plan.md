# AWS Deployment Plan

Target architecture:

- React static site on S3 and CloudFront or a managed frontend host.
- Node API on ECS/Fargate or Lambda behind API Gateway.
- Java grading service on ECS/Fargate when independent scaling or ownership is justified.
- Aurora Postgres for relational workflow records.
- S3 for vehicle images.
- EventBridge or SQS for image-analysis jobs.
- Step Functions for AI report workflow orchestration.
- Bedrock for multimodal image analysis and report drafting.
- Secrets Manager for provider and database credentials.
- CloudWatch logs, metrics, alarms, and dashboards.

Deployment stages:

1. Package API and workers as containers.
2. Configure VPC, subnets, security groups, and Aurora.
3. Deploy S3 buckets with encryption and blocked public access.
4. Add presigned upload endpoint.
5. Wire queues and workers.
6. Deploy Step Functions report workflow.
7. Add Cognito/OIDC and RBAC.

