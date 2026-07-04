import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { chromium } from "playwright-core";

const baseUrl = process.env.E2E_BASE_URL ?? "http://localhost:5173";
const chromePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
  ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const executablePath = existsSync(chromePath) ? chromePath : undefined;

function fail(message) {
  throw new Error(`[inspectiq-e2e] ${message}`);
}

async function waitForBodyText(page, text, timeout = 15_000) {
  await page.waitForFunction(
    (expected) => document.body.innerText.includes(expected),
    text,
    { timeout }
  );
}

async function acceptVisibleSuggestions(page) {
  for (let index = 0; index < 20; index += 1) {
    const cards = page.locator(".suggestion-card");
    if (await cards.count() === 0) return;
    const acceptButton = page.locator(".suggestion-card .accept-button:not([disabled])").first();
    try {
      await acceptButton.waitFor({ timeout: 5_000 });
    } catch {
      if (await cards.count() === 0) return;
      fail("Suggestion cards remained visible without an enabled Accept button.");
    }
    await acceptButton.click();
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(250);
  }
  fail("Suggestion acceptance loop exceeded expected count.");
}

const browser = await chromium.launch({
  headless: true,
  executablePath
});

const context = await browser.newContext({
  acceptDownloads: true,
  viewport: { width: 1440, height: 1000 }
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
  const uniqueVin = `E2EVIN${Date.now().toString().slice(-10)}`;
  await page.goto(baseUrl, { waitUntil: "networkidle" });
  await waitForBodyText(page, "Capture queue");
  await page.locator(".role-select select").selectOption("reviewer");
  await waitForBodyText(page, "Review queue");
  await page.locator(".role-select select").selectOption("admin");
  await waitForBodyText(page, "Operations control");
  await page.locator(".role-select select").selectOption("inspector");

  await page.goto(`${baseUrl}/new`, { waitUntil: "networkidle" });
  await waitForBodyText(page, "New Inspection");

  await page.getByLabel(/^vin$/i).fill(uniqueVin);
  await page.getByLabel(/^year$/i).fill("2024");
  await page.getByLabel(/^make$/i).fill("Hyundai");
  await page.getByLabel(/^model$/i).fill("Tucson");
  await page.getByLabel(/^trim$/i).fill("SEL");
  await page.getByLabel(/^mileage$/i).fill("14250");
  await page.getByLabel(/exterior color/i).fill("Gray");
  await page.getByLabel(/seller source/i).fill("Wholesale offsite lane");
  await page.getByLabel(/inspector name/i).fill("E2E Inspector");
  await page.getByRole("button", { name: /create inspection/i }).click();
  await page.waitForURL(/\/inspections\/[^/]+$/, { timeout: 15_000 });

  await page.getByRole("button", { name: /attach photo set/i }).click();
  await waitForBodyText(page, "Uploaded images (8)");
  await page.getByRole("button", { name: /analyze photos/i }).click();
  await page.locator(".suggestion-card").first().waitFor({ timeout: 120_000 });

  await page.locator(".role-select select").selectOption("reviewer");
  await page.locator(".suggestion-card .accept-button:not([disabled])").first().waitFor({ timeout: 120_000 });
  await acceptVisibleSuggestions(page);
  await waitForBodyText(page, "Ready for grading");

  await page.getByRole("button", { name: /calculate grade/i }).click();
  await waitForBodyText(page, "Score based on evidence completeness");
  await waitForBodyText(page, "CR ready");
  await page.getByRole("button", { name: /draft report/i }).click();
  await waitForBodyText(page, "Draft summary");
  await page.getByRole("button", { name: /^finalize$/i }).click();
  await waitForBodyText(page, "Finalized");
  await waitForBodyText(page, "Buyer-visible");
  await waitForBodyText(page, "report.finalized");

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: /export buyer report/i }).click();
  const download = await downloadPromise;
  const downloadPath = await download.path();
  if (!downloadPath) fail("Buyer report download did not produce a local file.");
  const exportedText = await readFile(downloadPath, "utf8");
  if (!exportedText.includes("Condition Report:")) fail("Buyer report export is missing the report header.");
  if (exportedText.includes("VisionOutputSchema") || exportedText.includes("validated schema")) {
    fail("Buyer report export leaked internal schema language.");
  }

  const relevantConsoleIssues = consoleIssues.filter((message) =>
    !message.includes("Download the React DevTools")
  );
  if (relevantConsoleIssues.length > 0) {
    fail(`Console issues detected:\n${relevantConsoleIssues.join("\n")}`);
  }

  console.log(JSON.stringify({
    ok: true,
    flow: "create_attach_analyze_review_grade_draft_finalize",
    url: page.url()
  }));
} finally {
  await context.close();
  await browser.close();
}
