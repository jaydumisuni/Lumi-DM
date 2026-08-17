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

async function screenshot(page, name) {
  await page.screenshot({ path: path.join(ARTIFACTS, name), fullPage: false });
}

async function assertShell(page, label) {
  const geometry = await page.evaluate(() => ({
    html: document.documentElement.scrollHeight - document.documentElement.clientHeight,
    body: document.body.scrollHeight - document.body.clientHeight,
    viewport: [innerWidth, innerHeight],
  }));
  assert(geometry.viewport[0] === TARGET.width && geometry.viewport[1] === TARGET.height, `${label}: wrong viewport ${geometry.viewport}`);
  assert(geometry.html <= 1, `${label}: document scroll ${geometry.html}px`);
  assert(geometry.body <= 1, `${label}: body scroll ${geometry.body}px`);
}

async function assertSidebarFits(page, label) {
  const result = await page.locator(".nav-list").evaluate(nav => ({
    overflow: nav.scrollHeight - nav.clientHeight,
    top: Math.round(nav.getBoundingClientRect().top),
    bottom: Math.round(nav.getBoundingClientRect().bottom),
  }));
  assert(result.overflow <= 1, `${label}: sidebar navigation requires ${result.overflow}px of hidden scrolling`);
  return result;
}

async function assertHitAndVisible(page, selector, label) {
  const result = await page.locator(selector).evaluate(element => {
    const rect = element.getBoundingClientRect();
    const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
    return {
      hit: Boolean(hit && (hit === element || element.contains(hit))),
      left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom,
      viewportWidth: innerWidth, viewportHeight: innerHeight,
    };
  });
  assert(result.left >= 0 && result.top >= 0 && result.right <= result.viewportWidth + 1 && result.bottom <= result.viewportHeight + 1, `${label}: control is clipped (${JSON.stringify(result)})`);
  assert(result.hit, `${label}: control is not the actual hit target`);
}

async function main() {
  fs.mkdirSync(ARTIFACTS, { recursive: true });
  const browser = await chromium.launch({ headless: true, channel: "chromium" });
  try {
    const context = await browser.newContext({ viewport: TARGET, deviceScaleFactor: 1 });
    await context.addInitScript(() => {
      window.__lumiVisualActions = [];
      Object.defineProperty(window, "electronApp", {
        configurable: true,
        value: {
          isElectron: true,
          traceStage0: () => "visual-sweep",
          pickFolder: async () => "C:\\Users\\Lumi\\Downloads",
          openPath: async value => ({ ok: true, value }),
          openExternal: async value => ({ ok: true, value }),
          prepareBrowserExtension: async () => ({ ok: true, path: "C:\\Users\\Lumi\\Documents\\Lumi DM Browser Extension" }),
          getDesktopSettings: async () => ({ corner: "bottom-right", displayId: "primary", margin: 12, scale: 1, visible: true, showUpload: false, displays: [{ id: "primary", label: "Primary · 920×560" }] }),
          saveDesktopSettings: async value => ({ ...value, displays: [{ id: "primary", label: "Primary · 920×560" }] }),
          showWidget: () => window.__lumiVisualActions.push("show-widget"),
          checkForUpdates: async () => ({ available: false, message: "Visual sweep" }),
          getConnectionCapacity: async () => ({ state: "complete", result: { download_mbps: 100, upload_mbps: 40, latency_ms: 6, provider: "fixture" } }),
          runConnectionCapacityTest: async () => ({ state: "complete", result: { download_mbps: 100, upload_mbps: 40, latency_ms: 6, provider: "fixture" } }),
          windowControl: async action => { window.__lumiVisualActions.push(action); return { ok: true, maximized: action === "maximize", focused: true }; },
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

    await assertShell(page, "overview");
    const overviewContent = await page.locator("#content").evaluate(content => content.scrollHeight - content.clientHeight);
    assert(overviewContent <= 2, `overview: content requires ${overviewContent}px of scrolling`);
    await assertSidebarFits(page, "sidebar collapsed");
    await screenshot(page, "visual-01-overview.png");

    const topTargets = ["#ttg-bell", "#ttg-gear", '[data-window-action="minimize"]', '[data-window-action="maximize"]', '[data-window-action="close"]'];
    for (const selector of topTargets) await assertHitAndVisible(page, selector, selector);

    await page.click("#ttg-bell");
    await page.locator("#ttg-notification-menu").waitFor({ state: "visible" });
    await screenshot(page, "visual-02-notifications.png");
    await page.click("#ttg-bell");

    await page.click("#ttg-gear");
    await page.locator("#ttg-gear-menu").waitFor({ state: "visible" });
    await screenshot(page, "visual-03-gear.png");
    await page.click('#ttg-gear-menu [data-shell-action="settings"]');
    await page.locator("#view-settings.active").waitFor({ state: "visible" });
    await assertShell(page, "settings");
    await screenshot(page, "visual-04-settings.png");

    const views = [
      ["downloads", "visual-05-downloads.png"],
      ["unfinished", "visual-06-unfinished.png"],
      ["finished", "visual-07-finished.png"],
      ["queues", "visual-08-queues.png"],
      ["categories", "visual-09-categories.png"],
      ["grabber", "visual-10-linkgrabber.png"],
    ];
    for (const [view, file] of views) {
      await page.click(`[data-view="${view}"]`);
      await page.locator(`#view-${view}.active`).waitFor({ state: "visible" });
      await assertShell(page, view);
      await screenshot(page, file);
    }

    const technician = page.locator(".nav-group-toggle");
    await technician.click();
    await page.locator(".nav-group .nav-submenu").waitFor({ state: "visible" });
    const expandedSidebar = await assertSidebarFits(page, "sidebar technician expanded");
    for (const selector of ['[data-view="firmware"]', '[data-view="operating_systems"]']) {
      const box = await page.locator(`.nav-submenu ${selector}`).boundingBox();
      assert(box && box.y >= expandedSidebar.top && box.y + box.height <= expandedSidebar.bottom + 1, `${selector} is outside the visible sidebar`);
    }
    await screenshot(page, "visual-11-technician-menu.png");

    await page.click('[data-view="firmware"]');
    await page.locator("#view-firmware.active").waitFor({ state: "visible" });
    await page.locator("#firmware-search-form-v7").waitFor({ state: "visible", timeout: 10000 });
    const order = await page.locator("#firmware-search-form-v7 > label").evaluateAll(labels => labels.slice(0, 4).map(label => label.querySelector("select,input")?.name || ""));
    assert(JSON.stringify(order) === JSON.stringify(["brand", "device", "provider", "channel"]), `firmware order ${order.join(" -> ")}`);
    await screenshot(page, "visual-12-firmware.png");

    await page.click('[data-view="operating_systems"]');
    await page.locator("#view-operating_systems.active").waitFor({ state: "visible" });
    await page.locator("#view-operating_systems .os-catalogue-shell").waitFor({ state: "visible", timeout: 10000 });
    await screenshot(page, "visual-13-operating-systems.png");

    await page.click('[data-view="overview"]');
    await page.locator('#view-overview [data-main-open-new]').first().click();
    await page.locator("#new-modal").waitFor({ state: "visible" });
    await page.locator('#source-body form[data-source-form="direct"] button[type="submit"]').waitFor({ state: "visible" });
    await assertHitAndVisible(page, '#source-body form[data-source-form="direct"] button[type="submit"]', "Start Download");
    await assertHitAndVisible(page, '#source-body form[data-source-form="direct"] [data-close-source]', "New Download Cancel");
    await screenshot(page, "visual-14-new-download.png");
    for (const source of ["direct", "video", "torrent", "archive"]) {
      await page.click(`#source-tabs [data-source="${source}"]`);
      assert(await page.locator(`#source-tabs [data-source="${source}"]`).evaluate(element => element.classList.contains("active")), `${source} source tab did not activate`);
    }
    await page.click('[data-close-modal="new-modal"]');

    for (const action of ["minimize", "maximize", "close"]) await page.click(`[data-window-action="${action}"]`);
    const actions = await page.evaluate(() => window.__lumiVisualActions.slice());
    assert(actions.includes("minimize") && actions.includes("maximize") && actions.includes("close"), `native bridge actions missing: ${actions}`);

    console.log("LUMI_VISUAL_SWEEP_PASS", JSON.stringify({ viewport: TARGET, screenshots: 14, actions }));
  } finally {
    await browser.close();
  }
}

main().catch(error => {
  console.error("LUMI_VISUAL_SWEEP_FAIL", error.stack || error);
  process.exitCode = 1;
});
