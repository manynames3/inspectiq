# Runbook

Local checks:

1. `npm install`
2. `npm test`
3. `npm run build`
4. `npm run dev`

Common failures:

- API unavailable: verify port 4000 is free and `npm run dev:api` is running.
- Java grading service unavailable: the API falls back to identical local grading rules for demo continuity.
- Report generation failed: check provider env vars and retry the job endpoint.
- Incomplete inspection: accept photo-angle suggestions for all required photo angles.

