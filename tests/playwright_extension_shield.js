"use strict";

const { chromium } = require("playwright");
const fs = require("fs");
const http = require("http");
const os = require("os");
const path = require("path");

const EXTENSION = path.resolve("static/browser-extension/chromium");
function assert(condition, message) { if (!condition) throw new Error(message); }

async function main() {
  let adHits = 0;
  const server = http.createServer((req, res) => {
    const host = String(req.headers.host || "").split(":")[0];
    if (host === "doubleclick.net") {
      adHits += 1;
      res.writeHead(200, { "Content-Type": "image/gif", "Access-Control-Allow-Origin": "*" });
      res.end(Buffer.from("R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==", "base64"));
      return;
    }
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
    res.end(`<!doctype html><html><body><img id="ad" src="http://doubleclick.net:${server.address().port}/ad.gif"></body></html>`);
  });
  await new Promise((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
  const port = server.address().port;
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), "lumi-shield-"));
  const context = await chromium.launchPersistentContext(profile, {
    channel: "chromium", headless: true,
    args: [
      `--disable-extensions-except=${EXTENSION}`,
      `--load-extension=${EXTENSION}`,
      "--host-resolver-rules=MAP shield-fixture.test 127.0.0.1, MAP doubleclick.net 127.0.0.1",
    ],
  });
  try {
    let [worker] = context.serviceWorkers();
    if (!worker) worker = await context.waitForEvent("serviceworker", { timeout: 15000 });
    const page = await context.newPage();
    await page.goto(`http://shield-fixture.test:${port}/`, { waitUntil: "domcontentloaded", timeout: 20000 });
    await page.waitForTimeout(600);
    assert(adHits === 0, `Shield did not block curated nuisance host; hits=${adHits}`);

    const stateBefore = await worker.evaluate(async () => await handleMessage({ type: "lumi-shield-state", hostname: "shield-fixture.test" }));
    assert(stateBefore.masterEnabled === true && stateBefore.siteEnabled === true, `unexpected initial shield state ${JSON.stringify(stateBefore)}`);
    await worker.evaluate(async () => await handleMessage({ type: "lumi-shield-set-site", hostname: "shield-fixture.test", enabled: false }));

    await page.reload({ waitUntil: "domcontentloaded", timeout: 20000 });
    await page.waitForTimeout(600);
    assert(adHits > 0, "per-site Shield bypass did not allow the resource");

    const stateAfter = await worker.evaluate(async () => await handleMessage({ type: "lumi-shield-state", hostname: "shield-fixture.test" }));
    assert(stateAfter.siteEnabled === false, `site bypass state not persisted ${JSON.stringify(stateAfter)}`);
    console.log("LUMI_SHIELD_PASS", JSON.stringify({ adHits, stateBefore, stateAfter }));
  } finally {
    await context.close();
    await new Promise(resolve => server.close(resolve));
    fs.rmSync(profile, { recursive: true, force: true });
  }
}

main().catch(error => { console.error("LUMI_SHIELD_FAIL", error.stack || error); process.exitCode = 1; });
