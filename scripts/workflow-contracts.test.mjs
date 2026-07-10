import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("Expo Android jobs do not initialize Gradle caching before prebuild", async () => {
  const workflow = await readFile(
    new URL("../.github/workflows/mobile-android-e2e.yml", import.meta.url),
    "utf8",
  );
  const setupJavaSteps = workflow.match(
    /^      - uses: actions\/setup-java@v4\n(?:^(?!      - ).*\n?)*/gm,
  );

  assert.ok(setupJavaSteps?.length, "expected at least one setup-java step");
  for (const step of setupJavaSteps) {
    assert.doesNotMatch(
      step,
      /^          cache: gradle$/m,
      "Expo generates android/ during the build, so no Gradle files exist when setup-java runs",
    );
  }
});

test("the standalone mobile verification builds shared contracts first", async () => {
  const packageJson = JSON.parse(
    await readFile(new URL("../package.json", import.meta.url), "utf8"),
  );

  assert.match(
    packageJson.scripts["test:mobile"],
    /^npm run build -w @inspectiq\/shared && /,
    "a clean CI runner has no compiled @inspectiq/shared output before mobile typecheck",
  );
});

test("the Android release build compiles shared contracts before Expo prebuild", async () => {
  const buildScript = await readFile(
    new URL("../apps/mobile/scripts/build-android-apk.sh", import.meta.url),
    "utf8",
  );
  const sharedBuildIndex = buildScript.indexOf("npm run build -w @inspectiq/shared");
  const expoPrebuildIndex = buildScript.indexOf("npx expo prebuild");

  assert.ok(sharedBuildIndex >= 0, "Android release builds require @inspectiq/shared/dist");
  assert.ok(sharedBuildIndex < expoPrebuildIndex, "shared output must exist before Expo invokes Metro");
});

test("the Android emulator enables KVM before Maestro starts", async () => {
  const workflow = await readFile(
    new URL("../.github/workflows/mobile-android-e2e.yml", import.meta.url),
    "utf8",
  );
  const kvmPermissionIndex = workflow.indexOf("sudo chmod 0666 /dev/kvm");
  const emulatorRunnerIndex = workflow.indexOf("uses: reactivecircus/android-emulator-runner@v2");

  assert.ok(kvmPermissionIndex >= 0, "GitHub's runner user needs access to /dev/kvm");
  assert.ok(kvmPermissionIndex < emulatorRunnerIndex, "KVM access must be configured before emulator startup");
});

test("the Android E2E artifact preserves native crash diagnostics", async () => {
  const [workflow, runner] = await Promise.all([
    readFile(new URL("../.github/workflows/mobile-android-e2e.yml", import.meta.url), "utf8"),
    readFile(new URL("./run-maestro-android.sh", import.meta.url), "utf8"),
  ]);

  assert.match(workflow, /script: bash scripts\/run-maestro-android\.sh/);
  assert.match(workflow, /output\/maestro\/\*\*/);
  assert.match(runner, /adb logcat -d -v threadtime > "\$diagnostic_dir\/android-logcat\.txt"/);
  assert.match(runner, /adb shell dumpsys activity exit-info com\.aidenrhaa\.inspectiq > "\$diagnostic_dir\/exit-info\.txt"/);
  assert.match(runner, /status=\$\?/);
  assert.match(runner, /exit "\$status"/);
});

test("the Maestro flow dismisses the API 35 Quickstep ANR before app assertions", async () => {
  const flow = await readFile(
    new URL("../.maestro/evaluation-workspace.yaml", import.meta.url),
    "utf8",
  );
  const launchIndex = flow.indexOf("- launchApp:");
  const quickstepWaitIndex = flow.indexOf('text: "Wait"');
  const firstProductAssertionIndex = flow.indexOf('- assertVisible: "InspectIQ"');

  assert.ok(launchIndex >= 0, "the evaluation flow must launch InspectIQ");
  assert.ok(quickstepWaitIndex > launchIndex, "the system-dialog guard belongs after app launch");
  assert.ok(
    quickstepWaitIndex < firstProductAssertionIndex,
    "the Quickstep overlay must be dismissed before checking product UI",
  );
  assert.match(
    flow.slice(quickstepWaitIndex, firstProductAssertionIndex),
    /optional: true/,
    "real devices without the emulator-only dialog must continue immediately",
  );
  assert.ok(
    (flow.match(/text: "Wait"/g) ?? []).length >= 2,
    "Quickstep can report its delayed ANR after the evaluation workspace opens",
  );
  assert.match(flow, /text: "\^Review\$"/, "tab navigation must not match the Review queue heading");
});

test("visual regression freezes browser time before capturing SLA-sensitive views", async () => {
  const screenshotHarness = await readFile(
    new URL("../apps/web/scripts/screenshot-regression.mjs", import.meta.url),
    "utf8",
  );
  const fixedTimeIndex = screenshotHarness.indexOf("page.clock.setFixedTime");
  const firstCaptureIndex = screenshotHarness.indexOf('capture(page, "dashboard"');

  assert.ok(fixedTimeIndex >= 0, "SLA labels and session expiry must not depend on CI wall-clock time");
  assert.ok(fixedTimeIndex < firstCaptureIndex, "browser time must be frozen before any screenshot is captured");
});
