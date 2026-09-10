"use strict";

const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");

const BASE = process.env.LUMI_PLAYWRIGHT_BASE || "http://127.0.0.1:7000";
const CHROMIUM_EXECUTABLE = process.env.LUMI_CHROMIUM_EXECUTABLE || "";
let browser = null;

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
  throw new Error("Lumi source Runtime did not become ready");
}

async function main() {
  browser = await chromium.launch({ headless: true, ...(CHROMIUM_EXECUTABLE ? { executablePath: CHROMIUM_EXECUTABLE } : { channel: "chromium" }) });
  const context = await browser.newContext({ viewport: { width: 920, height: 560 }, deviceScaleFactor: 1 });
  await context.addInitScript(() => {
    Object.defineProperty(window, "electronApp", {
      configurable: true,
      value: {
        isElectron: true,
        traceStage0: () => "compact-brand-ui",
        pickFolder: async () => "C:\\Users\\Lumi\\Downloads",
        openPath: async () => ({ ok: true }),
        openExternal: async () => ({ ok: true }),
        prepareBrowserExtension: async () => ({ ok: true, path: "C:\\Lumi Extension" }),
        getDesktopSettings: async () => ({ corner: "bottom-right", displayId: "primary", margin: 12, scale: 1, visible: true, showUpload: false, displays: [{ id: "primary", label: "Primary" }] }),
        saveDesktopSettings: async value => value,
        showWidget: () => {},
        checkForUpdates: async () => ({ available: false, message: "Current" }),
        getConnectionCapacity: async () => ({ state: "complete", result: { download_mbps: 100, upload_mbps: 50, latency_ms: 5, provider: "fixture" } }),
        runConnectionCapacityTest: async () => ({ state: "complete", result: { download_mbps: 100, upload_mbps: 50, latency_ms: 5, provider: "fixture" } }),
        windowControl: async () => ({ ok: true, maximized: false, focused: true }),
        getWindowState: async () => ({ maximized: false, focused: true }),
        getAppInfo: async () => ({ name: "Lumi DM", version: "test", platform: "win32", architecture: "x64", publisher: "THETECHGUY DIGITAL SOLUTIONS" }),
        onWindowState: () => () => {}, onUpdateStatus: () => () => {}, onConnectionCapacity: () => () => {}, onServerState: () => () => {},
      },
    });
  });

  const page = await context.newPage();
  await waitServer(page);
  await page.goto(BASE, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.locator("#app-shell").waitFor({ state: "visible", timeout: 20000 });
  await page.waitForFunction(() => document.querySelector("#view-overview .lumi-stat"));

  const proof = await page.evaluate(() => {
    const q = selector => document.querySelector(selector);
    const rect = selector => q(selector).getBoundingClientRect();
    const style = selector => getComputedStyle(q(selector));
    const brand = q(".brand-logo");
    const statSmall = q("#view-overview .lumi-stat-copy small");
    const panel = q("#view-overview .lumi-panel");
    const sidebar = q(".sidebar");
    const app = q("#app-shell");
    return {
      viewport: [innerWidth, innerHeight],
      sidebarWidth: Math.round(rect(".sidebar").width),
      workspaceWidth: Math.round(rect(".workspace").width),
      appWidth: Math.round(app.getBoundingClientRect().width),
      htmlOverflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      bodyOverflowX: document.body.scrollWidth - document.body.clientWidth,
      contentOverflowX: q("#content").scrollWidth - q("#content").clientWidth,
      logoSrc: brand.getAttribute("src"),
      logoNatural: [brand.naturalWidth, brand.naturalHeight],
      logoDisplay: [Math.round(brand.getBoundingClientRect().width), Math.round(brand.getBoundingClientRect().height)],
      logoObjectFit: style(".brand-logo").objectFit,
      statSmallFont: parseFloat(getComputedStyle(statSmall).fontSize),
      sidebarBackdrop: style(".sidebar").backdropFilter || style(".sidebar").webkitBackdropFilter || "",
      panelBackdrop: getComputedStyle(panel).backdropFilter || getComputedStyle(panel).webkitBackdropFilter || "",
      panelBackground: getComputedStyle(panel).backgroundImage,
      panelShadow: getComputedStyle(panel).boxShadow,
    };
  });

  console.log("COMPACT_BRAND_UI_PROOF", JSON.stringify(proof));
  assert(JSON.stringify(proof.viewport) === JSON.stringify([920, 560]), `Wrong viewport ${proof.viewport}`);
  assert(proof.sidebarWidth >= 180 && proof.sidebarWidth <= 205, `Compact sidebar must be 180-205px at 920px; got ${proof.sidebarWidth}px`);
  assert(proof.workspaceWidth >= 710, `Workspace is still being crushed: ${proof.workspaceWidth}px`);
  assert(proof.htmlOverflowX <= 1 && proof.bodyOverflowX <= 1 && proof.contentOverflowX <= 2, `Horizontal overflow remains: ${JSON.stringify(proof)}`);
  assert(proof.logoSrc && proof.logoSrc.includes("favicon-512.png"), `Sidebar must use the clean 512px Lumi icon, not a poster or reduced source: ${proof.logoSrc}`);
  assert(proof.logoNatural[0] >= proof.logoDisplay[0] * 8 && proof.logoNatural[1] >= proof.logoDisplay[1] * 7, `Lumi icon is not sufficiently oversampled for clean downscaling: natural=${proof.logoNatural.join("x")} display=${proof.logoDisplay.join("x")}`);
  assert(proof.logoDisplay[0] <= 64 && proof.logoDisplay[1] <= 90, `Master logo is not being compactly downsampled: ${proof.logoDisplay.join("x")}`);
  assert(proof.logoObjectFit === "contain", `Brand logo must preserve aspect ratio; object-fit=${proof.logoObjectFit}`);
  assert(proof.statSmallFont >= 8, `Compact stat copy is still microscopic: ${proof.statSmallFont}px`);
  assert(proof.sidebarBackdrop.includes("blur"), `Sidebar is not glass: ${proof.sidebarBackdrop}`);
  assert(proof.panelBackdrop.includes("blur"), `Overview panels are not glass: ${proof.panelBackdrop}`);
  assert(proof.panelBackground.includes("gradient"), `Overview panel has no layered glass gradient: ${proof.panelBackground}`);
  assert(proof.panelShadow !== "none", "Overview panel has no depth/shadow treatment");

  const topbar = await page.evaluate(() => {
    const shell = document.getElementById("ttg-titlebar");
    const duplicate = document.querySelector(".workspace > .topbar");
    const rect = element => element?.getBoundingClientRect();
    const search = document.getElementById("global-search");
    return {
      shellVisible: Boolean(shell && getComputedStyle(shell).display !== "none" && rect(shell).height > 0),
      shellHeight: Math.round(rect(shell)?.height || 0),
      duplicateDisplay: duplicate ? getComputedStyle(duplicate).display : "missing",
      searchInShell: Boolean(search && shell?.contains(search)),
      bellInShell: Boolean(document.getElementById("ttg-bell") && shell?.contains(document.getElementById("ttg-bell"))),
      gearInShell: Boolean(document.getElementById("ttg-gear") && shell?.contains(document.getElementById("ttg-gear"))),
      windowActionsInShell: shell ? shell.querySelectorAll("[data-window-action]").length : 0,
      brandWidth: Math.round(rect(shell?.querySelector(".ttg-titlebar-brand"))?.width || 0),
      searchWidth: Math.round(rect(shell?.querySelector(".search-box"))?.width || 0),
      shellButtonWidth: Math.round(rect(shell?.querySelector(".ttg-titlebar-btn"))?.width || 0),
      contentTop: Math.round(rect(document.getElementById("content"))?.top || 0),
    };
  });
  console.log("COMPACT_BRAND_UI_TOPBAR", JSON.stringify(topbar));
  assert(topbar.shellVisible, "Approved global top bar is missing");
  assert(topbar.duplicateDisplay === "none", `Duplicate workspace top bar is still consuming height: ${JSON.stringify(topbar)}`);
  assert(topbar.searchInShell, "Search is not integrated into the approved global top bar");
  assert(topbar.bellInShell && topbar.gearInShell, "Notification/settings controls are not integrated into the approved global top bar");
  assert(topbar.windowActionsInShell === 3, `Expected 3 window controls in the approved top bar; got ${topbar.windowActionsInShell}`);
  assert(topbar.brandWidth >= 180 && topbar.brandWidth <= 205, `Top-bar brand segment does not align with compact sidebar: ${topbar.brandWidth}px`);
  assert(topbar.searchWidth >= 150 && topbar.searchWidth <= 170, `Top-bar search does not match mockup width: ${topbar.searchWidth}px`);
  assert(topbar.shellButtonWidth >= 34 && topbar.shellButtonWidth <= 38, `Top-bar shell button width does not match mockup rhythm: ${topbar.shellButtonWidth}px`);
  assert(topbar.contentTop <= topbar.shellHeight + 10, `Overview is still being pushed down by duplicate chrome: top=${topbar.contentTop}, shell=${topbar.shellHeight}`);

  await page.click("#ttg-gear");
  await page.locator("#ttg-gear-menu").waitFor({ state: "visible" });
  const gearItems = await page.locator("#ttg-gear-menu > button").allInnerTexts();
  console.log("COMPACT_BRAND_UI_GEAR", JSON.stringify(gearItems));
  assert(JSON.stringify(gearItems) === JSON.stringify(["⚙\nSettings","↯\nSpeed Test","▣\nBrowser extension","↻\nCheck for updates","?\nHelp / Report a bug","ⓘ\nAbout Lumi"]), `Gear menu does not match approved mockup: ${gearItems.join(" | ")}`);
  await page.click("#ttg-gear");

  const proportions = await page.evaluate(() => {
    const one = selector => document.querySelector(selector);
    const h = selector => Math.round(one(selector)?.getBoundingClientRect().height || 0);
    const w = selector => Math.round(one(selector)?.getBoundingClientRect().width || 0);
    const fs = selector => parseFloat(getComputedStyle(one(selector)).fontSize);
    return {
      statValueFont: fs("#view-overview .lumi-stat-copy strong"),
      sparkHeight: h("#view-overview .lumi-spark"),
      speedBarsHeight: h("#view-overview .lumi-bars"),
      donutWidth: w("#view-overview .lumi-donut"),
      quickHeight: h("#view-overview .lumi-quick"),
      storageRingWidth: w(".lumi-storage-ring"),
    };
  });
  console.log("COMPACT_BRAND_UI_PROPORTIONS", JSON.stringify(proportions));
  assert(proportions.statValueFont >= 18, `Stat values are still underscaled: ${proportions.statValueFont}px`);
  assert(proportions.sparkHeight >= 12, `Stat sparklines are still underscaled: ${proportions.sparkHeight}px`);
  assert(proportions.speedBarsHeight >= 58, `Speed graph is still underscaled inside its panel: ${proportions.speedBarsHeight}px`);
  assert(proportions.donutWidth >= 82, `Status donut is still underscaled inside its panel: ${proportions.donutWidth}px`);
  assert(proportions.quickHeight >= 46, `Quick actions are still underscaled inside their panel: ${proportions.quickHeight}px`);
  assert(proportions.storageRingWidth >= 50, `Storage ring is still underscaled: ${proportions.storageRingWidth}px`);

  const sidebarFit = await page.evaluate(() => {
    const nav = document.querySelector(".nav-list");
    const brand = document.querySelector(".brand-block");
    const footer = document.querySelector(".sidebar-footer");
    return {
      overflow: nav.scrollHeight - nav.clientHeight,
      navClient: nav.clientHeight,
      navScroll: nav.scrollHeight,
      brandHeight: Math.round(brand.getBoundingClientRect().height),
      footerHeight: Math.round(footer.getBoundingClientRect().height),
    };
  });
  console.log("COMPACT_BRAND_UI_SIDEBAR", JSON.stringify(sidebarFit));
  assert(sidebarFit.overflow <= 1, `Compact sidebar must not hide navigation behind scrolling: ${JSON.stringify(sidebarFit)}`);

  await page.click(".nav-group-toggle");
  const tech = await page.evaluate(() => {
    const group = document.querySelector(".nav-group");
    const submenu = group.querySelector(".nav-submenu");
    const items = [...submenu.querySelectorAll(".nav-item")];
    const labels = items.map(item => item.querySelector(".lumi-nav-label"));
    const boxes = items.map(item => { const r = item.getBoundingClientRect(); return {top:r.top,bottom:r.bottom,height:r.height}; });
    const labelBoxes = labels.map(label => { const r = label.getBoundingClientRect(); const s=getComputedStyle(label); return {height:r.height,whiteSpace:s.whiteSpace,fontSize:s.fontSize}; });
    const nav = document.querySelector(".nav-list");
    const footer = document.querySelector(".sidebar-footer");
    const footerTop = footer.getBoundingClientRect().top;
    const submenuBottom = submenu.getBoundingClientRect().bottom;
    return {
      open: group.classList.contains("open"),
      display: getComputedStyle(submenu).display,
      boxes, labelBoxes, footerClearance: footerTop - submenuBottom,
      navOverflow: nav.scrollHeight - nav.clientHeight,
    };
  });
  console.log("COMPACT_BRAND_UI_TECHNICIAN", JSON.stringify(tech));
  assert(tech.open && tech.display === "grid", `Technician submenu did not open in flow: ${JSON.stringify(tech)}`);
  assert(tech.boxes.length === 5, `Expected five locked Technician children: ${JSON.stringify(tech)}`);
  assert(tech.boxes.every((box, index) => index === tech.boxes.length - 1 || box.bottom <= tech.boxes[index + 1].top + 0.5), `Technician rows overlap: ${JSON.stringify(tech.boxes)}`);
  assert(tech.footerClearance >= 0, `Technician submenu overlaps storage footer: ${JSON.stringify(tech)}`);
  assert(tech.labelBoxes.every(label => label.whiteSpace === "nowrap" && label.height <= 16), `Technician labels wrap/overlap: ${JSON.stringify(tech.labelBoxes)}`);
  assert(tech.navOverflow <= 1, `Expanded Technician requires hidden sidebar scrolling: ${tech.navOverflow}px`);
  await page.click(".nav-group-toggle");

  if (process.env.LUMI_COMPACT_SCREENSHOT) {
    const screenshot = path.resolve(process.env.LUMI_COMPACT_SCREENSHOT);
    fs.mkdirSync(path.dirname(screenshot), { recursive: true });
    await page.screenshot({ path: screenshot, fullPage: false });
    console.log("COMPACT_BRAND_UI_SCREENSHOT", screenshot);
  }

  // Browser-only source review must default to the same approved dark material.
  // This is the path used for physical visual inspection before a native package exists.
  const plainContext = await browser.newContext({ viewport: { width: 920, height: 560 }, deviceScaleFactor: 1 });
  const plainPage = await plainContext.newPage();
  await plainPage.goto(BASE, { waitUntil: "domcontentloaded", timeout: 30000 });
  await plainPage.locator("#app-shell").waitFor({ state: "visible", timeout: 20000 });
  await plainPage.waitForFunction(() => {
    const panel = document.querySelector("#view-overview .lumi-panel");
    if (!panel) return false;
    const materialLoaded = [...document.styleSheets].some(sheet => String(sheet.href || "").includes("lumi-glass-material.css"));
    const style = getComputedStyle(panel);
    const backdrop = style.backdropFilter || style.webkitBackdropFilter || "";
    return materialLoaded && backdrop.includes("blur") && style.boxShadow !== "none";
  });
  const plainMaterial = await plainPage.locator("#view-overview .lumi-panel").first().evaluate(element => {
    const style = getComputedStyle(element);
    return { theme: document.documentElement.dataset.ttgTheme || "", desktopClass: document.body.classList.contains("ttg-desktop"), sidebarWidth: Math.round(document.querySelector(".sidebar").getBoundingClientRect().width), backdrop: style.backdropFilter || style.webkitBackdropFilter || "", shadow: style.boxShadow };
  });
  console.log("COMPACT_BRAND_UI_PLAIN_SOURCE", JSON.stringify(plainMaterial));
  assert(plainMaterial.desktopClass, `Browser-only source review did not enter the compact desktop shell: ${JSON.stringify(plainMaterial)}`);
  assert(plainMaterial.sidebarWidth >= 180 && plainMaterial.sidebarWidth <= 205, `Browser-only source review is not using compact sidebar geometry: ${JSON.stringify(plainMaterial)}`);
  assert(plainMaterial.backdrop.includes("blur"), `Browser-only source review is not using the approved dark glass material: ${JSON.stringify(plainMaterial)}`);
  assert(plainMaterial.shadow !== "none", `Browser-only source review has no panel depth: ${JSON.stringify(plainMaterial)}`);
  await plainContext.close();

  await browser.close();
  browser = null;
}

main().catch(async error => {
  console.error("COMPACT_BRAND_UI_FAILURE", error.stack || error);
  try { await browser?.close(); } catch (_) {}
  process.exitCode = 1;
});
