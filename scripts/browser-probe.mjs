import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { chromium } from "playwright";

function parseArgs(argv) {
  const args = new Map();

  for (let index = 0; index < argv.length; index += 1) {
    const part = argv[index];
    if (!part.startsWith("--")) {
      continue;
    }

    const key = part.slice(2);
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) {
      throw new Error(`Missing value for --${key}`);
    }
    args.set(key, value);
    index += 1;
  }

  return args;
}

function normalizeValue(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeBuildId(value) {
  return normalizeValue(value).toLowerCase();
}

function hasKnownValue(value) {
  const normalized = normalizeValue(value).toLowerCase();
  return normalized.length > 0 && normalized !== "unknown" && normalized !== "n/a";
}

function sameOrigin(candidate, origin) {
  try {
    return new URL(candidate).origin === origin;
  } catch {
    return false;
  }
}

function samePath(candidate, pathname) {
  try {
    return new URL(candidate).pathname === pathname;
  } catch {
    return false;
  }
}

async function ensureParent(path) {
  await mkdir(dirname(path), { recursive: true });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const url = args.get("url");
  const expectedCommitSha = normalizeBuildId(args.get("expected-commit-sha"));
  const username = args.get("username") ?? "";
  const password = args.get("password") ?? "";
  const reportPath = args.get("report");
  const screenshotPath = args.get("screenshot");

  if (!url || !expectedCommitSha || !reportPath || !screenshotPath) {
    throw new Error(
      "Usage: node browser-probe.mjs --url <url> --expected-commit-sha <sha> --report <path> --screenshot <path> [--username <user> --password <pass>]",
    );
  }

  const origin = new URL(url).origin;
  const incidents = [];
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext(
    username || password ? { httpCredentials: { username, password } } : {},
  );
  const page = await context.newPage();

  page.on("console", (message) => {
    if (message.type() !== "error") {
      return;
    }

    incidents.push({
      type: "console.error",
      text: message.text(),
      location: message.location(),
    });
  });

  page.on("pageerror", (error) => {
    incidents.push({
      type: "pageerror",
      text: error.message,
      stack: error.stack,
    });
  });

  page.on("requestfailed", (request) => {
    if (!sameOrigin(request.url(), origin)) {
      return;
    }

    incidents.push({
      type: "requestfailed",
      method: request.method(),
      url: request.url(),
      errorText: request.failure()?.errorText ?? "unknown",
    });
  });

  page.on("response", (response) => {
    if (!sameOrigin(response.url(), origin) || response.status() < 400) {
      return;
    }

    incidents.push({
      type: "response",
      method: response.request().method(),
      status: response.status(),
      url: response.url(),
    });
  });

  const stateBootstrapResponse = page.waitForResponse(
    (response) =>
      sameOrigin(response.url(), origin) &&
      samePath(response.url(), "/api/state") &&
      response.request().method() === "GET",
    { timeout: 15000 },
  );
  const delayedManifestResponse = page.waitForResponse(
    (response) =>
      sameOrigin(response.url(), origin) &&
      samePath(response.url(), "/version.json") &&
      response.request().method() === "GET",
    { timeout: 15000 },
  );

  const navigation = await page.goto(url, {
    waitUntil: "domcontentloaded",
    timeout: 30000,
  });

  if (!navigation || !navigation.ok()) {
    incidents.push({
      type: "navigation",
      status: navigation?.status() ?? null,
      url,
      detail: "initial page load failed",
    });
  }

  try {
    await page.waitForLoadState("networkidle", { timeout: 10000 });
  } catch (error) {
    incidents.push({
      type: "load",
      detail: "networkidle timeout",
      message: String(error),
    });
  }

  try {
    await stateBootstrapResponse;
  } catch (error) {
    incidents.push({
      type: "response-timeout",
      detail: "GET /api/state was not observed on initial load",
      message: String(error),
    });
  }

  try {
    await delayedManifestResponse;
  } catch (error) {
    incidents.push({
      type: "response-timeout",
      detail: "Delayed GET /version.json was not observed",
      message: String(error),
    });
  }

  const manifestCheck = await page.evaluate(async () => {
    const response = await window.fetch("/version.json", {
      cache: "no-store",
      headers: { Accept: "application/json" },
    });
    let payload = null;
    try {
      payload = await response.json();
    } catch {
      payload = null;
    }
    return {
      ok: response.ok,
      status: response.status,
      payload,
    };
  });

  if (!manifestCheck.ok) {
    incidents.push({
      type: "manifest-fetch",
      status: manifestCheck.status,
      detail: "Manual manifest verification failed",
    });
  }

  const pageBuild = normalizeBuildId(await page.getAttribute("body", "data-app-commit-sha"));
  const pageVersion = normalizeValue(await page.getAttribute("body", "data-app-version"));
  const manifestBuild = normalizeBuildId(manifestCheck.payload?.commitSha);
  const manifestVersion = normalizeValue(manifestCheck.payload?.version);

  if (!hasKnownValue(pageBuild)) {
    incidents.push({
      type: "build-identity",
      detail: "Page build identity is missing or placeholder",
      value: pageBuild,
    });
  }

  if (!hasKnownValue(manifestBuild)) {
    incidents.push({
      type: "build-identity",
      detail: "Manifest build identity is missing or placeholder",
      value: manifestBuild,
    });
  }

  if (pageBuild !== expectedCommitSha) {
    incidents.push({
      type: "build-mismatch",
      detail: "Page build identity does not match the deploy SHA",
      expectedCommitSha,
      observedCommitSha: pageBuild,
    });
  }

  if (manifestBuild !== expectedCommitSha) {
    incidents.push({
      type: "build-mismatch",
      detail: "Manifest build identity does not match the deploy SHA",
      expectedCommitSha,
      observedCommitSha: manifestBuild,
    });
  }

  if (pageBuild !== manifestBuild) {
    incidents.push({
      type: "build-mismatch",
      detail: "Page and manifest build identities diverge",
      pageCommitSha: pageBuild,
      manifestCommitSha: manifestBuild,
    });
  }

  if (!(await page.locator("#update-banner").isHidden())) {
    incidents.push({
      type: "unexpected-banner",
      detail: "Freshly loaded page should not show the update banner",
    });
  }

  await page.keyboard.press("ArrowRight");
  await page.waitForTimeout(350);
  await page.getByRole("button", { name: "Restart" }).click();
  await page.waitForTimeout(350);

  await ensureParent(screenshotPath);
  await page.screenshot({ path: screenshotPath, fullPage: true });
  await browser.close();

  const report = {
    checkedAt: new Date().toISOString(),
    url,
    expectedCommitSha,
    pageCommitSha: pageBuild,
    pageVersion,
    manifest: manifestCheck.payload,
    manifestVersion,
    manifestCommitSha: manifestBuild,
    incidents,
  };

  await ensureParent(reportPath);
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);

  if (incidents.length > 0) {
    process.exit(1);
  }
}

main().catch(async (error) => {
  const args = parseArgs(process.argv.slice(2));
  const reportPath = args.get("report");
  if (reportPath) {
    await ensureParent(reportPath);
    await writeFile(
      reportPath,
      `${JSON.stringify(
        {
          checkedAt: new Date().toISOString(),
          fatal: true,
          message: String(error),
          stack: error?.stack ?? null,
        },
        null,
        2,
      )}\n`,
    );
  }
  console.error(error);
  process.exit(1);
});
