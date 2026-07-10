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
