import { readFile } from "node:fs/promises";
import { evaluateFieldQc } from "../src/fieldQcEvaluation.js";

const path = process.argv[2];
if (!path) {
  console.error("Usage: npm run eval:field-qc -w @inspectiq/api -- /absolute/path/to/independently-labeled-run.json");
  process.exitCode = 2;
} else {
  try {
    const result = evaluateFieldQc(JSON.parse(await readFile(path, "utf8")));
    console.log(JSON.stringify(result, null, 2));
    if (!result.pointTargetsMet) process.exitCode = 1;
  } catch (error) {
    console.error(error instanceof Error ? error.message : "Invalid evaluation input.");
    process.exitCode = 2;
  }
}
