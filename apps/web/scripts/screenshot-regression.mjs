import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright-core";

const baseUrl = process.env.E2E_BASE_URL ?? "http://localhost:5173";
const outputDir = process.env.SCREENSHOT_OUTPUT_DIR ?? "docs/images/regression";
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
  const reusable = inspections.find((inspection) => (
    inspection.completenessPercentage === 100 &&
    inspection.status !== "DRAFT" &&
    inspection.inspectorName === "John Smith" &&
    !inspection.vin.startsWith("SCREEN")
  ));
  if (reusable) return reusable.id;
  return createScreenshotInspection();
}

async function capture(page, name, route, role, text, viewport = { width: 1440, height: 1000 }) {
  await page.setViewportSize(viewport);
  await page.goto(baseUrl, { waitUntil: "networkidle" });
  await setLocalRole(page, role);
  await page.goto(`${baseUrl}${route}`, { waitUntil: "networkidle" });
  await waitForText(page, text);
  await page.screenshot({
    path: path.join(outputDir, `${name}.png`),
    fullPage: true
  });
}

await mkdir(outputDir, { recursive: true });

const browser = await chromium.launch({
  headless: true,
  executablePath
});

const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 }
});
const page = await context.newPage();
const consoleIssues = [];
page.on("console", (message) => {
  if (message.type() === "error") consoleIssues.push(message.text());
});
page.on("pageerror", (error) => consoleIssues.push(error.message));

try {
  const inspectionId = await resolveScreenshotInspection();

  await capture(page, "dashboard", "/", "inspector", "Capture queue");
  await capture(page, "inspection-workbench", `/inspections/${inspectionId}`, "reviewer", "Workflow status");
  await capture(page, "suggestions-queue", "/suggestions", "reviewer", "Suggestions");
  await capture(page, "damage-page", "/damage", "reviewer", "Damage");
  await capture(page, "reports-page", "/reports", "reviewer", "Report");
  await capture(page, "audit-page", "/audit", "admin", "Audit");
  await capture(page, "platform-health", "/platform-health", "admin", "Production proof");
  await capture(page, "mobile-capture", `/inspections/${inspectionId}`, "inspector", "Required photo checklist", { width: 390, height: 844 });

  const relevantIssues = consoleIssues.filter((issue) => !issue.includes("Download the React DevTools"));
  if (relevantIssues.length > 0) {
    throw new Error(`Console errors during screenshot regression:\n${relevantIssues.join("\n")}`);
  }

  console.log(JSON.stringify({
    ok: true,
    outputDir,
    screenshots: [
      "dashboard.png",
      "inspection-workbench.png",
      "suggestions-queue.png",
      "damage-page.png",
      "reports-page.png",
      "audit-page.png",
      "platform-health.png",
      "mobile-capture.png"
    ]
  }, null, 2));
} finally {
  await context.close();
  await browser.close();
}
