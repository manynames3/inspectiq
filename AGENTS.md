# InspectIQ Agent Notes

## First Read
- Read `README.md` for the product and architecture overview.
- Read only the task-relevant files after that. Prefer targeted `rg`, `sed`, and `git diff` over broad scans.
- For production/deployment context, read `docs/implementation-boundary.md`, `docs/architecture.md`, `docs/runbook.md`, or the specific ADR only when the task touches that area.

## Avoid By Default
- Do not inspect generated or dependency folders unless the task explicitly requires it:
  - `node_modules/`
  - `dist/`
  - `coverage/`
  - `infra/terraform/.terraform/`
  - `.venv-diagrams/`
  - `.wrangler/`
  - `output/`
  - `apps/web/node_modules/`
  - `apps/api/node_modules/`
- Do not open screenshot/video proof artifacts unless the task is visual:
  - `docs/images/`
  - `docs/design/`

## Editing Guidance
- Keep edits scoped to the requested behavior or documentation.
- Do not rewrite architecture docs, README sections, or generated diagrams unless the task specifically asks for them.
- Preserve the distinction between deterministic local providers and the production-shaped AWS/Bedrock/S3/SQS path.
- Do not add production dependencies without confirming they are necessary.

## Verification Ladder
- Web-only changes: `make verify-web`
- API/domain changes: `make verify-api`
- Shared schema changes: `npm run build -w @inspectiq/shared && npm run typecheck`
- Documentation-only changes: inspect the rendered Markdown locally when practical; no full suite required.
- Before pushing broad changes: `make verify-full`
- Before hiring-manager/live review: `make verify-production-proof`
- After Cloudflare deploy changes: `make live-smoke`

## Deployment Notes
- Live frontend: `https://inspectiq.pages.dev`
- AWS API base is supplied at build time through `VITE_API_BASE_URL`.
- The public evaluation path is read-only; workflow-changing actions require authenticated roles.
