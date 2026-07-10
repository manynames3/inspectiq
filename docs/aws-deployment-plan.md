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
-> Postgres audit + domain outbox
-> EventBridge custom bus
-> Python operations-projector Lambda
-> DynamoDB operational projection
```

Provisioned supporting services:

- Secrets Manager for the Neon pooled database URL.
- Cognito user pool, app client, and hosted domain.
- S3 server-side encryption and blocked public access.
- CloudWatch logs, metrics, alarms, and dashboards.
- EventBridge domain-event delivery with a separate SQS DLQ.
- On-demand DynamoDB for duplicate suppression, TTL timelines, latest state, and model-usage reservations.
- X-Ray tracing, SNS operator notifications, and a $50 AWS Budget.
- Least-privilege IAM for Lambda, S3, SQS, Secrets Manager, CloudWatch, and Bedrock.

Deployment commands:

```bash
npm run build:lambda
npm run build:projector
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
- Neon schema and numbered files in `apps/api/src/db/migrations` are applied with `schema_migrations` tracking.
- Workflow state is loaded from Postgres and persisted through transactional row-level upserts/deletes behind the existing store facade.
- Conditional versions reject stale inspection/suggestion/report writes with `409 VERSION_CONFLICT`; a global advisory transaction lock protects the remaining store bridge.
- Business facts, audit rows, and domain outbox rows commit together. Publication happens after commit and failed rows remain replayable.

Production repository hardening:

1. Keep `MemoryStore` behavior as a test fixture and local workflow facade.
2. Move the busiest mutation paths from the store bridge to DB-first repository methods.
3. Replace the global store-bridge lock with aggregate-specific transactions and query-focused repositories.
4. Preserve the current optimistic versions and outbox invariant in every direct repository command.
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

- Frontend/mobile OIDC is wired through Cognito. Protected calls are enforced by Lambda-side JWT/JWKS validation and object authorization; the catch-all API Gateway route is not authorizer-protected while public health/evaluation endpoints share that integration.
- The Python grading service remains optional; the deployed Lambda uses the equivalent Node fallback unless `GRADING_SERVICE_URL` points to a reachable service.
- Report generation is async-shaped in the data model but not yet moved to SQS or Step Functions.
- The 108-image evaluation run has only 12 independent sources; production confidence claims require a larger adjudicated field corpus and a passing no-fallback Bedrock artifact.
- A seven-day idle-cost measurement and sustained load/SLO run remain evidence-gathering tasks, not architecture claims.
