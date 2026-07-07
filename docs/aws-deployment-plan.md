# AWS Deployment

Current deployed architecture in `us-east-1`:

```txt
React on Cloudflare Pages
-> API Gateway HTTP API
-> Node.js Lambda API
-> Neon Postgres
-> S3 image objects
-> SQS image-analysis jobs
-> Lambda image worker
-> Bedrock multimodal model
-> validated suggestion records
-> audit trail
```

Provisioned supporting services:

- Secrets Manager for the Neon pooled database URL.
- Cognito user pool, app client, and hosted domain.
- S3 server-side encryption and blocked public access.
- CloudWatch logs, metrics, alarms, and dashboards.
- Least-privilege IAM for Lambda, S3, SQS, Secrets Manager, CloudWatch, and Bedrock.

Deployment commands:

```bash
npm run build:lambda
terraform -chdir=infra/terraform init
terraform -chdir=infra/terraform plan -out=tfplan
terraform -chdir=infra/terraform apply tfplan
```

Store the Neon connection string in AWS Secrets Manager after the first apply. Do not commit or print the value.

```bash
SECRET_ARN="$(terraform -chdir=infra/terraform output -raw database_secret_arn)"
aws secretsmanager put-secret-value \
  --region us-east-1 \
  --secret-id "$SECRET_ARN" \
  --secret-string "$DATABASE_URL"
```

Current persistence:

- The deployed API runs with `PERSISTENCE_MODE=postgres`.
- Neon schema is applied from `apps/api/src/db/schema.sql`.
- Workflow state is loaded from Postgres and persisted through transactional row-level upserts/deletes behind the existing store facade.
- `pg_advisory_xact_lock` serializes concurrent Lambda store-bridge mutations while preserving normalized Postgres rows.

Production repository hardening:

1. Keep `MemoryStore` behavior as a test fixture and local workflow facade.
2. Move the busiest mutation paths from the store bridge to DB-first repository methods.
3. Add a formal migration runner and release rollback workflow.
4. Wrap reviewer accept/edit/reject, damage confirmation, grading, and finalization in narrow transactions.
5. Store image bytes only in S3; keep Postgres to object keys, checksums, MIME metadata, provider outputs, and audit facts.
6. Add backups, retention, append-only audit conventions, and data export policy before production use.

Image worker requirements:

- idempotency key per photo/provider/prompt version;
- retry policy and DLQ;
- persisted status: queued, running, completed, failed, dead_letter;
- raw provider output stored separately from validated output;
- `VisionOutputSchema` validation before suggestions are created;
- image-quality retake routing before buyer-visible release;
- provider latency, failure, and schema-rejection metrics.

Known open gaps:

- Frontend OIDC is wired through Cognito hosted login. API Gateway JWT enforcement and Lambda-side JWT/JWKS validation are enabled for the deployed path. Cognito groups, role claims, or configured owner/operator email mappings grant Reviewer/Admin access; unmapped missing app role claims fall back to least-privileged Inspector unless `REQUIRE_JWT_ROLE_CLAIM=true` is enabled.
- The Python grading service remains optional; the deployed Lambda uses the equivalent Node fallback unless `GRADING_SERVICE_URL` points to a reachable service.
- Report generation is async-shaped in the data model but not yet moved to SQS or Step Functions.
- The included model evaluation set now gates Bedrock promotion, but production confidence claims still require a larger labeled auction/offsite image corpus and calibration report.
