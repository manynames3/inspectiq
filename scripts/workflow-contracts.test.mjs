import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("Bedrock promotion rejects successful cost-only runs and writes evidence outside the npm workspace", async () => {
  const workflow = await readFile(new URL("../.github/workflows/bedrock-model-evaluation.yml", import.meta.url), "utf8");
  assert.match(workflow, /VISION_EVAL_OUTPUT: \$\{\{ github\.workspace \}\}\/output\/model-evaluation\/bedrock-report\.json/);
  assert.match(workflow, /report\.ok !== true/);
  assert.match(workflow, /report\.mode !== "manual-model-promotion"/);
  assert.match(workflow, /report\.provider !== "bedrockVisionProvider"/);
  assert.match(workflow, /report\.corpus\?\.imageCount !== expectedCases/);
  assert.match(workflow, /report\.cases\?\.length !== expectedCases/);
  assert.match(workflow, /item\.fallbackUsed !== false \|\| item\.schemaValid !== true/);
});

test("AWS code promotion validates the exact saved plan before applying it", async () => {
  const workflow = await readFile(new URL("../.github/workflows/deploy-aws.yml", import.meta.url), "utf8");
  const guard = workflow.indexOf("terraform -chdir=infra/terraform show -json tfplan | node scripts/check-aws-code-plan.mjs");
  const apply = workflow.indexOf("terraform -chdir=infra/terraform apply -input=false -auto-approve tfplan");
  assert.ok(guard >= 0 && apply > guard, "fresh apply plans must reject unrelated infrastructure or configuration changes");
});

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

test("Maestro recovery closes only the exact Quickstep ANR within a bounded guard", async () => {
  const flow = await readFile(
    new URL("../.maestro/evaluation-workspace.yaml", import.meta.url),
    "utf8",
  );
  assert.doesNotMatch(flow, /text: "Wait"|optional: true/, "a generic ANR dismissal could hide an InspectIQ failure");
  const recovery = await readFile(new URL("../.maestro/subflows/close-quickstep-anr.yaml", import.meta.url), "utf8");
  assert.match(
    recovery,
    /when:\n      platform: Android\n      visible: "\^Quickstep isn't responding\$"/,
    "only the captured Android launcher dialog may trigger recovery",
  );
  assert.match(
    recovery,
    /- repeat:\n          times: 3\n          while:\n            visible: "\^Quickstep isn't responding\$"/,
    "recurring launcher dialogs must not cause an unbounded retry loop",
  );
  assert.deepEqual([...recovery.matchAll(/text: "([^"]+)"/g)].map((match) => match[1]), ["^Close app$"]);
  assert.match(recovery, /- assertNotVisible: "\^Quickstep isn't responding\$"/, "a persistently unhealthy emulator must still fail");
  assert.doesNotMatch(recovery, /optional: true|text: "Wait"|launchApp:|stopApp:|pressKey:/, "recovery must not restart or dismiss failures in InspectIQ");
});

test("Maestro guards transition boundaries without relaxing any product assertion", async () => {
  const flow = await readFile(new URL("../.maestro/evaluation-workspace.yaml", import.meta.url), "utf8");
  const recovery = "- runFlow: subflows/close-quickstep-anr.yaml";
  const transitions = [
    ['- launchApp:\n    clearState: true', "InspectIQ"],
    ['- tapOn: "Open Evaluation Workspace"', "Review queue"],
    ['- tapOn:\n    text: "^Review$"', "Review queue"],
    ['- tapOn:\n    text: "^Damage$"', "Confirmed damage"],
    ['- tapOn:\n    text: "^Reports$"', "Condition reports"],
    ['- tapOn:\n    text: "^Sign out$"', "Open Evaluation Workspace"],
  ];
  for (const [transition, assertion] of transitions) {
    assert.ok(flow.includes(`${transition}\n${recovery}\n- assertVisible: "${assertion}"`), `preserve the guarded ${assertion} transition`);
  }
  assert.deepEqual([...flow.matchAll(/^- assertVisible: "([^"]+)"/gm)].map((match) => match[1]), [
    "InspectIQ", "Open Evaluation Workspace", "Review queue", "Evaluation", "InspectIQ", "Review queue", "Confirmed damage", "Condition reports", "Open Evaluation Workspace",
  ]);
  assert.doesNotMatch(flow, /optional: true|continueOnFailure|retry:/, "product assertions and navigation must remain mandatory");
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

test("manual Cloudflare deployment can deliberately target production", async () => {
  const workflow = await readFile(
    new URL("../.github/workflows/deploy-cloudflare-pages.yml", import.meta.url),
    "utf8",
  );

  assert.match(workflow, /production:\n\s+description: Deploy the selected ref to the production Pages branch/);
  assert.match(workflow, /if \[ "\$GITHUB_EVENT_NAME" = "push" \] \|\| \[ "\$DEPLOY_PRODUCTION" = "true" \]/);
  assert.match(workflow, /echo "branch=main" >> "\$GITHUB_OUTPUT"/);
  assert.match(workflow, /--branch="\$\{\{ steps\.pages\.outputs\.branch \}\}"/);
});
