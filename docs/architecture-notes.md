# AWS Architecture Diagram Notes

The main architecture visual is generated with Python `diagrams` from `docs/architecture_aws.py`.

## Render

```bash
make diagram
```

Equivalent manual command:

```bash
python3 -m venv .venv-diagrams
.venv-diagrams/bin/python -m pip install -r requirements.txt
.venv-diagrams/bin/python docs/architecture_aws.py
```

Graphviz is also required because `diagrams` renders through the `dot` binary.

macOS:

```bash
brew install graphviz
```

Ubuntu:

```bash
sudo apt-get update
sudo apt-get install graphviz
```

## Source Files Inspected

- `README.md`
- `.env.example`
- Root and workspace `package.json` files
- `.github/workflows/*.yml`
- `infra/terraform/main.tf`
- `infra/terraform/variables.tf`
- `infra/terraform/README.md`
- `apps/api/src/lambda.ts`
- `apps/api/src/imageWorker.ts`
- `apps/api/src/awsStorage.ts`
- `apps/api/src/awsQueue.ts`
- `apps/api/src/visionProvider.ts`
- `apps/api/src/reportProvider.ts`
- `apps/api/src/runtimeConfig.ts`
- `apps/web/src`
- `services/grading-python/Dockerfile`
- `services/grading-python/pom.xml`

## What The Diagram Shows

- Cloudflare Pages hosts the React/Vite frontend.
- Cognito provides hosted OIDC sign-in and role groups.
- API Gateway HTTP API enforces JWT authorization before routing to the Node/Express Lambda API.
- Lambda API uses Secrets Manager to resolve the Neon Postgres connection string.
- Neon Postgres is external to AWS and is labeled as external.
- Private S3 stores vehicle image objects behind presigned upload/download flows.
- SQS carries image-analysis jobs to a Lambda image worker and has a DLQ.
- Bedrock is used by the image worker for multimodal image analysis and by the API for report drafting.
- CloudWatch logs, alarms, and the `inspectiq-ops` dashboard support the operational view.
- GitHub Actions runs CI, E2E, Python tests, Terraform validation, Lambda build, and Cloudflare Pages deployment.
- Terraform provisions the AWS stack, but the repo does not currently include an automated GitHub Action that applies Terraform.
- The Python FastAPI grading service exists as an optional/local service boundary with a Dockerfile and pytest coverage, but it is not shown in the main AWS diagram because Terraform does not deploy it. The deployed Lambda also has an in-process grading fallback.

## Deliberately Not Shown As Deployed

- Aurora/RDS: the repo uses Neon Postgres, not AWS RDS.
- ECS/Fargate: the selected deployment shape is Lambda.
- DynamoDB: useful later for high-write idempotency keys, ephemeral image-job checkpoints, or mobile/offsite sync state; Neon Postgres remains the relational workflow source of truth.
- OpenSearch: useful later for VIN/OCR/damage-note/report search or marketplace-scale discovery; current reviewer queues and dashboard filters fit indexed Postgres/API queries.
- Kinesis: useful later for continuous auction-lane telemetry or high-throughput event ingestion; current inspection actions are transactional workflow events, not a streaming data plane.
- Step Functions: report jobs are async-shaped in the data model, but Step Functions is not provisioned.
- EventBridge: useful for broader domain-event publication, but Terraform currently uses SQS directly for image-analysis work.
- Rekognition/custom CV models: useful as future provider options; Bedrock is the implemented deployed provider.
- Python grading service: implemented locally/optionally, not provisioned in the AWS Terraform stack.

## Request Flow

1. User signs in through Cognito from the Cloudflare Pages workbench.
2. The frontend sends JWT-authenticated REST calls to API Gateway.
3. API Gateway validates the JWT issuer/audience and forwards to the Lambda API.
4. Lambda applies RBAC/object-level authorization, validates schemas, persists workflow state to Neon Postgres, and writes audit events.
5. Image upload uses S3 presigned URLs; the browser uploads image bytes directly to private S3.
6. Image analysis is queued to SQS and processed by the Lambda worker.
7. The worker reads image objects from S3, calls Bedrock, validates model output, stores results, and creates human-review suggestions.

## Deployment Flow

1. GitHub Actions runs lint, typecheck, tests, local E2E, Python tests, vision eval, build, Lambda packaging, and Terraform validation.
2. The Cloudflare Pages workflow builds the web app with live API/Cognito environment variables and deploys through Wrangler.
3. AWS infrastructure is Terraform-managed; current repo workflows validate Terraform but do not automatically apply AWS changes.

## Security

- Cognito OIDC and groups drive role-aware access.
- API Gateway JWT authorizer protects normal API routes.
- The API repeats JWT/JWKS validation and object-level authorization.
- S3 blocks public access and uses server-side encryption.
- Secrets Manager stores the Neon pooled connection string.
- Lambda IAM policy is scoped to the required S3, SQS, Secrets Manager, and Bedrock actions.

## Observability And Cost Controls

- CloudWatch log groups retain API and worker logs for 30 days.
- Alarms cover API errors, worker errors, SQS queue age, DLQ depth, and API p95 latency.
- The `inspectiq-ops` dashboard shows Lambda errors/duration/throttles, API Gateway latency/5xx, and SQS queue health.
- The image-analysis path is explicit user/workflow action driven; Bedrock calls are not made on every page load.
- Local deterministic providers keep development and CI from spending on model calls.
