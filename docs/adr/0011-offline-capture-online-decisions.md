# ADR 0011: Offline Capture, Online Authoritative Decisions

Date: 2026-10-13

Status: Accepted — records existing implementation on the unmerged inspection/recon branch.

## Context

An inspector may lose connectivity while walking a vehicle. Losing photos or requiring a continuously connected camera session would interrupt the primary field task. Report approval, recon authorization, and release have a different risk: stale or unauthenticated decisions can change a vehicle's business record.

## Decision

Keep native photo capture durable without a connection. Cache assignments in SQLite, store photos in the app sandbox, and queue upload operations with stable IDs and checksums. On reconnection, obtain a fresh authorized upload intent, transfer the file, confirm metadata idempotently, and request analysis. Expose queued, failed, blocked, and uploaded states and bound retry.

Keep review, grading, report edits/approval/finalization, and administrative mutations online and server-authoritative. Cognito PKCE and SecureStore handle sessions; a cached role or a locally queued photo does not grant an offline approval path. Public evaluation mode does not upload or invoke paid analysis.

## Alternatives Considered

- **Online-only capture:** simpler, but loses useful field work when connectivity drops.
- **Full offline workflow replication:** would require conflict resolution for approvals, authorization budgets, versions, and terminal release states; that complexity is not justified by capture needs.
- **Replace React Native with Flutter:** not required to solve this boundary; the existing native camera, SQLite, auth, and shared contracts remain useful.

## Consequences

Capture can continue, but users must see that queued evidence is not uploaded or analyzed evidence. Review/release controls fail closed offline. Local quality guidance is advisory and does not replace server validation or a human evidence decision. Physical-device camera behavior and offline recovery still require field testing beyond the public evaluation emulator journey.

## Implementation and Evidence

- [Capture screen](../../apps/mobile/src/screens/CaptureScreen.tsx)
- [SQLite operations](../../apps/mobile/src/offline/database.ts), [sync](../../apps/mobile/src/offline/sync.ts), and [retry policy](../../apps/mobile/src/offline/retryPolicy.ts)
- [Native report controls](../../apps/mobile/src/screens/ReportEditorScreen.tsx)
- [Presigned-upload decision](0006-s3-presigned-image-uploads.md) and [mobile setup](../../apps/mobile/README.md)
- [Android evaluation CI at `2b49dee`](https://github.com/manynames3/inspectiq/actions/runs/38339742078) proves native evaluation navigation and APK builds, not offline camera operation on a physical vehicle.
