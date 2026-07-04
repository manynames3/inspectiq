import { build } from "esbuild";
import { copyFile, cp, mkdir, rm } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const exec = promisify(execFile);
const outdir = "dist/lambda";

await rm(outdir, { recursive: true, force: true });
await mkdir(outdir, { recursive: true });

const common = {
  bundle: true,
  platform: "node",
  target: "node22",
  format: "esm",
  sourcemap: false,
  minify: false,
  external: ["pg-native"],
  banner: {
    js: "import { createRequire } from 'module'; const require = createRequire(import.meta.url);"
  }
};

await Promise.all([
  build({
    ...common,
    entryPoints: ["apps/api/src/lambda.ts"],
    outfile: `${outdir}/api.mjs`
  }),
  build({
    ...common,
    entryPoints: ["apps/api/src/imageWorker.ts"],
    outfile: `${outdir}/imageWorker.mjs`
  })
]);

await copyFile("apps/api/src/db/schema.sql", `${outdir}/schema.sql`);
await cp("sample-data/images", `${outdir}/sample-images`, { recursive: true });

await rm("dist/inspectiq-lambda.zip", { force: true });
await exec("zip", ["-qr", "../inspectiq-lambda.zip", "."], { cwd: outdir });

console.log(JSON.stringify({
  ok: true,
  artifact: "dist/inspectiq-lambda.zip",
  handlers: ["api.handler", "imageWorker.handler"]
}));
