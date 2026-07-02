# Terraform Skeleton

This folder sketches the AWS production shape for InspectIQ. It intentionally omits account-specific packaging, networking, and image build steps.

Included:

- S3 bucket for vehicle images with encryption.
- SQS queues for image analysis and report generation.
- CloudWatch log groups.
- Secrets Manager secret.
- Aurora Postgres skeleton.
- Step Functions report workflow skeleton.

Production work still needed:

- VPC, private subnet, and security group wiring.
- ECS/Fargate or Lambda package deployment for API and workers.
- IAM policies scoped to exact S3 prefixes, queues, and secrets.
- API Gateway or ALB routing.
- CloudWatch alarms and dashboards.

