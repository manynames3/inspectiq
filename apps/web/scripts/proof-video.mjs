import { existsSync } from "node:fs";
import { mkdir, rename } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright-core";

const baseUrl = process.env.E2E_BASE_URL ?? "http://localhost:5173";
const videoDir = process.env.PROOF_VIDEO_DIR ?? "docs/images/proof-video";
const finalVideoPath = process.env.PROOF_VIDEO_PATH ?? "docs/images/inspectiq-proof.webm";
const chromePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
  ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const executablePath = existsSync(chromePath) ? chromePath : undefined;

function fail(message) {
  throw new Error(`[inspectiq-proof-video] ${message}`);
}

async function waitForBodyText(page, text, timeout = 20_000) {
  await page.waitForFunction(
    (expected) => document.body.innerText.toLowerCase().includes(expected.toLowerCase()),
    text,
    { timeout }
  );
}

async function pause(page, ms = 650) {
  await page.waitForTimeout(ms);
}

async function acceptVisibleSuggestions(page) {
  for (let index = 0; index < 20; index += 1) {
    const cards = page.locator(".suggestion-card");
    if (await cards.count() === 0) return;
    const acceptButton = page.locator(".suggestion-card .accept-button:not([disabled])").first();
    await acceptButton.waitFor({ timeout: 10_000 });
    await acceptButton.click();
    await page.waitForLoadState("networkidle");
    await pause(page, 250);
  }
  fail("Suggestion acceptance loop exceeded expected count.");
}

await mkdir(videoDir, { recursive: true });
await mkdir(path.dirname(finalVideoPath), { recursive: true });

const browser = await chromium.launch({
  headless: true,
  executablePath
});

const context = await browser.newContext({
  acceptDownloads: true,
  viewport: { width: 1440, height: 900 },
  recordVideo: {
    dir: videoDir,
    size: { width: 1440, height: 900 }
  }
});
const page = await context.newPage();
const consoleIssues = [];
page.on("console", (message) => {
  if (message.type() === "error") consoleIssues.push(`${message.type()}: ${message.text()}`);
});
page.on("pageerror", (error) => consoleIssues.push(`pageerror: ${error.message}`));

try {
  const uniqueVin = `PROOF${Date.now().toString().slice(-11)}`;
  await page.goto(baseUrl, { waitUntil: "networkidle" });
  await waitForBodyText(page, "InspectIQ Secure Workspace");
  await page.getByRole("button", { name: /start inspector session/i }).click();
  await waitForBodyText(page, "Capture queue");
  await pause(page);

  await page.goto(`${baseUrl}/new`, { waitUntil: "networkidle" });
  await waitForBodyText(page, "New Inspection");
  await page.getByLabel(/^vin$/i).fill(uniqueVin);
  await page.getByLabel(/^year$/i).fill("2022");
  await page.getByLabel(/^make$/i).fill("Ford");
  await page.getByLabel(/^model$/i).fill("Escape");
  await page.getByLabel(/^trim$/i).fill("SEL");
  await page.getByLabel(/^mileage$/i).fill("38125");
  await page.getByLabel(/exterior color/i).fill("White");
  await page.getByLabel(/seller source/i).fill("Wholesale offsite lane");
  await page.getByLabel(/inspector name/i).fill("Proof Inspector");
  await pause(page);
  await page.getByRole("button", { name: /create inspection/i }).click();
  await page.waitForURL(/\/inspections\/[^/]+$/, { timeout: 15_000 });
  await waitForBodyText(page, "Workflow status");
  await pause(page);

  await page.getByRole("button", { name: /load reference set/i }).click();
  await waitForBodyText(page, "Uploaded images (8)");
  await pause(page);
  await page.getByRole("button", { name: /analyze photos/i }).click();
  await page.locator(".suggestion-card").first().waitFor({ timeout: 120_000 });
  const inspectionUrl = page.url();
  await pause(page);

  await page.locator(".role-select select").selectOption("reviewer");
  await page.goto(`${baseUrl}/suggestions`, { waitUntil: "networkidle" });
  await waitForBodyText(page, "Suggestions");
  await page.locator(".queue-search-field input").fill(uniqueVin);
  await waitForBodyText(page, uniqueVin);
  await pause(page);

  await page.goto(inspectionUrl, { waitUntil: "networkidle" });
  await page.locator(".role-select select").selectOption("reviewer");
  await page.locator(".suggestion-card .accept-button:not([disabled])").first().waitFor({ timeout: 120_000 });
  await acceptVisibleSuggestions(page);
  await waitForBodyText(page, "Grade ready");
  await pause(page);

  await page.getByRole("button", { name: /calculate grade/i }).click();
  await waitForBodyText(page, "Score based on evidence completeness");
  await page.getByRole("button", { name: /draft report/i }).click();
  await waitForBodyText(page, "Draft summary");
  await pause(page);
  await page.getByRole("button", { name: /^finalize$/i }).click();
  await waitForBodyText(page, "Finalized");
  await waitForBodyText(page, "report.finalized");
  await pause(page);

  await page.locator(".role-select select").selectOption("admin");
  await page.goto(`${baseUrl}/platform-health`, { waitUntil: "networkidle" });
  await waitForBodyText(page, "Production proof");
  await pause(page, 1000);

  const relevantIssues = consoleIssues.filter((message) => !message.includes("Download the React DevTools"));
  if (relevantIssues.length > 0) {
    fail(`Console issues detected:\n${relevantIssues.join("\n")}`);
  }
} finally {
  const video = page.video();
  await context.close();
  await browser.close();
  const rawPath = await video?.path();
  if (rawPath) {
    await rename(rawPath, finalVideoPath);
    console.log(JSON.stringify({ ok: true, video: finalVideoPath }, null, 2));
  }
}
