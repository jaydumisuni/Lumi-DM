"use strict";

const { chromium } = require("playwright");
const fs = require("fs");
const http = require("http");
const path = require("path");

function assert(condition, message) { if (!condition) throw new Error(message); }

async function fixtureServer() {
  return await new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      if (req.url === "/" || req.url.startsWith("/?")) {
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
        res.end(`<!doctype html><html><head><title>Lumi ready fixture</title></head><body style="margin:0;background:#111;color:white">
          <video id="player" controls preload="none" style="width:800px;height:450px;background:#000"><source src="/media/master.mp4" type="video/mp4"></video>
        </body></html>`);
        return;
      }
      if (req.url.startsWith("/media/")) {
        res.writeHead(200, { "Content-Type": "video/mp4", "Content-Length": 1024, "Accept-Ranges": "bytes" });
        res.end(Buffer.alloc(1024, 0x4c));
        return;
      }
      res.writeHead(404); res.end("missing");
    });
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve(server));
  });
}

async function main() {
  const server = await fixtureServer();
  const port = server.address().port;
  const browser = await chromium.launch({ channel: "chromium", headless: true, args: ["--host-resolver-rules=MAP lumi-ready.test 127.0.0.1"] });
  const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
  try {
    await page.goto(`http://lumi-ready.test:${port}/`, { waitUntil: "domcontentloaded", timeout: 20000 });
    await page.evaluate(() => {
      window.__discoverCount = 0;
      window.__chromeMessageListener = null;
      Object.assign(window.chrome, {
          runtime: {
            lastError: null,
            getURL: name => `data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' width='32' height='32'></svg>#${name}`,
            sendMessage(message, callback) {
              if (message.type === "lumi-media-discover") {
                window.__discoverCount += 1;
                const variants = Array.from({ length: 14 }, (_, index) => ({
                  kind: "direct", url: `${location.origin}/media/v${index}.mp4`,
                  height: 144 + index * 72, fps: index % 2 ? 60 : 30,
                  container: "mp4", label: `${144 + index * 72}p`,
                }));
                setTimeout(() => callback({ ok: true, media: { state: "variants_found", variants, subtitles: [] } }), 900);
                return;
              }
              if (message.type === "lumi-extension-status") return callback({ ok: true, status: { available: true } });
              if (message.type === "lumi-media-stage") return callback({ ok: true, handoff: { id: "fixture" } });
              callback({ ok: true });
            },
            onMessage: { addListener(listener) { window.__chromeMessageListener = listener; } },
          },
          storage: {
            local: { get(_keys, callback) { callback({ lumiEnabled: true }); } },
            onChanged: { addListener() {} },
          },
      });
    });
    await page.addScriptTag({ path: path.resolve("browser-extension/content-v2.js") });

    await page.waitForTimeout(500);
    assert(await page.locator("#lumi-media-capture-host").count() === 0, "mark appeared before variants resolved");

    const host = page.locator("#lumi-media-capture-host");
    await host.waitFor({ state: "attached", timeout: 4000 });
    const trigger = host.locator("button.trigger");
    const mode1 = await trigger.getAttribute("data-mode");
    assert(mode1 === "full-intro", `expected full-intro after readiness, got ${mode1}`);
    assert(await page.evaluate(() => window.__discoverCount) === 1, "readiness resolver should run once");

    await page.waitForTimeout(5200);
    const compact = await trigger.getAttribute("data-mode");
    assert(compact === "compact-mark", `expected compact mark after intro, got ${compact}`);

    await page.locator("#player").hover();
    await page.waitForTimeout(150);
    assert(await trigger.getAttribute("data-mode") === "compact-mark", "video hover restored full pill");

    await trigger.hover();
    assert(await trigger.getAttribute("data-mode") === "full-hover", "direct mark hover did not restore full pill");
    await page.mouse.move(1100, 760);
    await page.waitForTimeout(100);
    assert(await trigger.getAttribute("data-mode") === "compact-mark", "leaving mark did not collapse it");

    await trigger.focus();
    assert(await trigger.getAttribute("data-mode") === "full-focus", "keyboard focus did not restore full pill");
    await trigger.click();
    const rows = host.locator("button.row");
    await rows.first().waitFor({ state: "visible", timeout: 1500 });
    assert(await rows.count() === 14, `expected 14 uncapped qualities, got ${await rows.count()}`);
    assert(await page.evaluate(() => window.__discoverCount) === 1, "opening cached panel re-ran resolver");

    console.log("LUMI_VIDEO_MARK_LIFECYCLE_PASS", JSON.stringify({ variants: await rows.count() }));
  } finally {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
}

main().catch(error => { console.error("LUMI_VIDEO_MARK_LIFECYCLE_FAIL", error.stack || error); process.exitCode = 1; });
