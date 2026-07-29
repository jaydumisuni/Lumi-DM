"use strict";

const API_BASE = "http://127.0.0.1:7000";
const pending = new Map();

function storageGet(keys) {
  return new Promise(resolve => chrome.storage.local.get(keys, resolve));
}

function storageSet(value) {
  return new Promise(resolve => chrome.storage.local.set(value, resolve));
}

function downloadCall(method, ...args) {
  return new Promise((resolve, reject) => {
    chrome.downloads[method](...args, result => {
      const error = chrome.runtime.lastError;
      if (error) reject(new Error(error.message));
      else resolve(result);
    });
  });
}

async function lumiRequest(path, options = {}) {
  const stored = await storageGet(["lumiToken"]);
  if (!stored.lumiToken) throw new Error("Lumi extension is not paired");
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${stored.lumiToken}`,
      "X-Lumi-Client": "browser-extension-chromium",
      ...(options.headers || {}),
    },
  });
  const text = await response.text();
  let data = {};
  try { data = text ? JSON.parse(text) : {}; }
  catch { data = { error: text.slice(0, 400) }; }
  if (!response.ok) throw new Error(data.error || `Lumi returned ${response.status}`);
  return data;
}

async function safeResume(downloadId) {
  try { await downloadCall("resume", downloadId); } catch (_) {}
}

async function safeCancel(downloadId, erase = false) {
  try { await downloadCall("cancel", downloadId); } catch (_) {}
  if (erase) {
    try { await downloadCall("erase", { id: downloadId }); } catch (_) {}
  }
}

async function notify(title, message) {
  try {
    await chrome.notifications.create({
      type: "basic",
      title,
      message,
      iconUrl: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
    });
  } catch (_) {}
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
      if (decision === "browser") {
        await safeResume(downloadId);
        return;
      }
      await safeCancel(downloadId, true);
      return;
    }
    await safeResume(downloadId);
    await notify("Lumi handoff timed out", "The browser download was resumed safely.");
  } catch (error) {
    await safeResume(downloadId);
    await notify("Lumi capture failed", `${error.message}. The browser download was resumed.`);
  } finally {
    pending.delete(downloadId);
  }
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
    await notify("Lumi did not capture the download", `${error.message}. The browser download continues normally.`);
  }
}

chrome.downloads.onCreated.addListener(item => { void captureDownload(item); });

chrome.runtime.onInstalled.addListener(() => {
  void storageGet(["lumiEnabled"]).then(value => {
    if (value.lumiEnabled === undefined) return storageSet({ lumiEnabled: true });
  });
});
