"use strict";

const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");

const BASE = process.env.LUMI_PLAYWRIGHT_BASE || "http://127.0.0.1:7000";
const ARTIFACTS = path.resolve(process.env.LUMI_PLAYWRIGHT_ARTIFACTS || "artifacts");
const TARGET = { width: 920, height: 560 };

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function settle(page) {
  await page.waitForTimeout(260);
  await page.waitForFunction(() => !document.querySelector(".view.active.view-enter"));
}

async function capture(page, name) {
  await settle(page);
  const state = await page.locator(".view.active").evaluate(element => {
    const style = getComputedStyle(element);
    return {
      id: element.id,
      opacity: Number(style.opacity || 1),
      animation: style.animationName,
      htmlOverflow: document.documentElement.scrollHeight - document.documentElement.clientHeight,
      bodyOverflow: document.body.scrollHeight - document.body.clientHeight,
    };
  });
  assert(state.opacity >= 0.99, `${state.id} remained visually dim after settle: ${JSON.stringify(state)}`);
  assert(state.htmlOverflow <= 1 && state.bodyOverflow <= 1, `${state.id} overflowed the compact shell: ${JSON.stringify(state)}`);
  await page.screenshot({ path: path.join(ARTIFACTS, name), fullPage: false });
  return state;
}

async function main() {
  fs.mkdirSync(ARTIFACTS, { recursive: true });
  const browser = await chromium.launch({ headless: true, channel: "chromium" });
  try {
    const context = await browser.newContext({ viewport: TARGET, deviceScaleFactor: 1 });
    await context.addInitScript(() => {
      Object.defineProperty(window, "electronApp", {
        configurable: true,
        value: {
          isElectron: true,
          traceStage0: () => "settled-visual",
          pickFolder: async () => "C:\\Users\\Lumi\\Downloads",
          openPath: async () => ({ ok: true }),
          openExternal: async () => ({ ok: true }),
          prepareBrowserExtension: async () => ({ ok: true, path: "C:\\Users\\Lumi\\Documents\\Lumi DM Browser Extension" }),
          getDesktopSettings: async () => ({ corner: "bottom-right", displayId: "primary", margin: 12, scale: 1, visible: true, showUpload: false, displays: [] }),
          saveDesktopSettings: async value => value,
          showWidget: () => {},
          checkForUpdates: async () => ({ available: false }),
          getConnectionCapacity: async () => ({ state: "complete", result: { download_mbps: 100, upload_mbps: 40, latency_ms: 6, provider: "fixture" } }),
          runConnectionCapacityTest: async () => ({ state: "complete", result: { download_mbps: 100, upload_mbps: 40, latency_ms: 6, provider: "fixture" } }),
          windowControl: async () => ({ ok: true, maximized: false, focused: true }),
          getWindowState: async () => ({ maximized: false, focused: true }),
          getAppInfo: async () => ({ name: "Lumi DM", version: "source", platform: "win32", architecture: "x64", publisher: "THETECHGUY DIGITAL SOLUTIONS" }),
          onWindowState: () => () => {}, onUpdateStatus: () => () => {}, onConnectionCapacity: () => () => {}, onServerState: () => () => {},
        },
      });
    });

    const page = await context.newPage();
    await page.goto(BASE, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.locator("#app-shell").waitFor({ state: "visible", timeout: 20000 });
    await page.waitForFunction(() => document.documentElement.dataset.lumiRoadmapInteraction === "1");
    await page.waitForFunction(() => Boolean(document.querySelector('link[data-lumi-compact-desktop="1"]')));

    const results = [];
    results.push(await capture(page, "settled-01-overview.png"));

    for (const [view, name] of [
      ["downloads", "settled-02-downloads.png"],
      ["queues", "settled-03-queues.png"],
      ["categories", "settled-04-categories.png"],
      ["grabber", "settled-05-linkgrabber.png"],
    ]) {
      await page.click(`[data-view="${view}"]`);
      await page.locator(`#view-${view}.active`).waitFor({ state: "visible" });
      results.push(await capture(page, name));
    }

    await page.click(".nav-group-toggle");
    await page.locator(".nav-group .nav-submenu").waitFor({ state: "visible" });
    await page.click('[data-view="firmware"]');
    await page.locator("#view-firmware.active").waitFor({ state: "visible" });
    await page.locator("#firmware-search-form-v7").waitFor({ state: "visible", timeout: 10000 });
    results.push(await capture(page, "settled-06-firmware.png"));

    await page.click('[data-view="operating_systems"]');
    await page.locator("#view-operating_systems.active").waitFor({ state: "visible" });
    await page.locator("#view-operating_systems .os-catalogue-shell").waitFor({ state: "visible", timeout: 10000 });
    results.push(await capture(page, "settled-07-operating-systems.png"));

    await page.click('[data-view="overview"]');
    await page.locator('#view-overview [data-main-open-new]').first().click();
    await page.locator("#new-modal").waitFor({ state: "visible" });
    await page.waitForTimeout(220);
    await page.screenshot({ path: path.join(ARTIFACTS, "settled-08-new-download.png"), fullPage: false });

    console.log("LUMI_SETTLED_VIEWS_PASS", JSON.stringify({ viewport: TARGET, views: results }));
  } finally {
    await browser.close();
  }
}

main().catch(error => {
  console.error("LUMI_SETTLED_VIEWS_FAIL", error.stack || error);
  process.exitCode = 1;
});
