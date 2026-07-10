import { existsSync } from "node:fs";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import AxeBuilder from "@axe-core/playwright";
import pixelmatch from "pixelmatch";
import { chromium } from "playwright-core";
import { PNG } from "pngjs";

const baseUrl = process.env.E2E_BASE_URL ?? "http://localhost:5173";
const outputDir = process.env.SCREENSHOT_OUTPUT_DIR ?? "output/screenshots";
const baselinePlatform = process.platform === "darwin" ? "macos" : "linux";
const baselineDir = process.env.SCREENSHOT_BASELINE_DIR ?? `apps/web/tests/visual-baselines/${baselinePlatform}`;
const updateBaselines = process.env.UPDATE_SCREENSHOT_BASELINES === "true";
const maxDiffRatio = Number(process.env.VISUAL_DIFF_MAX_RATIO ?? "0.03");
const fixedBrowserTime = process.env.INSPECTIQ_FIXED_NOW;
const chromePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
  ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const executablePath = existsSync(chromePath) ? chromePath : undefined;

function actorHeaders(role) {
  const names = {
    inspector: "Screenshot Inspector",
    reviewer: "Screenshot Reviewer",
    admin: "Screenshot Admin"
  };
  return {
    "x-actor-id": `screenshot-${role}`,
    "x-actor-name": names[role],
    "x-actor-role": role
  };
}

async function setLocalRole(page, role) {
  await page.evaluate((nextRole) => {
    const names = {
      inspector: "John Smith",
      reviewer: "Review Lead",
      admin: "Admin Operator"
    };
    window.localStorage.setItem("inspectiq.local.session", JSON.stringify({
      idToken: "local-dev-token",
      accessToken: null,
      expiresAt: Date.now() + 60 * 60 * 1000,
      actor: {
        id: `screenshot-${nextRole}`,
        name: names[nextRole],
        role: nextRole
      }
    }));
  }, role);
}

async function waitForText(page, text) {
  await page.waitForFunction(
    (expected) => document.body.innerText.toLowerCase().includes(expected.toLowerCase()),
    text,
    { timeout: 20_000 }
  );
}

async function api(pathname, role = "inspector", options = {}) {
  const response = await fetch(`${baseUrl}${pathname}`, {
    ...options,
    headers: {
      ...actorHeaders(role),
      "content-type": "application/json",
      ...(options.headers ?? {})
    }
  });
  if (!response.ok) {
    throw new Error(`API ${pathname} failed: ${response.status} ${await response.text()}`);
  }
  return response.json();
}

async function createScreenshotInspection() {
  const vin = `SCREEN${Date.now().toString().slice(-10)}`;
  const created = await api("/api/inspections", "inspector", {
    method: "POST",
    body: JSON.stringify({
      vin,
      year: 2022,
      make: "Ford",
      model: "Escape",
      trim: "SEL",
      mileage: 38125,
      exteriorColor: "White",
      sellerSource: "Screenshot regression lane",
      inspectorName: "Screenshot Inspector"
    })
  });
  const inspectionId = created.data.id;
  await api(`/api/inspections/${inspectionId}/photos/sample`, "inspector", {
    method: "POST",
    body: JSON.stringify({ sampleKey: "vehicle-required-set" })
  });
  await api(`/api/inspections/${inspectionId}/photos/analyze`, "inspector", {
    method: "POST",
    body: JSON.stringify({})
  });
  await api(`/api/inspections/${inspectionId}/damage`, "reviewer", {
    method: "POST",
    body: JSON.stringify({
      location: "rear bumper",
      damageType: "scratch",
      severity: "minor",
      notes: "Reviewer-confirmed cosmetic scrape for screenshot regression.",
      source: "manual"
    })
  });
  return inspectionId;
}

async function resolveScreenshotInspection() {
  const response = await api("/api/inspections", "reviewer");
  const inspections = response.data ?? [];
  const documentedFord = inspections.find((inspection) => inspection.vin === "1FMCU9H6XNUB81389");
  if (documentedFord) return documentedFord.id;
  const reusable = inspections.find((inspection) => (
    inspection.completenessPercentage === 100 &&
    inspection.status !== "DRAFT" &&
    inspection.inspectorName === "John Smith" &&
    !inspection.vin.startsWith("SCREEN")
  ));
  if (reusable) return reusable.id;
  return createScreenshotInspection();
}

async function compareScreenshot(name, outputPath) {
  const baselinePath = path.join(baselineDir, `${name}.png`);
  if (updateBaselines) {
    await mkdir(baselineDir, { recursive: true });
    await copyFile(outputPath, baselinePath);
    return { name, diffRatio: 0, updated: true };
  }
  if (!existsSync(baselinePath)) {
    return {
      name,
      diffRatio: 1,
      updated: false,
      error: `Missing visual baseline ${baselinePath}. Review ${outputPath} before accepting it.`
    };
  }
  const [actualBytes, baselineBytes] = await Promise.all([readFile(outputPath), readFile(baselinePath)]);
  const actual = PNG.sync.read(actualBytes);
  const baseline = PNG.sync.read(baselineBytes);
  if (actual.width !== baseline.width || actual.height !== baseline.height) {
    return {
      name,
      diffRatio: 1,
      updated: false,
      error: `${name} dimensions changed from ${baseline.width}x${baseline.height} to ${actual.width}x${actual.height}.`
    };
  }
  const diff = new PNG({ width: actual.width, height: actual.height });
  const changedPixels = pixelmatch(actual.data, baseline.data, diff.data, actual.width, actual.height, {
    threshold: 0.14,
    includeAA: false
  });
  const diffRatio = changedPixels / (actual.width * actual.height);
  if (diffRatio > maxDiffRatio) {
    const diffPath = path.join(outputDir, `${name}.diff.png`);
    await writeFile(diffPath, PNG.sync.write(diff));
    return {
      name,
      diffRatio,
      updated: false,
      error: `${name} visual drift ${(diffRatio * 100).toFixed(2)}% exceeds ${(maxDiffRatio * 100).toFixed(2)}%. See ${diffPath}.`
    };
  }
  return { name, diffRatio, updated: false };
}

async function verifyPageQuality(page, name) {
  const layout = await page.evaluate(() => ({
    viewportWidth: document.documentElement.clientWidth,
    documentWidth: document.documentElement.scrollWidth,
    emptyButtons: [...document.querySelectorAll("button")]
      .filter((element) => !(element.textContent ?? "").trim() && !element.getAttribute("aria-label") && !element.getAttribute("title"))
      .length,
    unlabeledInputs: [...document.querySelectorAll("input, select, textarea")]
      .filter((element) => !("labels" in element && element.labels?.length) && !element.getAttribute("aria-label") && !element.getAttribute("aria-labelledby"))
      .length
  }));
  if (layout.documentWidth > layout.viewportWidth + 2) {
    throw new Error(`${name} causes document-level horizontal overflow (${layout.documentWidth}px > ${layout.viewportWidth}px).`);
  }
  if (layout.emptyButtons > 0) throw new Error(`${name} contains ${layout.emptyButtons} unnamed buttons.`);
  if (layout.unlabeledInputs > 0) throw new Error(`${name} contains ${layout.unlabeledInputs} unlabeled form controls.`);

  const accessibility = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  const blocking = accessibility.violations.filter((violation) => violation.impact === "critical" || violation.impact === "serious");
  if (blocking.length > 0) {
    throw new Error(`${name} has blocking accessibility violations:\n${blocking.map((violation) => `${violation.id}: ${violation.help} (${violation.nodes.length}) ${violation.nodes.map((node) => node.target.join(" ")).join(", ")}`).join("\n")}`);
  }
}

async function capture(page, name, route, role, text, viewport = { width: 1440, height: 1000 }) {
  await page.setViewportSize(viewport);
  await page.goto(baseUrl, { waitUntil: "networkidle" });
  await setLocalRole(page, role);
  await page.goto(`${baseUrl}${route}`, { waitUntil: "networkidle" });
  await waitForText(page, text);
  await page.addStyleTag({ content: "*, *::before, *::after { animation-duration: 0s !important; transition-duration: 0s !important; caret-color: transparent !important; }" });
  await verifyPageQuality(page, name);
  const outputPath = path.join(outputDir, `${name}.png`);
  await page.screenshot({
    path: outputPath,
    fullPage: true
  });
  return compareScreenshot(name, outputPath);
}

await mkdir(outputDir, { recursive: true });

const browser = await chromium.launch({
  headless: true,
  executablePath
});

const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
  timezoneId: "America/New_York"
});
const page = await context.newPage();
if (fixedBrowserTime) {
  await page.clock.setFixedTime(fixedBrowserTime);
}
const consoleIssues = [];
page.on("console", (message) => {
  if (message.type() === "error") consoleIssues.push(message.text());
});
page.on("pageerror", (error) => consoleIssues.push(error.message));
page.on("requestfailed", (request) => {
  consoleIssues.push(`${request.resourceType()} request failed: ${request.url()} (${request.failure()?.errorText ?? "unknown error"})`);
});

try {
  const inspectionId = await resolveScreenshotInspection();

  const results = [];
  results.push(await capture(page, "dashboard", "/", "inspector", "Capture queue"));
  results.push(await capture(page, "inspection-workbench", `/inspections/${inspectionId}`, "reviewer", "Workflow status"));
  results.push(await capture(page, "suggestions-queue", "/suggestions", "reviewer", "Suggestions"));
  results.push(await capture(page, "damage-page", "/damage", "reviewer", "Damage"));
  results.push(await capture(page, "reports-page", "/reports", "reviewer", "Report"));
  results.push(await capture(page, "audit-page", "/audit", "admin", "Audit"));
  results.push(await capture(page, "platform-health", "/platform-health", "admin", "Production proof"));
  results.push(await capture(page, "tablet-workbench", `/inspections/${inspectionId}`, "reviewer", "Workflow status", { width: 1024, height: 768 }));
  results.push(await capture(page, "mobile-capture", `/inspections/${inspectionId}`, "inspector", "Required photo checklist", { width: 390, height: 844 }));

  console.log(JSON.stringify({
    ok: results.every((result) => !result.error),
    outputDir,
    baselineDir,
    updatedBaselines: updateBaselines,
    maxDiffRatio,
    screenshots: results
  }, null, 2));

  const relevantIssues = consoleIssues.filter((issue) => !issue.includes("Download the React DevTools"));
  if (relevantIssues.length > 0) {
    throw new Error(`Console errors during screenshot regression:\n${relevantIssues.join("\n")}`);
  }
  const visualFailures = results.flatMap((result) => result.error ? [result.error] : []);
  if (visualFailures.length > 0) {
    throw new Error(`Visual regression failed:\n${visualFailures.join("\n")}`);
  }
} finally {
  await context.close();
  await browser.close();
}
