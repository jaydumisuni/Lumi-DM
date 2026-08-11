import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const { resolveCanonicalExtension } = require("../electron/browser-extension-source.js");

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
// Use the same pure resolver called by the packaged Electron preparation path.
const extensionPath = resolveCanonicalExtension({
  appPath: root,
  resourcesPath: path.join(root, "unused-resources"),
  isPackaged: true,
});
assert.equal(extensionPath, path.join(root, "browser-extension"));
assert.equal(fs.existsSync(path.join(root, "static", "browser-extension", "chromium")), false,
  "a second static Chromium extension must not exist");

const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "lumi-extension-runtime-"));
const TOKEN = "owner-runtime-extension-token";
const payload = Buffer.alloc(4 * 1024 * 1024, 0x4c);
const state = {
  localAuthCalls: 0,
  captures: [],
  statusCalls: new Map(),
  handoffs: new Map(),
  failStatus: new Set(),
  mediaInfoCalls: 0,
};

function json(response, status, value, origin = "*") {
  const body = Buffer.from(JSON.stringify(value));
  response.writeHead(status, {
    "Content-Type": "application/json",
    "Content-Length": body.length,
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Headers": "Authorization, Content-Type, X-Lumi-Client",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    Vary: "Origin",
  });
  response.end(body);
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    request.on("data", chunk => chunks.push(chunk));
    request.on("end", () => {
      try { resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : {}); }
      catch (error) { reject(error); }
    });
    request.on("error", reject);
  });
}

function authorized(request) {
  return request.headers.authorization === `Bearer ${TOKEN}`;
}

const server = http.createServer(async (request, response) => {
  const origin = String(request.headers.origin || "*");
  const url = new URL(request.url || "/", "http://localhost:7000");
  if (request.method === "OPTIONS") {
    response.writeHead(204, {
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Headers": "Authorization, Content-Type, X-Lumi-Client",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      Vary: "Origin",
    });
    response.end();
    return;
  }

  if (url.pathname === "/api/security/local-extension" && request.method === "POST") {
    const data = await readBody(request);
    assert.match(String(data.client_id || ""), /^.{24,160}$/);
    state.localAuthCalls += 1;
    json(response, 200, { token: TOKEN, token_id: "local-owner", role: "owner", same_pc: true }, origin);
    return;
  }

  if (url.pathname.startsWith("/api/") && !authorized(request)) {
    json(response, 401, { error: "missing extension token" }, origin);
    return;
  }

  if (url.pathname === "/api/downloads") {
    json(response, 200, { downloads: [] }, origin);
    return;
  }
  if (url.pathname === "/api/settings") {
    json(response, 200, {
      default_dir: path.join(os.tmpdir(), "lumi-extension-downloads"),
      temp_dir: path.join(os.tmpdir(), "lumi-extension-temp"),
      default_connections: 32,
    }, origin);
    return;
  }
  if (url.pathname === "/api/browser/repair-pending") {
    json(response, 200, { pending: null }, origin);
    return;
  }
  if (url.pathname === "/api/browser/intercept-mode") {
    json(response, 200, { mode: "auto" }, origin);
    return;
  }
  if (url.pathname === "/api/v3/media/info") {
    state.mediaInfoCalls += 1;
    json(response, 200, {
      title: "Owner quality proof",
      webpage_url: url.searchParams.get("url"),
      formats: [
        { format_id: "137", ext: "mp4", height: 1080, fps: 30, filesize: 320000000, vcodec: "avc1", acodec: "none", tbr: 4500 },
        { format_id: "22", ext: "mp4", height: 720, fps: 30, filesize: 180000000, vcodec: "avc1", acodec: "mp4a", tbr: 2500 },
        { format_id: "140", ext: "m4a", height: 0, fps: 0, filesize: 11000000, vcodec: "none", acodec: "mp4a", abr: 128 },
      ],
      subtitles: { en: [{ ext: "vtt", source: "subtitles" }] },
    }, origin);
    return;
  }
  if (url.pathname === "/api/v5/browser/capture" && request.method === "POST") {
    const data = await readBody(request);
    const handoffId = `handoff-${state.captures.length + 1}`;
    const taskId = `task-${state.captures.length + 1}`;
    state.captures.push({ data, handoffId, taskId, authorization: request.headers.authorization });
    state.handoffs.set(handoffId, "pending");
    json(response, 200, {
      task: { id: taskId, filename: data.filename || "download.iso", status: "browser_pending" },
      handoff: { id: handoffId, task_id: taskId, decision: "pending" },
    }, origin);
    return;
  }

  const statusMatch = url.pathname.match(/^\/api\/v5\/browser\/handoffs\/([^/]+)$/);
  if (statusMatch && request.method === "GET") {
    const handoffId = decodeURIComponent(statusMatch[1]);
    state.statusCalls.set(handoffId, (state.statusCalls.get(handoffId) || 0) + 1);
    if (state.failStatus.has(handoffId)) {
      json(response, 503, { error: "simulated Lumi outage" }, origin);
      return;
    }
    const decision = state.handoffs.get(handoffId) || "pending";
    json(response, 200, {
      id: handoffId,
      decision,
      task: { id: handoffId.replace("handoff", "task"), filename: "owner-proof.iso" },
    }, origin);
    return;
  }

  if (url.pathname.startsWith("/api/v5/browser/handoffs/") && request.method === "POST") {
    json(response, 200, { ok: true }, origin);
    return;
  }
  if (url.pathname === "/api/host-profiles" && request.method === "POST") {
    json(response, 200, { ok: true }, origin);
    return;
  }

  if (url.pathname.startsWith("/download/")) {
    response.writeHead(200, {
      "Content-Type": "application/octet-stream",
      "Content-Disposition": `attachment; filename="${path.basename(url.pathname)}"`,
      "Content-Length": payload.length,
      "Accept-Ranges": "bytes",
    });
    let offset = 0;
    const timer = setInterval(() => {
      if (response.destroyed) {
        clearInterval(timer);
        return;
      }
      const end = Math.min(payload.length, offset + 64 * 1024);
      response.write(payload.subarray(offset, end));
      offset = end;
      if (offset >= payload.length) {
        clearInterval(timer);
        response.end();
      }
    }, 25);
    return;
  }

  json(response, 404, { error: `unhandled ${request.method} ${url.pathname}` }, origin);
});

await new Promise((resolve, reject) => {
  server.once("error", reject);
  server.listen(7000, "127.0.0.1", resolve);
});

async function waitFor(predicate, message, timeout = 20_000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const value = await predicate();
    if (value) return value;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error(message);
}

async function extensionWorker(context, timeout = 30_000) {
  const ready = async worker => {
    if (!worker || !worker.url().startsWith("chrome-extension://")) return false;
    try {
      return await worker.evaluate(() => (
        typeof globalThis.chrome === "object"
        && typeof globalThis.chrome?.runtime?.getManifest === "function"
        && typeof globalThis.chrome?.downloads?.search === "function"
      ));
    } catch (_) {
      return false;
    }
  };

  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    for (const candidate of context.serviceWorkers()) {
      if (await ready(candidate)) return candidate;
    }
    const remaining = deadline - Date.now();
    if (remaining <= 0) break;
    try {
      const candidate = await context.waitForEvent("serviceworker", { timeout: Math.min(1000, remaining) });
      if (await ready(candidate)) return candidate;
    } catch (_) {
      // Keep polling: MV3 workers may be replaced while Chromium starts the extension.
    }
  }
  throw new Error("canonical Chromium extension service worker did not expose runtime/download APIs");
}

async function downloads(worker) {
  return worker.evaluate(() => new Promise(resolve => chrome.downloads.search({}, resolve)));
}

async function startDownload(worker, filename) {
  return worker.evaluate(({ url, filename: target }) => new Promise((resolve, reject) => {
    chrome.downloads.download({ url, filename: target, conflictAction: "overwrite" }, id => {
      if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
      else resolve(id);
    });
  }), { url: `http://localhost:7000/download/${filename}`, filename });
}

let context;
try {
  context = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    acceptDownloads: true,
    args: [
      `--disable-extensions-except=${extensionPath}`,
      `--load-extension=${extensionPath}`,
      "--no-sandbox",
      "--disable-dev-shm-usage",
    ],
  });

  const worker = await extensionWorker(context);
  const extensionId = new URL(worker.url()).host;
  assert.ok(extensionId, "canonical Chromium extension service worker loaded");
  const manifest = await worker.evaluate(() => chrome.runtime.getManifest());
  assert.equal(manifest.name, "Lumi Download Manager");
  assert.equal(manifest.version, "5.1.0");
  assert.deepEqual(manifest.content_scripts[0].js, ["content-core.js", "media-quality-picker.js", "content-safety.js"]);

  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${extensionId}/popup.html`);
  await waitFor(() => state.localAuthCalls > 0, "same-PC extension did not authenticate automatically");

  // Browser ownership remains paused until Lumi confirms takeover.
  const confirmedId = await startDownload(worker, "owner-confirmed.iso");
  const confirmedCapture = await waitFor(
    () => state.captures.find(item => item.data.url.includes("owner-confirmed.iso")),
    "canonical extension did not capture the browser download",
  );
  assert.equal(confirmedCapture.authorization, `Bearer ${TOKEN}`);
  const paused = await waitFor(async () => {
    const item = (await downloads(worker)).find(entry => entry.id === confirmedId);
    return item?.paused ? item : null;
  }, "browser download was not paused while waiting for Lumi");
  assert.equal(paused.state, "in_progress");
  state.handoffs.set(confirmedCapture.handoffId, "lumi");
  await waitFor(async () => !(await downloads(worker)).some(entry => entry.id === confirmedId),
    "browser copy was not cancelled after Lumi confirmation");

  // Lumi failure resumes the exact original browser download.
  const fallbackId = await startDownload(worker, "owner-fallback.iso");
  const fallbackCapture = await waitFor(
    () => state.captures.find(item => item.data.url.includes("owner-fallback.iso")),
    "fallback download was not captured",
  );
  await waitFor(async () => (await downloads(worker)).find(entry => entry.id === fallbackId)?.paused,
    "fallback download was not paused first");
  state.failStatus.add(fallbackCapture.handoffId);
  const completed = await waitFor(async () => {
    const item = (await downloads(worker)).find(entry => entry.id === fallbackId);
    return item?.state === "complete" ? item : null;
  }, "browser download did not resume after Lumi failure", 35_000);
  assert.equal(completed.paused, false);
  assert.ok((state.statusCalls.get(fallbackCapture.handoffId) || 0) >= 4);

  // Exact media-quality selection is inspected and persisted into the same
  // browser handoff path instead of silently choosing the largest/default file.
  const infoResponse = await popup.evaluate(() => new Promise(resolve => {
    chrome.runtime.sendMessage({ type: "LUMI_MEDIA_INFO", url: "https://example.com/watch/owner" }, resolve);
  }));
  assert.equal(infoResponse.ok, true);
  assert.equal(infoResponse.info.formats.length, 3);
  assert.equal(state.mediaInfoCalls, 1);

  const mediaResponse = await popup.evaluate(() => new Promise(resolve => {
    chrome.runtime.sendMessage({
      type: "LUMI_MEDIA_STAGE",
      url: "https://example.com/watch/owner",
      title: "Owner quality proof",
      filename: "Owner quality proof",
      format_id: "137+bestaudio/best",
      subtitles: true,
      subtitle_languages: ["en"],
    }, resolve);
  }));
  assert.equal(mediaResponse.ok, true);
  const mediaCapture = state.captures.find(item => item.data.url === "https://example.com/watch/owner");
  assert.ok(mediaCapture, "media selection was not persisted through the canonical handoff");
  assert.equal(mediaCapture.data.format_id, "137+bestaudio/best");
  assert.equal(mediaCapture.data.connections, 32);
  assert.equal(mediaCapture.data.subtitles, true);
  assert.deepEqual(mediaCapture.data.subtitle_languages, ["en"]);
  state.handoffs.set(mediaCapture.handoffId, "lumi");

  assert.ok(state.localAuthCalls >= 1, "manual pairing was incorrectly required");
  assert.equal(state.captures.length, 3);
  console.log("Canonical Chromium extension: auto-auth, takeover, fallback and exact media quality PASS");
} finally {
  await context?.close().catch(() => {});
  await new Promise(resolve => server.close(resolve));
  fs.rmSync(userDataDir, { recursive: true, force: true });
}
