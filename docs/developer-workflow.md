# Developer Workflow

This repo is optimized for targeted verification first, then full proof before broad changes or a hiring-manager walkthrough.

## Command Ladder

| Command | Use when | What it proves |
| --- | --- | --- |
| `make verify-web` | React, CSS, routing, or UI-only changes | Web TypeScript and web unit tests pass. |
| `make verify-api` | API, RBAC, workflow, state machine, or schema-adjacent changes | Shared schemas build, API TypeScript passes, and API tests pass. |
| `make verify-fast` | Most normal changes before a commit | Full TypeScript check and unit test suite pass. |
| `make verify-mobile` | Expo auth, capture, offline sync, or native UI changes | Mobile TypeScript and Jest suites pass. |
| `make verify-grading` | Python grading service or grading contract changes | FastAPI grading tests pass in an isolated temporary venv. |
| `make verify-projector` | EventBridge schema or operations projection changes | Python projector validation and duplicate-delivery tests pass. |
| `make terraform-validate` | Terraform, Lambda packaging, or AWS integration changes | Terraform initializes without backend state and validates the configuration. |
| `make e2e-local` | Workflow or user-facing behavior changes | Browser E2E runs create -> attach -> analyze -> review -> grade -> draft -> approve -> finalize. |
| `make screenshots-local` | Dense/responsive UI changes | Axe, overflow, accessible-name, and baseline drift checks pass across desktop/tablet/mobile. |
| `make verify-full` | Before pushing broad product, API, or infrastructure changes | Lint, typecheck, tests, evaluation, builds, both Python services, Terraform, browser E2E, and visual regression pass. |
| `make verify-production-proof` | Before sending the live app to a reviewer | Vision evaluation and deployed read-only smoke test pass. |
| `make live-smoke` | After Cloudflare deploy or public review changes | Live read-only flow loads dashboard, inspections, detail evidence, and Platform Health. |
| `make clean-generated` | The workspace feels slow or generated files have accumulated | Removes local generated caches without deleting `node_modules`. |

## CI Alignment

GitHub Actions mirrors the same verification ladder:

- `InspectIQ CI / node`: fast verification, lint, vision evaluation, app build, and Lambda packaging.
- `InspectIQ CI / grading-python`: Python grading proof through `make verify-grading`.
- `InspectIQ CI / operations-projector`: Python EventBridge/DynamoDB projection proof.
- `InspectIQ CI / postgres-integration`: real Postgres migrations, transactions, and stale-write rollback.
- `InspectIQ CI / terraform`: Lambda packaging plus `make terraform-validate`.
- `InspectIQ CI / e2e-local`: local browser workflow through `make e2e-local`.
- `InspectIQ CI / visual-regression`: Axe, viewport, and screenshot-baseline proof.
- `Mobile Android E2E`: x86_64 release APK + Maestro and a separate installable arm64 artifact.
- `Plan or Deploy AWS`: OIDC credentials, Terraform plan, explicit apply input, and live API smoke.
- `Live Smoke Test`: deployed public read-only proof through `make live-smoke`.
- `Deploy Cloudflare Pages`: validates and deploys the frontend with the AWS API URL baked in.

## Generated Folders

Avoid reading or committing generated artifacts unless the task is specifically about those assets:

- `node_modules/`
- `dist/`
- `coverage/`
- `infra/terraform/.terraform/`
- `.venv-diagrams/`
- `.wrangler/`
- `output/`
- `apps/web/.vite/`
- `apps/mobile/android/`
- `apps/mobile/ios/`

Use `make clean-generated` to remove the large generated caches. It keeps `node_modules` in place so local development stays fast.

## Local Vs Live Providers

Local development intentionally uses deterministic providers by default. That keeps CI and review repeatable without AWS credentials, Bedrock latency, or model drift. The production-shaped path uses the same contracts with Cognito, Lambda, S3, SQS, Bedrock, Neon, EventBridge, the Python projector, DynamoDB, and CloudWatch/X-Ray.

When proving the live path, use:

```bash
make verify-production-proof
```

When proving uploaded-photo Cognito/S3/SQS/Bedrock/Neon behavior with separate roles, use:

```bash
npm run prepare:live-photos -- --out /tmp/inspectiq-live-photos-ford

LIVE_API_BASE_URL=https://imml0cczh7.execute-api.us-east-1.amazonaws.com \
LIVE_ID_TOKEN="$(cat /tmp/inspectiq-live-auth/inspector.idtoken)" \
LIVE_REVIEWER_TOKEN="$(cat /tmp/inspectiq-live-auth/reviewer.idtoken)" \
LIVE_REQUIRE_SEPARATE_ROLES=true \
LIVE_PHOTO_DIR=/tmp/inspectiq-live-photos-ford \
npm run test:live-upload
```
