# Android Field Validation

This checklist validates the mobile workflow that cannot be proved by component tests or the public Evaluation Workspace E2E run. Run it on a release APK installed on a physical Android device with an Inspector Cognito account and a test inspection assigned to that account.

## Build

1. Set `EXPO_PUBLIC_API_BASE_URL`, `EXPO_PUBLIC_COGNITO_DOMAIN`, `EXPO_PUBLIC_COGNITO_CLIENT_ID`, and `EXPO_PUBLIC_ENABLE_EVALUATION_MODE=true` in the build environment.
2. Confirm Cognito accepts `inspectiq://auth/callback` and `inspectiq://auth/logout` for the configured public client.
3. Select Java 17, then build an arm64 APK with `cd apps/mobile && JAVA_HOME=/path/to/jdk-17 ANDROID_ABI=arm64-v8a npm run build:android:apk`.
4. Install `apps/mobile/android/app/build/outputs/apk/release/app-release.apk` with `adb install -r`.

## Inspector workflow

1. Sign in through Cognito; confirm the app returns to InspectIQ with the Inspector queue visible.
2. Open an assigned inspection and capture each required angle. Deny camera permission once, then grant it, to confirm the recovery path.
3. Capture one deliberately dark, blurry, or low-resolution image. Confirm that retake guidance is shown and that "Keep for QA review" makes the choice explicit.
4. Disable connectivity, capture an acceptable image, force-close the app, and reopen it. Confirm the capture and upload operation remain visible.
5. Re-enable connectivity. Confirm one upload operation progresses to completion and produces one photo in the inspection; repeat the reconnect once to verify no duplicate photo is created.
6. Confirm the reviewer can see the uploaded evidence, accept or reject its suggestion, and that the inspection audit shows the resulting actions.
7. Tap an evidence thumbnail to open the full-screen viewer. Confirm the close control stays below the status bar, the counter and angle update, left/right arrows change photos, and horizontal swipes move backward and forward through the set.

## Failure and security checks

1. Interrupt connectivity during upload intent, S3 upload, and metadata confirmation. Confirm retries are bounded and the queue explains failures or blocked states.
2. Sign out with a queued local capture. Confirm local cached data and capture files are removed.
3. Verify the installed Android manifest requests camera access only; the app does not record audio and must not request microphone access.
4. Confirm an unauthenticated or Evaluation Workspace session cannot create inspections, upload evidence, or make reviewer/admin decisions.

## Evidence to retain

Record the APK version/commit, device model and Android version, test-inspection ID, CloudWatch request IDs, S3 object key, SQS/Lambda outcome, and a short screen recording. Do not retain vehicle photos, credentials, tokens, or customer VINs in a public demo artifact.
