import { cp, mkdir, rm } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const exec = promisify(execFile);
const outdir = "dist/operations-projector";

await rm(outdir, { recursive: true, force: true });
await mkdir(outdir, { recursive: true });
await cp("services/operations-projector/handler.py", `${outdir}/handler.py`);
await rm("dist/inspectiq-operations-projector.zip", { force: true });
await exec("zip", ["-qr", "../inspectiq-operations-projector.zip", "."], { cwd: outdir });

console.log(JSON.stringify({
  ok: true,
  artifact: "dist/inspectiq-operations-projector.zip",
  handler: "handler.handler"
}));
