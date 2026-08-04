"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.resolve(__dirname, "..");
const contentSource = fs.readFileSync(path.join(root, "browser-extension", "content-core.js"), "utf8");
const mediaSource = fs.readFileSync(path.join(root, "browser-extension", "media-quality-bridge.js"), "utf8");

function contentScenario(response, runtimeError = null) {
  let clickHandler = null;
  let responseCallback = null;
  let fallbackClicks = 0;
  const link = {
    href: "https://downloads.example.test/owner-proof.torrent",
    isConnected: true,
    click() { fallbackClicks += 1; },
  };
  const event = {
    target: { closest: () => link },
    prevented: false,
    stopped: false,
    preventDefault() { this.prevented = true; },
    stopImmediatePropagation() { this.stopped = true; },
  };
  const chrome = {
    runtime: {
      lastError: null,
      sendMessage(_message, callback) { responseCallback = callback; },
      onMessage: { addListener() {} },
    },
  };
  const document = {
    addEventListener(name, callback, capture) {
      if (name === "click" && capture === true) clickHandler = callback;
    },
    querySelectorAll() { return []; },
  };
  vm.runInNewContext(contentSource, {
    chrome,
    document,
    location: { href: "https://example.test/page", assign() { fallbackClicks += 1; } },
    URL,
    WeakSet,
    decodeURIComponent,
  }, { filename: "browser-extension/content-core.js" });
  assert(clickHandler, "content click interception handler registered");
  clickHandler(event);
  assert.equal(event.prevented, true, "torrent navigation must pause synchronously while Lumi stages it");
  assert.equal(event.stopped, true, "competing handlers must not race the staged handoff");
  chrome.runtime.lastError = runtimeError;
  responseCallback(response);
  return fallbackClicks;
}

assert.equal(
  contentScenario({ ok: true, result: { handoff: { id: "persisted-owner-handoff" } } }),
  0,
  "persisted Lumi handoff must retain ownership",
);
assert.equal(
  contentScenario({ ok: false, result: { error: "Lumi unavailable" } }),
  1,
  "failed Lumi staging must replay the original torrent link",
);
assert.equal(
  contentScenario(undefined, { message: "extension worker unavailable" }),
  1,
  "runtime messaging failure must replay the original torrent link",
);
console.log("Torrent click waits for persisted Lumi ownership and restores browser navigation on failure: PASS");

async function runMediaScenario({ timeoutImmediately = false } = {}) {
  let listener = null;
  let statusCalls = 0;
  const browserDownloads = [];
  const chrome = {
    storage: { local: { async get(defaults) { return defaults; } } },
    downloads: {
      async download(options) {
        browserDownloads.push(options);
        return browserDownloads.length;
      },
    },
    runtime: {
      onMessage: { addListener(callback) { listener = callback; } },
    },
  };
  const fetch = async value => {
    const url = new URL(String(value));
    if (url.pathname === "/api/settings") {
      return response(200, { default_connections: 32 });
    }
    if (url.pathname === "/api/v5/browser/capture") {
      return response(200, {
        task: { id: "media-task", status: "browser_pending" },
        handoff: { id: "media-handoff", decision: "pending" },
      });
    }
    if (url.pathname === "/api/v5/browser/handoffs/media-handoff") {
      statusCalls += 1;
      return response(503, { error: "simulated Lumi outage" });
    }
    return response(404, { error: `unexpected ${url.pathname}` });
  };
  function response(status, data) {
    return {
      ok: status >= 200 && status < 300,
      status,
      async text() { return JSON.stringify(data); },
    };
  }

  let ScenarioDate = Date;
  if (timeoutImmediately) {
    let calls = 0;
    ScenarioDate = class extends Date {
      static now() { return calls++ === 0 ? 0 : 600_001; }
    };
  }

  vm.runInNewContext(mediaSource, {
    chrome,
    fetch,
    URL,
    Date: ScenarioDate,
    JSON,
    String,
    Number,
    Boolean,
    Array,
    Math,
    encodeURIComponent,
    setTimeout(callback) { queueMicrotask(callback); return 1; },
    queueMicrotask,
  }, { filename: "browser-extension/media-quality-bridge.js" });
  assert(listener, "media bridge message listener registered");

  const staged = await new Promise(resolve => {
    const keepAlive = listener({
      type: "LUMI_MEDIA_STAGE",
      url: "https://media.example.test/owner-proof.mp4",
      filename: "owner-proof.mp4",
      format_id: "137+bestaudio/best",
    }, { tab: { url: "https://media.example.test/watch" } }, resolve);
    assert.equal(keepAlive, true);
  });
  assert.equal(staged.ok, true, "media request must be staged before monitoring starts");

  for (let index = 0; index < 30 && browserDownloads.length === 0; index += 1) {
    await new Promise(resolve => setImmediate(resolve));
  }
  assert.equal(browserDownloads.length, 1, "manual media fallback must start exactly one browser download");
  assert.equal(browserDownloads[0].url, "https://media.example.test/owner-proof.mp4");
  assert.equal(browserDownloads[0].conflictAction, "uniquify");
  return { statusCalls };
}

(async () => {
  const failure = await runMediaScenario();
  assert.equal(failure.statusCalls, 4, "four consecutive handoff failures must trigger browser fallback");
  const timeout = await runMediaScenario({ timeoutImmediately: true });
  assert.equal(timeout.statusCalls, 0, "expired handoff must fall back without another status request");
  console.log("Manual media handoff failure and timeout browser fallback: PASS");
})().catch(error => {
  console.error(error);
  process.exit(1);
});
