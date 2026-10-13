import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { chromium } from "playwright-core";

const baseUrl = process.env.E2E_BASE_URL ?? "http://localhost:5173";
const chromePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
  ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const executablePath = existsSync(chromePath) ? chromePath : undefined;

function generatedReviewVin() {
  const suffix = Date.now().toString(36).toUpperCase().replace(/[IOQ]/g, "X").slice(-9);
  return `1FMCU9H6${suffix}`.padEnd(17, "0").slice(0, 17);
}

function fail(message) {
  throw new Error(`[inspectiq-e2e] ${message}`);
}

async function waitForBodyText(page, text, timeout = 15_000) {
  await page.waitForFunction(
    (expected) => document.body.innerText.toLowerCase().includes(expected.toLowerCase()),
    text,
    { timeout }
  );
}

async function acceptVisibleSuggestions(page) {
  for (let index = 0; index < 64; index += 1) {
    const cards = page.locator(".suggestion-card");
    if (await cards.count() === 0) {
      const nextFinding = page.getByRole("button", { name: "Next finding" });
      if (await nextFinding.count() === 0) return;
      await nextFinding.click();
      await cards.first().waitFor({ timeout: 5_000 });
    }
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

async function openDetails(page, selector) {
  const details = page.locator(selector);
  if (!await details.evaluate((element) => element.open)) await details.locator(":scope > summary").click();
}

async function selectRole(page, role) {
  await openDetails(page, ".account-menu");
  await page.locator(".role-select select").selectOption(role);
  await page.waitForFunction((value) => document.querySelector(".role-select select")?.value === value, role);
  await page.locator(".account-menu > summary").click();
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
page.setDefaultTimeout(15_000);
page.setDefaultNavigationTimeout(30_000);
if (process.env.INSPECTIQ_FIXED_NOW) await page.clock.setFixedTime(process.env.INSPECTIQ_FIXED_NOW);
const consoleIssues = [];
page.on("console", (message) => {
  if (message.type() === "error" || message.type() === "warning") {
    consoleIssues.push(`${message.type()}: ${message.text()}`);
  }
});
page.on("pageerror", (error) => {
  consoleIssues.push(`pageerror: ${error.message}`);
});
page.on("response", (response) => {
  if (response.status() >= 400) {
    consoleIssues.push(`http ${response.status()}: ${response.url()}`);
  }
});

try {
  const uniqueVin = generatedReviewVin();
  await page.goto(baseUrl, { waitUntil: "networkidle" });
  await waitForBodyText(page, "InspectIQ Secure Workspace");
  await page.getByRole("button", { name: /start inspector session/i }).click();
  await waitForBodyText(page, "Capture queue");
  await selectRole(page, "reviewer");
  await waitForBodyText(page, "Review queue");
  await selectRole(page, "admin");
  await waitForBodyText(page, "Operations control");
  await selectRole(page, "inspector");

  await page.goto(`${baseUrl}/new`, { waitUntil: "networkidle" });
  await waitForBodyText(page, "New Inspection");

  await page.getByLabel(/^vin$/i).fill(uniqueVin);
  await page.getByLabel(/^year$/i).fill("2022");
  await page.getByLabel(/^make$/i).fill("Ford");
  await page.getByLabel(/^model$/i).fill("Escape");
  await page.getByLabel(/^trim$/i).fill("SEL");
  await page.getByLabel(/^mileage$/i).fill("31992");
  await page.getByLabel(/exterior color/i).fill("Iced Blue Silver Metallic");
  await page.getByLabel(/seller source/i).fill("Wholesale offsite lane");
  await page.getByLabel(/inspector name/i).fill("E2E Inspector");
  await page.getByRole("button", { name: /create inspection/i }).click();
  await page.waitForURL(/\/inspections\/[^/]+$/, { timeout: 15_000 });

  await openDetails(page, ".capture-support");
  await page.getByRole("button", { name: /load reference set/i }).click();
  await waitForBodyText(page, "Uploaded images (8)");
  await page.getByRole("button", { name: /analyze photos/i }).click();
  await page.locator(".suggestion-card").first().waitFor({ timeout: 120_000 });
  await page.locator(".field-capture-panel").waitFor({ timeout: 15_000 });

  await selectRole(page, "reviewer");
  const inspectionUrl = page.url();
  await page.goto(`${baseUrl}/suggestions`, { waitUntil: "networkidle" });
  await waitForBodyText(page, "Suggestions");
  await waitForBodyText(page, "SLA");
  await waitForBodyText(page, "Inspector QA");
  await waitForBodyText(page, uniqueVin);
  await page.locator(".queue-search-field input").fill(uniqueVin);
  await waitForBodyText(page, "findings");
  await waitForBodyText(page, "Due in");
  await page.goto(inspectionUrl, { waitUntil: "networkidle" });
  await selectRole(page, "reviewer");
  await openDetails(page, ".inspection-utilities");
  await page.getByRole("button", { name: /assign findings to me/i }).click();
  await page.locator(".inspection-utilities > summary").click();
  await page.locator(".suggestion-card .accept-button:not([disabled])").first().waitFor({ timeout: 120_000 });
  await acceptVisibleSuggestions(page);
  await waitForBodyText(page, "Grade ready");

  await page.getByRole("button", { name: /^Enlarge / }).first().click();
  await page.getByRole("dialog", { name: "Enlarged evidence photo" }).waitFor();
  if (process.env.E2E_VIEWER_SCREENSHOT_PATH) await page.screenshot({ path: process.env.E2E_VIEWER_SCREENSHOT_PATH });
  await page.getByRole("button", { name: "Next photo", exact: true }).click();
  await page.getByRole("button", { name: "Previous photo", exact: true }).click();
  await page.keyboard.press("Escape");
  await page.getByRole("dialog", { name: "Enlarged evidence photo" }).waitFor({ state: "hidden" });
  await page.getByRole("button", { name: /^Report QC/ }).click();
  for (let index = 0; index < 30; index += 1) {
    const decision = page.locator(".condition-qc-decision").first();
    const remaining = await page.locator(".condition-qc-decision").count();
    if (remaining === 0) break;
    await decision.locator("textarea").fill("Local workflow proof: explicitly disclose reference identity limitations; not actual vehicle verification.");
    await Promise.all([
      page.waitForResponse((response) => response.url().endsWith("/condition-qc/review") && response.request().method() === "POST"),
      decision.getByRole("button", { name: "Acknowledge limitation" }).click()
    ]);
    await page.waitForFunction((previousCount) => document.querySelectorAll(".condition-qc-decision").length < previousCount, remaining);
    await page.waitForLoadState("networkidle");
  }
  if (await page.locator(".condition-qc-decision").count() > 0) fail("QC limitation review did not finish.");
  await page.getByText("Automatic preliminary condition report", { exact: true }).click();
  if (process.env.E2E_QC_SCREENSHOT_PATH) {
    await page.locator(".condition-qc-panel").scrollIntoViewIfNeeded();
    await page.screenshot({ path: process.env.E2E_QC_SCREENSHOT_PATH });
  }
  await page.getByRole("button", { name: "Close QC workspace" }).click();

  await page.getByRole("button", { name: /calculate grade/i }).click();
  await waitForBodyText(page, "Condition grade based on required evidence and reviewer-confirmed findings");
  await page.getByRole("button", { name: /^approve \d\.\d$/i }).click();
  await waitForBodyText(page, "Reviewer approved");
  await openDetails(page, ".capture-support");
  await waitForBodyText(page, "Ready for report");
  await page.getByRole("button", { name: /draft report/i }).click();
  await openDetails(page, ".report-edit-details");
  await page.getByRole("textbox", { name: "Buyer-facing condition report" }).waitFor();
  await page.waitForFunction(() => {
    const report = document.querySelector('textarea[aria-label="Buyer-facing condition report"]');
    return report instanceof HTMLTextAreaElement && report.value.trim().length > 0;
  });
  const reportEditor = page.getByRole("textbox", { name: "Buyer-facing condition report" });
  const reviewedText = await reportEditor.inputValue();
  await reportEditor.fill(`${reviewedText}\nUnreviewed edit for UI guard verification.`);
  if (!await page.getByRole("button", { name: /^approve$/i }).isDisabled()) fail("Unsaved report language can be approved.");
  if (!await page.getByRole("button", { name: /^finalize$/i }).isDisabled()) fail("Unsaved report language can be finalized.");
  await waitForBodyText(page, "Unsaved draft · not reviewed");
  await reportEditor.fill(reviewedText);
  await page.getByRole("button", { name: /^approve$/i }).click();
  await waitForBodyText(page, "Approved");
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
  await page.getByRole("button", { name: "View condition report" }).click();
  await page.waitForFunction(() => {
    const paper = document.querySelector(".report-paper")?.getBoundingClientRect();
    const rail = document.querySelector(".review-column")?.getBoundingClientRect();
    if (!paper || !rail || paper.top >= innerHeight || paper.bottom <= 0) return false;
    return !(paper.left < rail.right && paper.right > rail.left && paper.top < rail.bottom && paper.bottom > rail.top);
  });
  await page.setViewportSize({ width: 390, height: 844 });
  const navigationToggle = page.getByRole("button", { name: "Toggle navigation" });
  await navigationToggle.click();
  await page.getByRole("dialog", { name: "Workspace navigation" }).waitFor();
  await page.keyboard.press("Escape");
  await page.getByRole("dialog", { name: "Workspace navigation" }).waitFor({ state: "hidden" });
  if (!await navigationToggle.evaluate((element) => document.activeElement === element)) fail("Closing the navigation drawer did not restore keyboard focus.");
  if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)) fail("Phone workbench has page-level horizontal overflow.");

  const relevantConsoleIssues = consoleIssues.filter((message) =>
    !message.includes("Download the React DevTools")
  );
  if (relevantConsoleIssues.length > 0) {
    fail(`Console issues detected:\n${relevantConsoleIssues.join("\n")}`);
  }

  console.log(JSON.stringify({
    ok: true,
    flow: "create_attach_analyze_review_grade_draft_approve_finalize",
    url: page.url()
  }));
} catch (error) {
  if (process.env.E2E_FAILURE_SCREENSHOT_PATH) await page.screenshot({ path: process.env.E2E_FAILURE_SCREENSHOT_PATH });
  throw error;
} finally {
  await context.close();
  await browser.close();
}
