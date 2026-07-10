# InspectIQ AWS Infrastructure

Terraform deploys the live AWS backend for InspectIQ in `us-east-1`.

## Deployed Shape

- API Gateway HTTP API.
- Node.js Lambda API packaged from `apps/api/src/lambda.ts`.
- Lambda image-analysis worker packaged from `apps/api/src/imageWorker.ts`.
- Private S3 bucket for vehicle photos with blocked public access, CORS, and server-side encryption.
- SQS image-analysis queue plus DLQ.
- Custom EventBridge bus, Python 3.12 operations-projector Lambda, and a separate domain-event DLQ.
- On-demand DynamoDB table for event idempotency, TTL operational timelines, latest state, and Bedrock usage reservations.
- Secrets Manager secret for the Neon pooled Postgres URL.
- Cognito user pool, app client, and hosted domain.
- CloudWatch/X-Ray, 30-day logs, alarms, dashboard, optional SNS email, and a $50 monthly budget.
- Bedrock IAM permissions for the configured multimodal inference profile.
- Cognito groups for `inspector`, `reviewer`, and `admin`; Lambda validates JWTs on protected endpoints. A gateway JWT authorizer is provisioned for future explicit protected-route decomposition.
- GitHub OIDC deploy role scoped to the `manynames3/inspectiq` production environment.

## Commands

```bash
npm run build:lambda
npm run build:projector
terraform -chdir=infra/terraform init
terraform -chdir=infra/terraform plan -out=tfplan
terraform -chdir=infra/terraform apply tfplan
```

After the first apply, store the Neon connection string in the generated Secrets Manager secret. Do not commit or print the connection string.

```bash
SECRET_ARN="$(terraform -chdir=infra/terraform output -raw database_secret_arn)"
aws secretsmanager put-secret-value \
  --region us-east-1 \
  --secret-id "$SECRET_ARN" \
  --secret-string "$DATABASE_URL"
```

## Outputs

- `api_endpoint`
- `image_bucket`
- `image_analysis_queue_url`
- `database_secret_arn`
- `domain_event_bus_name`
- `operations_table_name`
- `operations_projector_function_name`
- `github_deploy_role_arn`
- `cognito_user_pool_id`
- `cognito_user_pool_client_id`
- `cognito_domain`
- `cognito_issuer`

## Remaining Hardening Gaps

- Move high-concurrency mutation paths from the row-level store bridge to DB-first repository methods.
- Replace the hydrated store bridge/global lock with aggregate-specific DB-first repositories.
- Add production thumbnail/CDN, retention/legal-hold, and key-management policy.
- Prove plan/apply rollback, recovery, load/SLO, and seven-day idle cost with retained artifacts.
- Attach the API Gateway authorizer to explicit protected routes after public/protected route decomposition.
