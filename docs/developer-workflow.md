# Developer Workflow

This repo is optimized for targeted verification first, then full proof before broad changes or a hiring-manager walkthrough.

## Command Ladder

| Command | Use when | What it proves |
| --- | --- | --- |
| `make verify-web` | React, CSS, routing, or UI-only changes | Web TypeScript and web unit tests pass. |
| `make verify-api` | API, RBAC, workflow, state machine, or schema-adjacent changes | Shared schemas build, API TypeScript passes, and API tests pass. |
| `make verify-fast` | Most normal changes before a commit | Full TypeScript check and unit test suite pass. |
| `make verify-grading` | Python grading service or grading contract changes | FastAPI grading tests pass in an isolated temporary venv. |
| `make terraform-validate` | Terraform, Lambda packaging, or AWS integration changes | Terraform initializes without backend state and validates the configuration. |
| `make e2e-local` | Workflow or user-facing behavior changes | Local app starts, browser E2E runs create -> attach -> analyze -> review -> grade -> draft -> finalize. |
| `make verify-full` | Before pushing broad product, API, or infrastructure changes | Lint, typecheck, tests, evaluation, builds, Python grading, Terraform validate, and local E2E pass. |
| `make verify-production-proof` | Before sending the live app to a reviewer | Vision evaluation and deployed read-only smoke test pass. |
| `make live-smoke` | After Cloudflare deploy or public review changes | Live read-only flow loads dashboard, inspections, detail evidence, and Platform Health. |
| `make clean-generated` | The workspace feels slow or generated files have accumulated | Removes local generated caches without deleting `node_modules`. |

## CI Alignment

GitHub Actions mirrors the same verification ladder:

- `InspectIQ CI / node`: fast verification, lint, vision evaluation, app build, and Lambda packaging.
- `InspectIQ CI / grading-python`: Python grading proof through `make verify-grading`.
- `InspectIQ CI / terraform`: Lambda packaging plus `make terraform-validate`.
- `InspectIQ CI / e2e-local`: local browser workflow through `make e2e-local`.
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

Use `make clean-generated` to remove the large generated caches. It keeps `node_modules` in place so local development stays fast.

## Local Vs Live Providers

Local development intentionally uses deterministic providers by default. That keeps CI, interviews, and code review repeatable without AWS credentials, Bedrock latency, or model drift. The production-shaped path uses the same schema contracts with Cognito, API Gateway, Lambda, S3, SQS, Bedrock, Neon Postgres, and CloudWatch.

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
