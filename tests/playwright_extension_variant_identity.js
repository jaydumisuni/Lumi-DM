"use strict";

const { chromium } = require("playwright");
const fs = require("fs");
const http = require("http");
const os = require("os");
const path = require("path");

const EXTENSION = path.resolve("static/browser-extension/chromium");
const ARTIFACTS = path.resolve(process.env.LUMI_PLAYWRIGHT_ARTIFACTS || "artifacts");
const EXPECTED = Array.from({ length: 14 }, (_, index) => 144 + index * 72).sort((a, b) => b - a).map(height => `${height}p · MP4`);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function fixtureServer() {
  return new Promise((resolve, reject) => {
    const server = http.createServer((request, response) => {
      if (request.url === "/" || request.url.startsWith("/?")) {
        const sources = Array.from({ length: 14 }, (_, index) => {
          const height = 144 + index * 72;
          return `<source src="/media/exact-${index}-${height}p.mp4" type="video/mp4">`;
        }).join("");
        response.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
        response.end(`<!doctype html><html><head><title>Exact 14 Lumi variants</title></head><body style="margin:0;background:#111;color:white"><video controls preload="none" style="width:640px;height:360px;background:#000">${sources}</video></body></html>`);
        return;
      }
      if (request.url === "/direct") {
        response.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
        response.end('<!doctype html><html><head><title>Direct Lumi source</title></head><body style="margin:0;background:#111;color:white"><video src="/media/direct-720p.mp4" controls preload="none" style="width:640px;height:360px;background:#000"></video></body></html>');
        return;
      }
      if (request.url.startsWith("/media/")) {
        response.writeHead(200, { "Content-Type": "video/mp4", "Content-Length": 1024, "Accept-Ranges": "bytes" });
        response.end(Buffer.alloc(1024, 0x4c));
        return;
      }
      response.writeHead(404);
      response.end("not found");
    });
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve(server));
  });
}

async function openPanel(page, url) {
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 20000 });
  const host = page.locator("#lumi-media-capture-host");
  await host.waitFor({ state: "attached", timeout: 12000 });
  await host.locator("button.trigger").click();
  const rows = host.locator("button.row");
  await rows.first().waitFor({ state: "visible", timeout: 20000 });
  return { host, rows };
}

async function main() {
  fs.mkdirSync(ARTIFACTS, { recursive: true });
  const fixture = await fixtureServer();
  const port = fixture.address().port;
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), "lumi-extension-identity-"));
  const context = await chromium.launchPersistentContext(profile, {
    channel: "chromium",
    headless: true,
    viewport: { width: 1100, height: 760 },
    args: [
      `--disable-extensions-except=${EXTENSION}`,
      `--load-extension=${EXTENSION}`,
      "--host-resolver-rules=MAP lumi-variant.test 127.0.0.1",
    ],
  });

  try {
    let [worker] = context.serviceWorkers();
    if (!worker) worker = await context.waitForEvent("serviceworker", { timeout: 15000 });
    const bridgeDeadline = Date.now() + 20000;
    while (Date.now() < bridgeDeadline) {
      const state = await worker.evaluate(async () => await new Promise(resolve => chrome.storage.local.get(["lumiBridgeState"], resolve)));
      if (state.lumiBridgeState === "connected") break;
      await new Promise(resolve => setTimeout(resolve, 200));
    }

    const page = await context.newPage();
    const explicit = await openPanel(page, `http://lumi-variant.test:${port}/`);
    const titles = await explicit.rows.locator("strong").allInnerTexts();
    console.log("LUMI_EXTENSION_VARIANT_TITLES", JSON.stringify(titles));
    await page.screenshot({ path: path.join(ARTIFACTS, "lumi-extension-variant-identity.png"), fullPage: false });

    assert(titles.length === 14, `14 unique browser sources rendered ${titles.length} rows: ${JSON.stringify(titles)}`);
    assert(JSON.stringify(titles) === JSON.stringify(EXPECTED), `Variant identity/order drifted: expected=${JSON.stringify(EXPECTED)} actual=${JSON.stringify(titles)}`);

    const direct = await openPanel(page, `http://lumi-variant.test:${port}/direct`);
    const directTitles = await direct.rows.locator("strong").allInnerTexts();
    console.log("LUMI_EXTENSION_DIRECT_SRC_TITLES", JSON.stringify(directTitles));
    await page.screenshot({ path: path.join(ARTIFACTS, "lumi-extension-direct-src.png"), fullPage: false });
    assert(directTitles.length === 1, `Direct video src must remain one candidate, got ${directTitles.length}: ${JSON.stringify(directTitles)}`);
    assert(directTitles[0] === "720p · MP4", `Direct video src metadata drifted: ${JSON.stringify(directTitles)}`);

    console.log("LUMI_EXTENSION_VARIANT_IDENTITY_PASS", JSON.stringify({ explicitCount: titles.length, directCount: directTitles.length, titles, directTitles }));
  } finally {
    await context.close();
    await new Promise(resolve => fixture.close(resolve));
    fs.rmSync(profile, { recursive: true, force: true });
  }
}

main().catch(error => {
  console.error("LUMI_EXTENSION_VARIANT_IDENTITY_FAIL", error.stack || error);
  process.exitCode = 1;
});
