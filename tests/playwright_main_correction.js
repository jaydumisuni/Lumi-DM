"use strict";

const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");

const BASE = process.env.LUMI_PLAYWRIGHT_BASE || "http://127.0.0.1:7000";
const ARTIFACTS = path.resolve(process.env.LUMI_PLAYWRIGHT_ARTIFACTS || "artifacts");
let activeBrowser = null;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function waitServer(page) {
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    try {
      const response = await page.request.get(BASE, { timeout: 1200 });
      if (response.status() === 200) return;
    } catch (_) {}
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  throw new Error("Lumi test Runtime did not become ready");
}

async function main() {
  fs.mkdirSync(ARTIFACTS, { recursive: true });
  const browser = activeBrowser = await chromium.launch({ headless: true, channel: "chromium" });
  const context = await browser.newContext({ viewport: { width: 920, height: 650 }, deviceScaleFactor: 1 });

  await context.addInitScript(() => {
    window.__lumiWindowActions = [];
    Object.defineProperty(window, "electronApp", {
      configurable: true,
      value: {
        isElectron: true,
        traceStage0: value => {
          window.__lumiStage0 = window.__lumiStage0 || [];
          window.__lumiStage0.push(value || {});
          return "playwright-trace";
        },
        pickFolder: async () => "C:\\Users\\Lumi\\Downloads",
        openPath: async () => ({ ok: true }),
        openExternal: async () => ({ ok: true }),
        prepareBrowserExtension: async () => ({ ok: true, path: "C:\\Users\\Lumi\\Documents\\Lumi DM Browser Extension" }),
        getDesktopSettings: async () => ({ corner: "bottom-right", displayId: "primary", margin: 12, scale: 1, visible: true, showUpload: false, displays: [{ id: "primary", label: "Primary · 920×650" }] }),
        saveDesktopSettings: async value => ({ ...value, displays: [{ id: "primary", label: "Primary · 920×650" }] }),
        showWidget: () => {},
        checkForUpdates: async () => ({ available: false, message: "Test build is current" }),
        getConnectionCapacity: async () => ({ state: "complete", result: { download_mbps: 100, upload_mbps: 50, latency_ms: 5, provider: "fixture" } }),
        runConnectionCapacityTest: async () => ({ state: "complete", result: { download_mbps: 100, upload_mbps: 50, latency_ms: 5, provider: "fixture" } }),
        windowControl: async action => {
          window.__lumiWindowActions.push(action);
          return { ok: true, maximized: action === "maximize", focused: true };
        },
        getWindowState: async () => ({ maximized: false, focused: true }),
        getAppInfo: async () => ({ name: "Lumi DM", version: "test", platform: "win32", architecture: "x64", publisher: "THETECHGUY DIGITAL SOLUTIONS" }),
        onWindowState: () => () => {}, onUpdateStatus: () => () => {}, onConnectionCapacity: () => () => {}, onServerState: () => () => {},
      },
    });
  });

  const page = await context.newPage();
  await waitServer(page);
  await page.route("**/api/v5/firmware/catalogue", route => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ warning: "Verify the exact model before flashing.", brands: ["Samsung", "Apple", "Google Pixel"], providers: [{ id: "samsung", name: "Samsung Support", group: "Official OS", brands: ["Samsung"] }, { id: "android", name: "AndroidFileHost", group: "Community mirrors", brands: ["Android"] }] }) }));
  await page.route(/\/api\/v5\/firmware\/devices\?/, route => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ devices: [{ id: "SM-S918B", name: "Galaxy S23 Ultra", model: "SM-S918B", codename: "dm3q", provider: "samsung", brand: "Samsung" }, { id: "SM-S918U", name: "Galaxy S23 Ultra US", model: "SM-S918U", codename: "dm3q", provider: "samsung", brand: "Samsung" }] }) }));
  await page.route(/\/api\/v5\/firmware\/search\?/, route => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ results: [] }) }));

  await page.goto(BASE, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.locator("#app-shell").waitFor({ state: "visible", timeout: 20000 });
  await page.locator("#ttg-gear").waitFor({ state: "visible", timeout: 10000 });
  await page.waitForFunction(() => document.documentElement.dataset.lumiRoadmapInteraction === "1");

  const viewport = page.viewportSize();
  assert(viewport.width === 920 && viewport.height === 650, `Wrong proof viewport: ${viewport.width}x${viewport.height}`);
  const geometry = await page.evaluate(() => {
    const content = document.getElementById("content");
    const overview = document.getElementById("view-overview");
    return { htmlScroll: document.documentElement.scrollHeight - document.documentElement.clientHeight, bodyScroll: document.body.scrollHeight - document.body.clientHeight, contentScroll: content.scrollHeight - content.clientHeight, contentOverflowY: getComputedStyle(content).overflowY, overviewBottom: Math.round(overview.getBoundingClientRect().bottom), contentBottom: Math.round(content.getBoundingClientRect().bottom) };
  });
  console.log("PLAYWRIGHT_OVERVIEW_GEOMETRY", JSON.stringify(geometry));
  assert(geometry.htmlScroll <= 1, `HTML page scrolls by ${geometry.htmlScroll}px`);
  assert(geometry.bodyScroll <= 1, `Body scrolls by ${geometry.bodyScroll}px`);
  assert(geometry.contentScroll <= 2, `Overview requires a page scrollbar by ${geometry.contentScroll}px`);

  for (const selector of ["#ttg-bell", "#ttg-gear", '[data-window-action="minimize"]', '[data-window-action="maximize"]', '[data-window-action="close"]']) {
    const result = await page.locator(selector).evaluate(element => {
      const rect = element.getBoundingClientRect();
      const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
      return { hit: Boolean(hit && (hit === element || element.contains(hit))), pointer: getComputedStyle(element).pointerEvents };
    });
    assert(result.hit, `${selector} is not the physical hit target at its center`);
    assert(result.pointer !== "none", `${selector} has pointer-events:none`);
  }

  await page.click("#ttg-gear");
  await page.locator("#ttg-gear-menu").waitFor({ state: "visible" });
  assert(await page.locator('[data-main-shell-action="extension"]').isVisible(), "Bundled Browser Extension action is missing");
  await page.click('[data-main-shell-action="extension"]');
  await page.locator("#ttg-shell-modal").waitFor({ state: "visible" });
  const extensionCopy = await page.locator("#ttg-shell-modal-body").innerText();
  assert(extensionCopy.includes("extension folder is ready"), "Extension action did not invoke the bundled package owner");
  assert(extensionCopy.includes("No Lumi pairing code is required"), "Same-PC extension still presents a pairing ceremony");
  await page.click("#ttg-shell-modal .ttg-shell-modal-close");

  await page.click("#ttg-bell"); await page.locator("#ttg-notification-menu").waitFor({ state: "visible" }); await page.click("#ttg-bell");
  for (const action of ["minimize", "maximize", "close"]) await page.click(`[data-window-action="${action}"]`);
  const actions = await page.evaluate(() => window.__lumiWindowActions.slice());
  assert(actions.includes("minimize") && actions.includes("maximize") && actions.includes("close"), `Window controls did not reach Electron bridge: ${actions.join(",")}`);

  await page.click("#ttg-gear"); await page.click('#ttg-gear-menu [data-shell-action="settings"]');
  await page.locator("#view-settings.active").waitFor({ state: "visible" });
  const connectionSelect = page.locator('select[name="default_connections"]');
  await connectionSelect.waitFor({ state: "visible" });
  assert(await connectionSelect.inputValue() === "32", "Settings do not expose the canonical 32-connection policy");
  assert(await connectionSelect.locator("option").count() === 1, "Settings still allow silent HTTP connection downgrade");

  await page.click(".nav-group-toggle"); await page.click('[data-view="firmware"]');
  await page.locator("#firmware-search-form-v7").waitFor({ state: "visible", timeout: 10000 });
  const firmwareOrder = await page.locator("#firmware-search-form-v7 > label").evaluateAll(labels => labels.slice(0, 4).map(label => label.querySelector("select,input")?.name || ""));
  console.log("PLAYWRIGHT_FIRMWARE_ORDER", JSON.stringify(firmwareOrder));
  assert(JSON.stringify(firmwareOrder) === JSON.stringify(["brand", "device", "provider", "channel"]), `Firmware dependency order is wrong: ${firmwareOrder.join(" -> ")}`);
  const model = page.locator("#lumi-firmware-model"); const source = page.locator("#lumi-firmware-source");
  assert(await model.isDisabled(), "Model is selectable before Brand"); assert(await source.isDisabled(), "Source is selectable before Model");
  await page.selectOption("#lumi-firmware-brand", "Samsung"); await page.waitForFunction(() => !document.getElementById("lumi-firmware-model").disabled);
  await model.fill("SM-S918B"); await page.waitForFunction(() => !document.getElementById("lumi-firmware-source").disabled);
  const sourceOptions = await source.locator("option").allInnerTexts();
  assert(sourceOptions.some(value => value.includes("Samsung Support")), `Model did not resolve a valid source: ${sourceOptions.join(" | ")}`);

  await page.click('[data-view="overview"]'); await page.locator("#view-overview.active").waitFor({ state: "visible" });
  await page.click("#new-download-btn"); await page.locator("#new-modal").waitFor({ state: "visible" });
  await page.click('#source-tabs [data-source="video"]');
  assert(await page.locator('#source-tabs [data-source="video"]').evaluate(element => element.classList.contains("active")), "New Download source tabs do not respond");
  await page.click('[data-close-modal="new-modal"]');

  await page.screenshot({ path: path.join(ARTIFACTS, "lumi-main-920x650.png"), fullPage: false });
  const finalState = await page.evaluate(() => ({ interactionControls: document.documentElement.dataset.lumiInteractionControls, interactionBlocked: document.documentElement.dataset.lumiInteractionBlocked, stage0Events: (window.__lumiStage0 || []).length }));
  console.log("PLAYWRIGHT_MAIN_RESULT", JSON.stringify({ geometry, actions, finalState }));
  assert(Number(finalState.interactionBlocked || 0) === 0, `Visible controls remain pointer-blocked: ${finalState.interactionBlocked}`);
  await browser.close();
  activeBrowser = null;
}

main().catch(async error => {
  console.error("PLAYWRIGHT_MAIN_FAILURE", error.stack || error);
  try { await activeBrowser?.close(); } catch (_) {}
  activeBrowser = null;
  process.exitCode = 1;
});