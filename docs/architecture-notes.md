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
- `apps/api/src/awsEvents.ts`
- `apps/api/src/operationsStore.ts`
- `apps/api/src/postgresPersistence.ts`
- `apps/api/src/visionProvider.ts`
- `apps/api/src/reportProvider.ts`
- `apps/api/src/runtimeConfig.ts`
- `apps/web/src`
- `apps/mobile/src`
- `services/operations-projector/handler.py`
- `services/grading-python/Dockerfile`

## What The Diagram Shows

- Cloudflare Pages hosts the React/Vite frontend; Expo/React Native provides the mobile capture/review client.
- Cognito provides hosted OIDC sign-in and role groups.
- API Gateway provides the HTTP integration; the Node/Express Lambda validates Cognito JWT/JWKS claims and applies RBAC/object authorization on protected routes.
- Lambda API uses Secrets Manager to resolve the Neon Postgres connection string.
- Neon Postgres is external to AWS and is labeled as external.
- Private S3 stores vehicle image objects behind presigned upload/download flows.
- SQS carries image-analysis jobs to a Lambda image worker and has a DLQ.
- Bedrock is used by the image worker for multimodal image analysis and by the API for report drafting.
- Postgres outbox events publish to a custom EventBridge bus; a Python 3.12 Lambda writes idempotency, latest state, a TTL timeline, and monthly model usage to on-demand DynamoDB.
- The same API/Postgres/outbox boundaries carry the inspection-to-recon workflow: consignor policy evaluation, explicit authorization, authorized work orders, QC, and sale-readiness projection. No new always-on service is needed for that business expansion.
- EventBridge and image-analysis failures have separate SQS DLQs with health/replay controls.
- CloudWatch/X-Ray, alarms, SNS, the `inspectiq-ops` dashboard, and a $50 AWS Budget support operations and cost control.
- GitHub Actions runs web/mobile/backend checks, Postgres integration, Maestro, Python tests, Terraform planning, approved apply, and Cloudflare deployment.
- The Python FastAPI grading service exists as an optional/local service boundary with a Dockerfile and pytest coverage, but it is not shown in the main AWS diagram because Terraform does not deploy it. The deployed Lambda also has an in-process grading fallback.

## Deliberately Not Shown As Deployed

- Aurora/RDS: the repo uses Neon Postgres, not AWS RDS.
- ECS/Fargate: the selected deployment shape is Lambda.
- OpenSearch: useful later for VIN/OCR/damage-note/report search or marketplace-scale discovery; current reviewer queues and dashboard filters fit indexed Postgres/API queries.
- Kinesis: useful later for continuous auction-lane telemetry or high-throughput event ingestion; current inspection actions are transactional workflow events, not a streaming data plane.
- Step Functions: report jobs are async-shaped in the data model, but Step Functions is not provisioned.
- Rekognition/custom CV models: useful as future provider options; Bedrock is the implemented deployed provider.
- Python grading service: implemented locally/optionally, not provisioned in the AWS Terraform stack.

## Request Flow

1. User signs in through Cognito OIDC/PKCE from web or mobile.
2. The client sends JWT-authenticated REST calls through API Gateway.
3. Lambda validates issuer/audience/signature, role claims, RBAC, object authorization, and request schemas.
4. Business state, audit records, and domain outbox rows commit together in Neon Postgres.
5. Image upload uses S3 presigned URLs; the browser uploads image bytes directly to private S3.
6. Image analysis is queued to SQS and processed by the Lambda worker.
7. The worker reads image objects from S3, calls Bedrock, validates model output, stores results, and creates human-review suggestions.
8. API and worker outbox events publish to EventBridge; the Python projector conditionally writes DynamoDB state so duplicate delivery is harmless.

## Deployment Flow

1. GitHub Actions runs lint, typecheck, tests, local E2E, Python tests, vision eval, build, Lambda packaging, and Terraform validation.
2. The Cloudflare Pages workflow builds the web app with live API/Cognito environment variables and deploys through Wrangler.
3. The manual AWS workflow uploads a Terraform plan and applies it only when the operator selects `apply`; post-apply health/evaluation smoke tests run before completion.
4. Android CI builds an x86_64 APK for Maestro and a separate arm64 internal-distribution artifact.

## Security

- Cognito OIDC groups drive role-aware access for Inspector, Reviewer, Recon Coordinator, Consignor Approver, Technician, and Admin responsibilities.
- The Lambda API validates JWT/JWKS claims and object-level authorization on protected routes. The current catch-all API Gateway route is intentionally `NONE` so health/evaluation and protected paths share one integration; the provisioned authorizer is reserved for future route decomposition.
- Consignor Approvers are restricted to represented consignor accounts, and policy authorization remains distinguishable from a human decision.
- S3 blocks public access and uses server-side encryption.
- Secrets Manager stores the Neon pooled connection string.
- Lambda IAM policy is scoped to the required S3, SQS, Secrets Manager, and Bedrock actions.

## Observability And Cost Controls

- CloudWatch log groups retain API, worker, and projector logs for 30 days; X-Ray tracing is sampled on all Lambdas.
- Alarms cover API/worker/projector errors, p95 latency, SQS age, both DLQs, pending outbox age, Bedrock throttling, and cost-guard rejection.
- DynamoDB conditionally reserves Bedrock operations, with defaults of 250 image analyses and 50 report drafts per month.
- AWS Budget notifications fire at $25 forecast, $40 actual, and the $50 actual ceiling; SNS email is optional Terraform input.
- The image-analysis path is explicit user/workflow action driven; Bedrock calls are not made on every page load.
- Local deterministic providers keep development and CI from spending on model calls.
