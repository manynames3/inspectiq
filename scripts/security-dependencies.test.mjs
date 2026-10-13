import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const lock = JSON.parse(readFileSync(new URL("../package-lock.json", import.meta.url), "utf8"));
// Stable patched floors from the security review. Check every nested copy,
// not just the hoisted package; a dependency refresh can reintroduce old copies.
const patchedFloors = {
  "body-parser": "1.20.6",
  qs: "6.16.0",
  sharp: "0.35.5",
  "react-router": "7.18.2",
  vitest: "4.1.11",
  "@vitest/mocker": "4.1.11",
  metro: "0.84.5",
  nanoid: "3.3.18",
  postcss: "8.5.23",
  "shell-quote": "1.8.5"
};

function meetsFloor(version, floor) {
  if (!/^\d+\.\d+\.\d+$/.test(version)) return false;
  const actual = version.split(".").map(Number);
  const minimum = floor.split(".").map(Number);
  for (let i = 0; i < 3; i += 1) {
    if (actual[i] !== minimum[i]) return actual[i] > minimum[i];
  }
  return true;
}

for (const [name, floor] of Object.entries(patchedFloors)) {
  test(`${name} has no locked copy below patched ${floor}`, () => {
    const copies = Object.entries(lock.packages).filter(([path]) => path.endsWith(`/node_modules/${name}`) || path === `node_modules/${name}`);
    assert.ok(copies.length > 0, `${name} missing; review this security contract if the dependency was intentionally removed`);
    for (const [path, pkg] of copies) {
      assert.ok(meetsFloor(pkg.version, floor), `${path}@${pkg.version} is below patched ${floor}`);
    }
  });
}

test("Metro does not reintroduce vulnerable image-size tooling", () => {
  for (const [path, pkg] of Object.entries(lock.packages)) {
    if (path.endsWith("/node_modules/image-size") || path === "node_modules/image-size") {
      assert.ok(meetsFloor(pkg.version, "2.0.3"), `${path}@${pkg.version} is vulnerable`);
    }
  }
});
