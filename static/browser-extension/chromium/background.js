"use strict";

const API_BASE = "http://127.0.0.1:7000";
const BRIDGE_URL = "ws://127.0.0.1:7001";
const SCHEMA = "lumi.runtime.v1";
const pendingDownloads = new Map();
const pendingRpc = new Map();
const outbound = [];
let tokenPromise = null;
let bridgeSocket = null;
let bridgeReady = false;
let reconnectTimer = null;
let reconnectAttempt = 0;
let heartbeatTimer = null;

function storageGet(keys) { return new Promise(resolve => chrome.storage.local.get(keys, resolve)); }
function storageSet(value) { return new Promise(resolve => chrome.storage.local.set(value, resolve)); }
function storageRemove(keys) { return new Promise(resolve => chrome.storage.local.remove(keys, resolve)); }
function downloadCall(method, ...args) {
  return new Promise((resolve, reject) => {
    chrome.downloads[method](...args, result => {
      const error = chrome.runtime.lastError;
      if (error) reject(new Error(error.message)); else resolve(result);
    });
  });
}
function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }
function messageId() { return `${Date.now().toString(36)}-${crypto.randomUUID()}`; }

function friendlyError(error) {
  const message = String(error?.message || error || "Lumi request failed");
  if (/failed to fetch|networkerror|connection refused|ERR_CONNECTION_REFUSED/i.test(message)) return "Lumi DM is not running on this computer.";
  if (/authentication required|unauthori[sz]ed|token/i.test(message)) return "Lumi local browser identity could not be restored.";
  return message;
}

async function rawRequest(path, options = {}, token = "") {
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      "X-Lumi-Client": "browser-extension-chromium",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
  });
  const text = await response.text();
  let data = {};
  try { data = text ? JSON.parse(text) : {}; } catch { data = { error: text.slice(0, 500) }; }
  if (!response.ok) {
    const error = new Error(data.error || `Lumi returned ${response.status}`);
    error.status = response.status;
    throw error;
  }
  return data;
}

async function ensureToken(force = false) {
  if (tokenPromise && !force) return tokenPromise;
  tokenPromise = (async () => {
    const stored = await storageGet(["lumiToken"]);
    if (!force && stored.lumiToken) {
      try {
        await rawRequest("/api/v4/security/me", {}, stored.lumiToken);
        return stored.lumiToken;
      } catch (_) {
        await storageRemove(["lumiToken"]);
      }
    }
    const result = await rawRequest("/api/security/pair", {
      method: "POST",
      body: JSON.stringify({ mode: "local_extension", client_name: "Lumi Chrome / Edge Extension" }),
    });
    if (!result.token) throw new Error("Lumi did not issue a local extension identity");
    await storageSet({ lumiToken: result.token, lumiEnabled: true, lumiLocalIdentity: true });
    return result.token;
  })();
  try { return await tokenPromise; }
  finally { tokenPromise = null; }
}

async function lumiRequest(path, options = {}, retry = true) {
  const token = await ensureToken();
  try {
    return await rawRequest(path, options, token);
  } catch (error) {
    if (retry && (error.status === 401 || error.status === 403)) {
      await storageRemove(["lumiToken"]);
      const replacement = await ensureToken(true);
      return rawRequest(path, options, replacement);
    }
    throw error;
  }
}

function setBridgeState(ready) {
  bridgeReady = Boolean(ready);
  void storageSet({
    lumiBridgeState: bridgeReady ? "connected" : "disconnected",
    lumiBridgeAt: Date.now(),
  });
}

function clearBridgeTimers() {
  if (reconnectTimer) clearTimeout(reconnectTimer);
  if (heartbeatTimer) clearInterval(heartbeatTimer);
  reconnectTimer = null;
  heartbeatTimer = null;
}

function scheduleReconnect() {
  if (reconnectTimer) return;
  const delay = Math.min(30_000, 400 * (2 ** Math.min(reconnectAttempt, 6))) + Math.floor(Math.random() * 200);
  reconnectAttempt += 1;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    void connectBridge();
  }, delay);
}

function queueBridge(message) {
  if (outbound.length >= 50) outbound.shift();
  outbound.push(message);
}

function sendBridge(message) {
  const encoded = JSON.stringify(message);
  if (bridgeSocket?.readyState === WebSocket.OPEN && bridgeReady) {
    bridgeSocket.send(encoded);
    return true;
  }
  queueBridge(encoded);
  return false;
}

function flushBridge() {
  while (outbound.length && bridgeSocket?.readyState === WebSocket.OPEN && bridgeReady) {
    bridgeSocket.send(outbound.shift());
  }
}

async function connectBridge() {
  if (bridgeSocket && [WebSocket.OPEN, WebSocket.CONNECTING].includes(bridgeSocket.readyState)) return;
  let token;
  try { token = await ensureToken(); }
  catch (_) { setBridgeState(false); scheduleReconnect(); return; }

  setBridgeState(false);
  bridgeSocket = new WebSocket(BRIDGE_URL);
  bridgeSocket.addEventListener("open", () => {
    bridgeSocket.send(JSON.stringify({
      id: messageId(),
      type: "browser.hello",
      schema: SCHEMA,
      payload: {
        token,
        extension_version: chrome.runtime.getManifest().version,
        capabilities: {
          downloads: true,
          media_observation: true,
          hls_manifest: true,
          dash_manifest: true,
          persistent_bridge: true,
        },
      },
    }));
  });
  bridgeSocket.addEventListener("message", event => {
    let message;
    try { message = JSON.parse(String(event.data)); } catch { return; }
    if (message.type === "browser.ready") {
      reconnectAttempt = 0;
      setBridgeState(true);
      flushBridge();
      if (heartbeatTimer) clearInterval(heartbeatTimer);
      heartbeatTimer = setInterval(() => sendBridge({ id: messageId(), type: "browser.ping", schema: SCHEMA, payload: { now: Date.now() } }), 20_000);
      return;
    }
    if (message.type === "browser.pong") return;
    if (message.type === "browser.rpc.result") {
      const waiter = pendingRpc.get(String(message.reply_to || ""));
      if (!waiter) return;
      pendingRpc.delete(String(message.reply_to || ""));
      clearTimeout(waiter.timer);
      if (message.ok) waiter.resolve(message.result);
      else waiter.reject(new Error(message.error || "Lumi RPC failed"));
    }
  });
  bridgeSocket.addEventListener("close", () => {
    setBridgeState(false);
    if (heartbeatTimer) clearInterval(heartbeatTimer);
    heartbeatTimer = null;
    for (const [id, waiter] of pendingRpc) {
      clearTimeout(waiter.timer);
      waiter.reject(new Error("Lumi browser bridge disconnected"));
      pendingRpc.delete(id);
    }
    bridgeSocket = null;
    scheduleReconnect();
  });
  bridgeSocket.addEventListener("error", () => bridgeSocket?.close());
}

function bridgeRpc(method, params) {
  return new Promise((resolve, reject) => {
    const id = messageId();
    const timer = setTimeout(() => {
      pendingRpc.delete(id);
      reject(new Error("Lumi browser bridge timed out"));
    }, 12_000);
    pendingRpc.set(id, { resolve, reject, timer });
    if (!sendBridge({ id, type: "browser.rpc", schema: SCHEMA, payload: { method, params } })) {
      clearTimeout(timer);
      pendingRpc.delete(id);
      reject(new Error("Lumi browser bridge is reconnecting"));
    }
  });
}

async function rpc(method, params = {}) {
  if (bridgeReady) {
    try { return await bridgeRpc(method, params); }
    catch (_) { /* bounded HTTP fallback uses the same Runtime dispatcher */ }
  }
  const response = await lumiRequest("/api/v7/rpc", {
    method: "POST",
    body: JSON.stringify({ method, params }),
  });
  if (!response.ok) throw new Error(response.error || "Lumi RPC failed");
  return response.result;
}

async function extensionStatus() {
  const stored = await storageGet(["lumiEnabled", "lumiBridgeState"]);
  try {
    const state = await rpc("runtime.state", {});
    void connectBridge();
    return {
      available: true,
      connected: true,
      bridge: bridgeReady ? "connected" : "http-fallback",
      enabled: stored.lumiEnabled !== false,
      runtime: state.runtime_instance || "",
      message: bridgeReady ? "Connected to Lumi DM" : "Connected to Lumi DM · bridge reconnecting",
    };
  } catch (error) {
    setBridgeState(false);
    scheduleReconnect();
    return { available: false, connected: false, bridge: "disconnected", enabled: stored.lumiEnabled !== false, message: friendlyError(error) };
  }
}

function attr(text, name) {
  const match = String(text || "").match(new RegExp(`${name}=["']([^"']+)["']`, "i"));
  return match ? match[1] : "";
}

async function inspectManifest(item) {
  const url = String(item?.url || "");
  if (!/^https?:/i.test(url)) return [];
  let text;
  try {
    const response = await fetch(url, { credentials: "include", cache: "no-store" });
    if (!response.ok) return [];
    text = await response.text();
  } catch (_) { return []; }
  const values = [];
  if (/\.m3u8(?:$|\?)/i.test(url) || text.includes("#EXTM3U")) {
    const lines = text.split(/\r?\n/);
    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index].trim();
      if (!line.startsWith("#EXT-X-STREAM-INF:")) continue;
      const metadata = line.slice(line.indexOf(":") + 1);
      const next = String(lines[index + 1] || "").trim();
      if (!next || next.startsWith("#")) continue;
      const resolution = /RESOLUTION=(\d+)x(\d+)/i.exec(metadata);
      const bandwidth = /BANDWIDTH=(\d+)/i.exec(metadata);
      const codecs = /CODECS="([^"]+)"/i.exec(metadata);
      values.push({
        kind: "hls",
        url: new URL(next, url).href,
        width: resolution ? Number(resolution[1]) : 0,
        height: resolution ? Number(resolution[2]) : 0,
        bitrate: bandwidth ? Number(bandwidth[1]) : 0,
        codecs: codecs ? codecs[1] : "",
        container: "hls",
        label: resolution ? `${resolution[2]}p HLS` : "HLS stream",
      });
    }
    if (!values.length) values.push({ kind: "hls", url, container: "hls", label: "HLS stream" });
    return values;
  }
  if (/\.mpd(?:$|\?)/i.test(url) || /<MPD[\s>]/i.test(text)) {
    const representation = /<Representation\b([^>]*)>([\s\S]*?)<\/Representation>/gi;
    let match;
    while ((match = representation.exec(text)) && values.length < 200) {
      const attrs = match[1];
      const body = match[2];
      const base = /<BaseURL>([^<]+)<\/BaseURL>/i.exec(body)?.[1] || url;
      const height = Number(attr(attrs, "height") || 0);
      const width = Number(attr(attrs, "width") || 0);
      const bitrate = Number(attr(attrs, "bandwidth") || 0);
      values.push({
        kind: "dash",
        url: new URL(base, url).href,
        format_id: attr(attrs, "id"),
        width,
        height,
        bitrate,
        codecs: attr(attrs, "codecs"),
        container: "dash",
        label: height ? `${height}p DASH` : "DASH representation",
      });
    }
    if (!values.length) values.push({ kind: "dash", url, container: "dash", label: "DASH stream" });
  }
  return values;
}

async function discoverMedia(snapshot = {}) {
  const observations = Array.isArray(snapshot.observations) ? [...snapshot.observations] : [];
  const manifests = observations.filter(item => ["hls", "dash", "manifest"].includes(String(item.kind || "").toLowerCase()));
  for (const manifest of manifests.slice(0, 24)) {
    observations.push(...await inspectManifest(manifest));
  }
  return rpc("media.discover", {
    url: snapshot.url || "",
    title: snapshot.title || "",
    browser: snapshot,
    observations,
    resolver_fallback: true,
    timeout_seconds: 12,
  });
}

async function stageCapture({ source = "", url = "", filename = "", variant = null, snapshot = null, browserDownloadId = "", finalUrl = "", referrer = "" } = {}) {
  const selected = variant && typeof variant === "object" ? variant : {};
  const browser = snapshot && typeof snapshot === "object" ? snapshot : { url: referrer || url || source };
  const selectedUrl = String(selected.url || source || finalUrl || url || browser.url || "");
  const resolverFormat = selected.source === "resolver" && selected.format_id;
  const mediaKind = String(selected.kind || "").toLowerCase();
  const type = resolverFormat ? "video" : ["hls", "dash"].includes(mediaKind) ? mediaKind : selectedUrl === browser.url && selected.format_id ? "video" : "auto";
  return rpc("browser.capture", {
    source: resolverFormat ? String(browser.url || url || source) : selectedUrl,
    final_url: finalUrl || selectedUrl,
    filename: filename || browser.title || "",
    type,
    format_id: selected.format_id || "",
    audio_only: Boolean(selected.audio_only),
    video_only: Boolean(selected.video_only),
    media: selected,
    browser,
    browser_download_id: String(browserDownloadId || ""),
    referrer: referrer || browser.url || "",
    connections: 32,
  });
}

async function handleMessage(message) {
  const type = String(message?.type || "");
  if (type === "lumi-extension-status") return { status: await extensionStatus() };
  if (type === "lumi-media-discover") return { media: await discoverMedia(message.snapshot || {}) };
  if (type === "lumi-media-stage") return { handoff: await stageCapture({
    source: message.url || message.snapshot?.url || "",
    filename: message.filename || message.snapshot?.title || "",
    variant: message.variant || null,
    snapshot: message.snapshot || null,
    referrer: message.snapshot?.url || message.url || "",
  }) };
  if (type === "lumi-direct-stage") return { handoff: await stageCapture({
    source: message.url || "",
    filename: message.filename || "",
    variant: message.variant || { kind: "direct", url: message.url || "" },
    snapshot: message.snapshot || { url: message.referrer || "", title: message.filename || "" },
    referrer: message.referrer || "",
  }) };
  if (type === "lumi-open-main") {
    return { command: await lumiRequest("/api/v5/desktop/command", { method: "POST", body: JSON.stringify({ action: "show-main" }) }) };
  }
  if (type === "lumi-set-enabled") {
    await storageSet({ lumiEnabled: message.enabled !== false });
    return { enabled: message.enabled !== false };
  }
  throw new Error("Unsupported Lumi extension action");
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  void handleMessage(message)
    .then(result => sendResponse({ ok: true, ...result }))
    .catch(error => sendResponse({ ok: false, error: friendlyError(error) }));
  return true;
});

async function safeResume(downloadId) { try { await downloadCall("resume", downloadId); } catch (_) {} }
async function safePause(downloadId) { try { await downloadCall("pause", downloadId); } catch (_) {} }
async function safeCancel(downloadId, erase = false) {
  try { await downloadCall("cancel", downloadId); } catch (_) {}
  if (erase) { try { await downloadCall("erase", { id: downloadId }); } catch (_) {} }
}
async function notify(title, message) {
  try { await chrome.notifications.create({ type: "basic", title, message, iconUrl: chrome.runtime.getURL("icon.svg") }); } catch (_) {}
}

async function monitorHandoff(downloadId, handoffId) {
  pendingDownloads.set(downloadId, handoffId);
  const started = Date.now();
  try {
    while (Date.now() - started < 10 * 60 * 1000) {
      await sleep(900);
      const result = await lumiRequest(`/api/v5/browser/handoffs/${encodeURIComponent(handoffId)}`);
      const decision = String(result.decision || "pending");
      if (decision === "pending") continue;
      if (decision === "lumi") {
        await safeCancel(downloadId, true);
        await notify("Lumi is downloading", result.task?.filename || "Browser download transferred to Lumi.");
        return;
      }
      if (decision === "browser") { await safeResume(downloadId); return; }
      await safeCancel(downloadId, true);
      return;
    }
    await safeResume(downloadId);
    await notify("Lumi handoff timed out", "The browser download was resumed safely.");
  } catch (error) {
    await safeResume(downloadId);
    await notify("Lumi capture failed", `${friendlyError(error)} The browser download continues normally.`);
  } finally { pendingDownloads.delete(downloadId); }
}

async function captureDownload(item) {
  if (!item?.id || !/^https?:/i.test(item.finalUrl || item.url || "")) return;
  const settings = await storageGet(["lumiEnabled"]);
  if (settings.lumiEnabled === false || pendingDownloads.has(item.id)) return;
  try {
    const result = await stageCapture({
      source: item.finalUrl || item.url,
      finalUrl: item.finalUrl || item.url,
      filename: item.filename ? item.filename.split(/[\\/]/).pop() : "",
      browserDownloadId: item.id,
      referrer: item.referrer || "",
      snapshot: { url: item.referrer || item.url || "", title: item.filename ? item.filename.split(/[\\/]/).pop() : "Browser download", observations: [] },
    });
    const handoffId = result?.handoff?.id;
    if (!handoffId) throw new Error("Lumi did not persist the browser handoff");
    // The browser is paused only after the canonical Runtime has persisted the
    // request. A disconnected Lumi therefore never breaks the browser download.
    await safePause(item.id);
    void monitorHandoff(item.id, handoffId);
  } catch (_) {
    // No pause occurred if persistence failed; the browser continues normally.
  }
}

chrome.downloads.onCreated.addListener(item => { void captureDownload(item); });
chrome.runtime.onInstalled.addListener(() => {
  void storageGet(["lumiEnabled"]).then(value => {
    const work = value.lumiEnabled === undefined ? storageSet({ lumiEnabled: true }) : Promise.resolve();
    return work.then(() => ensureToken()).then(() => connectBridge()).catch(() => scheduleReconnect());
  });
});
chrome.runtime.onStartup.addListener(() => { void ensureToken().then(() => connectBridge()).catch(() => scheduleReconnect()); });
void ensureToken().then(() => connectBridge()).catch(() => scheduleReconnect());
