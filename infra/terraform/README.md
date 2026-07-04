# InspectIQ AWS Infrastructure

Terraform deploys the live AWS backend for InspectIQ in `us-east-1`.

## Deployed Shape

- API Gateway HTTP API.
- Node.js Lambda API packaged from `apps/api/src/lambda.ts`.
- Lambda image-analysis worker packaged from `apps/api/src/imageWorker.ts`.
- Private S3 bucket for vehicle photos with blocked public access, CORS, and server-side encryption.
- SQS image-analysis queue plus DLQ.
- Secrets Manager secret for the Neon pooled Postgres URL.
- Cognito user pool, app client, and hosted domain.
- CloudWatch log groups, alarms, and dashboard.
- Bedrock IAM permissions for the configured multimodal inference profile.

The public portfolio walkthrough currently leaves API Gateway JWT enforcement disabled via `enable_cognito_authorizer = false` so the Cloudflare Pages frontend can be opened without a sign-in step. Turn it on after wiring frontend OIDC.

## Commands

```bash
npm run build:lambda
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
- `cognito_user_pool_id`
- `cognito_user_pool_client_id`
- `cognito_domain`

## Known Hardening Gaps

- Replace the whole-snapshot Postgres adapter with per-operation repository writes before concurrent production use.
- Enable Cognito/OIDC in the frontend and set `enable_cognito_authorizer = true`.
- Add alarm notification targets.
- Add remote Terraform state, environment promotion, and rollback workflow.
- Add image normalization, EXIF stripping, thumbnail generation, and object lifecycle policy.
