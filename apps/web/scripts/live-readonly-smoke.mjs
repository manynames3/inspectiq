import { existsSync } from "node:fs";
import { chromium } from "playwright-core";

const baseUrl = (process.env.E2E_BASE_URL ?? "https://inspectiq.pages.dev").replace(/\/+$/, "");
const chromePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
  ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const executablePath = existsSync(chromePath) ? chromePath : undefined;

function fail(message) {
  throw new Error(`[inspectiq-live-smoke] ${message}`);
}

async function bodyText(page) {
  return page.locator("body").innerText({ timeout: 15_000 });
}

async function expectBodyText(page, expected, timeout = 20_000) {
  await page.waitForFunction(
    (text) => document.body.innerText.includes(text),
    expected,
    { timeout }
  );
}

async function expectNoPublicErrors(page, label) {
  const text = await bodyText(page);
  const blockers = [
    "API request failed",
    "Failed to fetch",
    "JWT is missing",
    "Unauthorized",
    "No active session"
  ];
  const found = blockers.find((blocker) => text.includes(blocker));
  if (found) fail(`${label} displayed "${found}".`);
}

const browser = await chromium.launch({
  headless: true,
  executablePath
});

const context = await browser.newContext({
  viewport: { width: 1440, height: 960 }
});
const page = await context.newPage();
const consoleIssues = [];
page.on("console", (message) => {
  if (message.type() === "error" || message.type() === "warning") {
    consoleIssues.push(`${message.type()}: ${message.text()}`);
  }
});
page.on("pageerror", (error) => {
  consoleIssues.push(`pageerror: ${error.message}`);
});

try {
  await page.goto(baseUrl, { waitUntil: "networkidle" });
  await expectBodyText(page, "VEHICLE INSPECTION WORKSPACE");
  const previewButton = page.getByRole("button", { name: "Enter read-only workspace" });
  if (await previewButton.count() !== 1) fail("Enter read-only workspace button was not available.");
  await previewButton.click();
  await expectBodyText(page, "Dashboard");
  await expectBodyText(page, "Operations control");
  await expectNoPublicErrors(page, "Dashboard");

  await page.goto(`${baseUrl}/inspections`, { waitUntil: "networkidle" });
  await expectBodyText(page, "Inspections");
  await expectBodyText(page, "Total inspections");
  await expectBodyText(page, "Open");
  await expectNoPublicErrors(page, "Inspections");

  const inspectionLinks = page.locator('a[href^="/inspections/"]');
  const inspectionCount = await inspectionLinks.count();
  if (inspectionCount < 1) fail("No inspection detail links were rendered.");
  await inspectionLinks.first().click();
  await page.waitForURL(/\/inspections\/[^/]+$/, { timeout: 15_000 });
  await page.waitForLoadState("networkidle", { timeout: 30_000 });
  await expectBodyText(page, "Workflow status");
  await expectBodyText(page, "Required photo checklist");
  await expectBodyText(page, "Uploaded images");
  await expectNoPublicErrors(page, "Inspection detail");
  await page.waitForFunction(() => document.querySelectorAll(".photo-tile").length >= 6, null, { timeout: 30_000 });
  await page.waitForFunction(() => document.querySelectorAll(".photo-tile img").length >= 6, null, { timeout: 30_000 });
  const imageCount = await page.locator(".photo-tile img").count();
  if (imageCount < 6) fail(`Expected at least 6 evidence images, found ${imageCount}.`);

  await page.goto(`${baseUrl}/platform-health`, { waitUntil: "networkidle" });
  await expectBodyText(page, "Platform Health");
  await expectBodyText(page, "Live stack proof");
  await expectBodyText(page, "AI validation contract");
  await page.waitForFunction(() => /bedrock/i.test(document.body.innerText), null, { timeout: 15_000 });
  await expectNoPublicErrors(page, "Platform Health");

  const relevantConsoleIssues = consoleIssues.filter((message) =>
    !message.includes("Download the React DevTools")
  );
  if (relevantConsoleIssues.length > 0) {
    fail(`Console issues detected:\n${relevantConsoleIssues.join("\n")}`);
  }

  console.log(JSON.stringify({
    ok: true,
    flow: "public_preview_readonly_dashboard_inspections_detail_platform_health",
    baseUrl,
    evidenceImages: imageCount
  }));
} finally {
  await context.close();
  await browser.close();
}
