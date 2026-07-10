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
