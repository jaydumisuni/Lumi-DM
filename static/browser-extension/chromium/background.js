"use strict";

const API_BASE = "http://127.0.0.1:7000";
const pending = new Map();

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

function friendlyError(error) {
  const message = String(error?.message || error || "Lumi request failed");
  if (/not paired|authentication required|unauthori[sz]ed|token/i.test(message)) return "Pair the extension with Lumi from the toolbar button first.";
  if (/failed to fetch|networkerror|connection refused/i.test(message)) return "Open Lumi DM and wait until it says Lumi ready.";
  return message;
}

async function lumiRequest(path, options = {}, tokenRequired = true) {
  const stored = await storageGet(["lumiToken"]);
  if (tokenRequired && !stored.lumiToken) throw new Error("Lumi extension is not paired");
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      "X-Lumi-Client": "browser-extension-chromium",
      ...(stored.lumiToken ? { Authorization: `Bearer ${stored.lumiToken}` } : {}),
      ...(options.headers || {}),
    },
  });
  const text = await response.text();
  let data = {};
  try { data = text ? JSON.parse(text) : {}; } catch { data = { error: text.slice(0, 500) }; }
  if (!response.ok) {
    if (response.status === 401 || response.status === 403) await storageRemove(["lumiToken"]);
    throw new Error(data.error || `Lumi returned ${response.status}`);
  }
  return data;
}

async function extensionStatus() {
  const stored = await storageGet(["lumiToken", "lumiEnabled"]);
  if (!stored.lumiToken) return { paired: false, available: false, enabled: stored.lumiEnabled !== false, message: "Pair the extension with Lumi." };
  try {
    const me = await lumiRequest("/api/v4/security/me");
    return { paired: true, available: true, enabled: stored.lumiEnabled !== false, clientName: me.client_name || "Lumi owner", role: me.role || "owner", message: "Connected to Lumi DM" };
  } catch (error) {
    return { paired: false, available: false, enabled: stored.lumiEnabled !== false, message: friendlyError(error) };
  }
}

async function defaultSettings() {
  try { return await lumiRequest("/api/settings"); } catch (_) { return {}; }
}

function cleanMediaInfo(info) {
  if (!info || typeof info !== "object") return {};
  return {
    title: info.title || "Video",
    webpage_url: info.webpage_url || info.original_url || "",
    duration: Number(info.duration || 0),
    thumbnail: info.thumbnail || "",
    formats: Array.isArray(info.formats) ? info.formats.slice(0, 180) : [],
    entries: Array.isArray(info.entries) ? info.entries.slice(0, 100) : [],
  };
}

async function inspectMedia(url) {
  if (!/^https?:/i.test(String(url || ""))) throw new Error("This page does not have a supported web address");
  const info = await lumiRequest(`/api/v3/media/info?url=${encodeURIComponent(url)}&playlist=true`);
  return cleanMediaInfo(info);
}

function filenameFromUrl(value) {
  try {
    const parsed = new URL(value);
    const name = decodeURIComponent(parsed.pathname.split("/").filter(Boolean).pop() || "download");
    return name.replace(/[<>:"/\\|?*]+/g, "_").slice(0, 180);
  } catch (_) { return "download"; }
}

async function stageCapture({ url, filename = "", formatId = "", audioOnly = false, videoOnly = false, type = "auto", referrer = "" } = {}) {
  if (!/^https?:/i.test(String(url || ""))) throw new Error("This address is not supported");
  const settings = await defaultSettings();
  const normalizedType = String(type || "auto").toLowerCase();
  const body = {
    url,
    filename: filename || (normalizedType === "video" ? "Media download" : filenameFromUrl(url)),
    referrer,
    browser_download_id: "",
    type: normalizedType,
    target_dir: settings.default_dir || "",
    temp_dir: settings.temp_dir || "",
    queue_id: "default",
    connections: Number(settings.default_connections || 32),
    format_id: formatId || (audioOnly ? "bestaudio/best" : videoOnly ? "bestvideo" : "bestvideo+bestaudio/best"),
    request_envelope: {
      url,
      original_page: referrer || url,
      browser_profile: "chromium",
      suggested_filename: filename || "",
    },
  };
  const result = await lumiRequest("/api/v5/browser/capture", { method: "POST", body: JSON.stringify(body) });
  if (!result.handoff?.id) throw new Error("Lumi did not create a setup handoff");
  return result;
}

async function stageMedia(message = {}) {
  return stageCapture({ ...message, type: "video", referrer: message.url });
}

async function stageDirect(message = {}) {
  const value = String(message.url || "");
  const type = /\.m3u8(?:$|\?)/i.test(value) ? "hls" : /\.mpd(?:$|\?)/i.test(value) ? "dash" : "video";
  return stageCapture({ ...message, type, referrer: message.referrer || "" });
}

async function openMain() {
  return lumiRequest("/api/v5/desktop/command", { method: "POST", body: JSON.stringify({ action: "show-main" }) });
}

async function handleMessage(message) {
  const type = String(message?.type || "");
  if (type === "lumi-extension-status") return extensionStatus();
  if (type === "lumi-media-info") return { info: await inspectMedia(message.url) };
  if (type === "lumi-media-start" || type === "lumi-media-stage") return { handoff: await stageMedia(message) };
  if (type === "lumi-download-direct" || type === "lumi-direct-stage") return { handoff: await stageDirect(message) };
  if (type === "lumi-open-main") return { command: await openMain() };
  if (type === "lumi-set-enabled") {
    await storageSet({ lumiEnabled: message.enabled !== false });
    return { enabled: message.enabled !== false };
  }
  throw new Error("Unsupported Lumi extension action");
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  void handleMessage(message).then(result => sendResponse({ ok: true, ...result })).catch(error => sendResponse({ ok: false, error: friendlyError(error) }));
  return true;
});

async function safeResume(downloadId) { try { await downloadCall("resume", downloadId); } catch (_) {} }
async function safeCancel(downloadId, erase = false) {
  try { await downloadCall("cancel", downloadId); } catch (_) {}
  if (erase) { try { await downloadCall("erase", { id: downloadId }); } catch (_) {} }
}
async function notify(title, message) {
  try { await chrome.notifications.create({ type: "basic", title, message, iconUrl: chrome.runtime.getURL("icon.svg") }); } catch (_) {}
}

async function monitorHandoff(downloadId, handoffId) {
  pending.set(downloadId, handoffId);
  const started = Date.now();
  try {
    while (Date.now() - started < 10 * 60 * 1000) {
      await new Promise(resolve => setTimeout(resolve, 900));
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
    await notify("Lumi capture failed", `${friendlyError(error)} The browser download was resumed.`);
  } finally { pending.delete(downloadId); }
}

async function captureDownload(item) {
  if (!item || !item.id || !/^https?:/i.test(item.url || "")) return;
  const settings = await storageGet(["lumiEnabled", "lumiToken"]);
  if (settings.lumiEnabled === false || !settings.lumiToken || pending.has(item.id)) return;
  try {
    await downloadCall("pause", item.id);
    const result = await lumiRequest("/api/v5/browser/capture", {
      method: "POST",
      body: JSON.stringify({
        url: item.finalUrl || item.url,
        filename: item.filename ? item.filename.split(/[\\/]/).pop() : "",
        referrer: item.referrer || "",
        browser_download_id: String(item.id),
        type: "auto",
        request_envelope: {
          url: item.finalUrl || item.url,
          original_page: item.referrer || "",
          final_url: item.finalUrl || "",
          browser_profile: "chromium",
          suggested_filename: item.filename ? item.filename.split(/[\\/]/).pop() : "",
        },
      }),
    });
    const handoffId = result.handoff?.id;
    if (!handoffId) throw new Error("Lumi returned no handoff ID");
    void monitorHandoff(item.id, handoffId);
  } catch (error) {
    await safeResume(item.id);
    await notify("Lumi did not capture the download", `${friendlyError(error)} The browser download continues normally.`);
  }
}

chrome.downloads.onCreated.addListener(item => { void captureDownload(item); });
chrome.runtime.onInstalled.addListener(() => {
  void storageGet(["lumiEnabled"]).then(value => {
    if (value.lumiEnabled === undefined) return storageSet({ lumiEnabled: true });
  });
});
