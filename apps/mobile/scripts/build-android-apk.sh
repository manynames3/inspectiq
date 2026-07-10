#!/usr/bin/env bash
set -euo pipefail

ANDROID_ABI="${ANDROID_ABI:-arm64-v8a}"
case "$ANDROID_ABI" in
  arm64-v8a|x86_64) ;;
  *)
    printf 'Unsupported ANDROID_ABI: %s (expected arm64-v8a or x86_64)\n' "$ANDROID_ABI" >&2
    exit 2
    ;;
esac

export NODE_ENV="${NODE_ENV:-production}"

npm run build -w @inspectiq/shared
npx expo prebuild --platform android --clean

(
  cd android
  ./gradlew :app:assembleRelease \
    --no-daemon \
    --max-workers=1 \
    -Dorg.gradle.parallel=false \
    -Dorg.gradle.jvmargs='-Xmx3072m -XX:MaxMetaspaceSize=1024m' \
    "-PreactNativeArchitectures=${ANDROID_ABI}"
)

printf 'APK: %s\n' "$(pwd)/android/app/build/outputs/apk/release/app-release.apk"
