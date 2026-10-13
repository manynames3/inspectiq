# Security

Local review:

- Role-aware UI controls and API RBAC for inspector, reviewer, and admin actions.
- Inspector: inspection intake, photo evidence capture, and image analysis.
- Reviewer: AI suggestion review, damage confirmation, grading, report drafting/version approval, and finalization.
- Admin: full workflow access, including record correction and destructive exceptions.
- No hardcoded secrets.
- Synthetic vehicle records, sourced reference imagery for local reference records, and generated identity evidence only.

Implemented deployed controls:

- Cognito OIDC Authorization Code + PKCE for web/mobile, Cognito groups, and JWT role claims.
- JWT validation in service middleware, with API Gateway forwarding requests to Lambda. Read-only evaluation preview is explicitly separated from authenticated mutation paths.
- RBAC for inspector, reviewer, and admin actions.
- S3 presigned uploads with object-level authorization, scoped object keys, byte-size validation, MIME validation for JPEG/PNG/WebP, and SHA-256 checksum metadata.
- S3 encryption and managed Postgres transport/storage controls.
- Secrets Manager for database and provider credentials.
- Least-privilege IAM for API Lambda, image worker Lambda, S3, SQS, Secrets Manager, Bedrock, and CloudWatch.
- Separate Python projector IAM for conditional DynamoDB writes; EventBridge target and DLQ permissions are resource-scoped.
- SecureStore for mobile tokens, SQLite/sandbox separation for offline operations/photos, and sign-out cleanup.
- Stable mobile operation IDs, checksums, and idempotent upload confirmation.
- CloudTrail for infrastructure audit.

Production hardening still required before real vehicle/customer data:

- Decompose public and protected API Gateway routes and attach the existing JWT authorizer to protected routes; current service middleware is the protected-route enforcement point.
- Audit sensitive read access for photos, reports, and audit-event views.
- Add tenant/account boundaries if multiple sellers, consignors, or clients share the same deployment.
- Add enterprise MFA/session/revocation policy and prove group provisioning/rotation drills.
- Run backup/restore and credential-rotation drills.

## Dependency remediation — October 3, 2026

The preliminary Strix scan stopped at its turn limit. Its five findings were
lockfile-based dependency advisories, not demonstrated application exploits.
Authentication and workflow testing remain incomplete; this remediation is not
a penetration-test clearance.

Remediated dependency paths:

- Express 4.22.3 resolves patched `qs`; `body-parser` is updated to 1.20.8.
- Metro 0.84.5 removes the old `image-size` dependency rather than forcing an
  incompatible image-size major version into Metro.
- Sharp, React Router, Vitest, Nano ID, PostCSS, and shell-quote use patched versions.
- `npm run test:security-dependencies` checks every locked nested copy of these
  packages and runs as part of `npm test`.

The body-parser advisory requires an invalid parser limit. InspectIQ uses the
constant `4mb`, so the original dependency match did not demonstrate that exploit
condition. The dependency was patched regardless.

### Remaining audit advisories

Do not use `npm audit fix --force` to silence these: npm proposes downgrading
Expo/React Native, which would break the supported mobile stack.

| Package | Current dependency path | Remaining constraint |
| --- | --- | --- |
| `braces` | Metro/Jest glob tooling through micromatch | No patched release published at review time. Do not process untrusted glob patterns in build tooling. |
| `node-forge` | Expo CLI/code-signing tooling | No patched release published at review time. Do not treat this tooling dependency as a demonstrated production API signature bypass; production JWT verification uses Node crypto. |
| `decode-uri-component` | React Navigation's query-string dependency | The patched 0.5 release is ESM-only; the current query-string consumer uses a CommonJS function import. Requires a compatible parent update or separately validated migration. |
| `uuid` | Xcode project generation tooling | The patched release crosses several majors. The consumer uses UUID v4 without a caller-supplied output buffer; the advisory concerns buffered v3/v5/v6. Requires a separately validated parent/tooling update. |

Audit totals count affected dependency nodes, including inherited findings;
they are not a count of independently exploitable application vulnerabilities.
These residual advisories are recorded, not accepted as permanently safe.
