#!/usr/bin/env bash
set -uo pipefail

diagnostic_dir="output/maestro"
apk_path="apps/mobile/android/app/build/outputs/apk/release/app-release.apk"

mkdir -p "$diagnostic_dir"
adb logcat -c
adb install -r "$apk_path"

set +e
"$HOME/.maestro/bin/maestro" test .maestro/evaluation-workspace.yaml
status=$?
set -e

adb logcat -d -v threadtime > "$diagnostic_dir/android-logcat.txt" || true
adb shell dumpsys activity exit-info com.aidenrhaa.inspectiq > "$diagnostic_dir/exit-info.txt" || true

exit "$status"
