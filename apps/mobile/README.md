# InspectIQ Mobile

Expo/React Native client for native vehicle evidence capture and role-aware review. It shares API/domain contracts with the web workbench but uses mobile-native navigation and capture surfaces.

## Roles

- Inspector: assigned queue, new inspection, required-angle camera overlays, local quality guidance, offline capture, upload/sync, analysis, damage, audit, and status.
- Reviewer: assignments, suggestion evidence, accept/reject/edit, damage, grading, report draft/version approval/finalization, and audit. Mutations require connectivity.
- Admin: full queues, Platform Health, failed image-job recovery, and domain-event replay. Mutations require connectivity.
- Evaluation Workspace: read-only public review without Cognito credentials; it cannot upload, mutate, or invoke Bedrock.

## Authentication

Cognito uses Authorization Code + PKCE through `expo-auth-session`. Tokens are held in `expo-secure-store`, refreshed from the Cognito token endpoint, and mapped from role/group claims. Authenticated sessions cannot switch roles.

Required public configuration:

```bash
EXPO_PUBLIC_API_BASE_URL=https://imml0cczh7.execute-api.us-east-1.amazonaws.com
EXPO_PUBLIC_COGNITO_DOMAIN=<domain>.auth.us-east-1.amazoncognito.com
EXPO_PUBLIC_COGNITO_CLIENT_ID=<public-client-id>
EXPO_PUBLIC_ENABLE_EVALUATION_MODE=true
```

Use a development build or release APK for Cognito redirects; Expo Go is not the supported OAuth surface for this custom scheme.

## Offline Capture

Inspector assignments and upload operations are cached in SQLite. Captured files stay in the application sandbox, receive a stable operation ID and SHA-256 checksum, and survive process restart. Reconnection obtains a presigned URL, uploads to S3, confirms metadata idempotently, then queues analysis. Bounded exponential retry remains visible until success or explicit removal. Reviewer/Admin mutations are online-only.

Before upload, capture applies a required-angle overlay, minimum-resolution check, local brightness/sharpness guidance, normalization/compression, and EXIF removal. A local warning guides the operator but does not claim model-grade image quality.

## Published History and Reinspection

Finalized records stay read-only, including the capture screen. An online, authenticated Inspector, Reviewer, or Admin can start a separate audited reinspection when the API advertises the capability. A reason and exact source-report version link the fresh draft to the original; evidence, findings, grades, approvals, and recon spending authority are not copied.

Lost creation responses retry the same operation ID. If creation succeeds but assignment refresh disconnects, refresh the existing child instead of creating another. Historical releases and older caches with unknown current-QC status show explicit limitations. Evaluation access cannot create replacements. See [ADR 0014](../../docs/adr/0014-audited-reinspection-with-immutable-history.md) and [release status](../../docs/release-status.md) for the implementation/deployment boundary.

## Verify

```bash
npm run typecheck -w @inspectiq/mobile
npm run test -w @inspectiq/mobile
npx expo-doctor@latest
```

## Android APK

Install Java 17 and the Android command-line SDK/NDK, then build one architecture at a time:

```bash
cd apps/mobile
export JAVA_HOME=/path/to/jdk-17
ANDROID_ABI=arm64-v8a npm run build:android:apk
```

The output is `apps/mobile/android/app/build/outputs/apk/release/app-release.apk`. The script bounds Gradle to one worker and a 1 GB metaspace cap. CI separately builds x86_64 for the Maestro emulator and arm64 for internal distribution; generated `android/` and `ios/` projects are ignored.

The dedicated `Mobile Android E2E` workflow installs the x86_64 release APK and runs `.maestro/evaluation-workspace.yaml`. See the official [Expo authentication](https://docs.expo.dev/versions/v57.0.0/sdk/auth-session/), [SQLite](https://docs.expo.dev/versions/v57.0.0/sdk/sqlite/), [Camera](https://docs.expo.dev/versions/v57.0.0/sdk/camera/), and [APK build](https://docs.expo.dev/build-reference/apk/) references.
