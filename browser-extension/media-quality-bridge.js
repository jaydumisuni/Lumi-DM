"use strict";

const MEDIA_SERVER_DEFAULT = "http://localhost:7000";
const MEDIA_HANDOFF_TIMEOUT_MS = 10 * 60 * 1000;

async function mediaSettings() {
  const stored = await chrome.storage.local.get({ server: MEDIA_SERVER_DEFAULT });
  return String(stored.server || MEDIA_SERVER_DEFAULT).replace(/\/$/, "");
}

async function mediaJson(path, options = {}) {
  const server = await mediaSettings();
  const response = await fetch(`${server}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      "X-Lumi-Client": "browser-extension-media-v1",
      ...(options.headers || {}),
    },
  });
  const text = await response.text();
  let data = {};
  try { data = text ? JSON.parse(text) : {}; }
  catch { data = { error: text.slice(0, 500) }; }
  if (!response.ok || data.error) {
    throw new Error(data.error || `Lumi returned ${response.status}`);
  }
  return data;
}

async function mediaDefaults() {
  try { return await mediaJson("/api/settings"); }
  catch { return {}; }
}

async function inspectMedia(url) {
  if (!/^https?:/i.test(String(url || ""))) throw new Error("The current page is not a supported media address");
  return mediaJson(`/api/v3/media/info?playlist=false&url=${encodeURIComponent(url)}`);
}

function safeFilename(value) {
  return String(value || "Media download")
    .replace(/[<>:"/\\|?*\u0000-\u001f]+/g, "_")
    .trim()
    .slice(0, 180) || "Media download";
}

async function stageMedia(message, sender) {
  const url = String(message.url || "").trim();
  if (!/^https?:/i.test(url)) throw new Error("The selected media address is not supported");
  const defaults = await mediaDefaults();
  const body = {
    url,
    type: "video",
    filename: safeFilename(message.filename || message.title),
    target_dir: String(defaults.default_dir || ""),
    temp_dir: String(defaults.temp_dir || ""),
    queue_id: "default",
    connections: Math.max(1, Math.min(128, Number(defaults.default_connections || 32))),
    format_id: String(message.format_id || "bestvideo+bestaudio/best"),
    audio_only: Boolean(message.audio_only),
    video_only: Boolean(message.video_only),
    subtitles: Boolean(message.subtitles),
    subtitle_languages: Array.isArray(message.subtitle_languages)
      ? message.subtitle_languages.map(String).slice(0, 12)
      : [],
    automatic_subtitles: message.automatic_subtitles !== false,
    embed_subtitles: message.embed_subtitles !== false,
    thumbnail: message.thumbnail !== false,
    embed_thumbnail: message.embed_thumbnail !== false,
    metadata: message.metadata !== false,
    merge_output_format: String(message.merge_output_format || ""),
    referrer: String(sender?.tab?.url || message.referrer || url),
    request_envelope: {
      url,
      original_page: String(sender?.tab?.url || message.referrer || url),
      browser_profile: "chromium-mv3-media-picker",
      suggested_filename: safeFilename(message.filename || message.title),
      captured_at: new Date().toISOString(),
    },
  };
  const result = await mediaJson("/api/v5/browser/capture", {
    method: "POST",
    body: JSON.stringify(body),
  });
  if (!result.handoff?.id || !result.task?.id) {
    throw new Error("Lumi did not persist the media handoff");
  }
  void monitorManualMediaHandoff(result.handoff.id, url);
  return result;
}

async function monitorManualMediaHandoff(handoffId, originalUrl) {
  const deadline = Date.now() + MEDIA_HANDOFF_TIMEOUT_MS;
  let failures = 0;
  while (Date.now() < deadline) {
    await new Promise(resolve => setTimeout(resolve, 900));
    try {
      const result = await mediaJson(`/api/v5/browser/handoffs/${encodeURIComponent(handoffId)}`);
      failures = 0;
      const decision = String(result.decision || "pending");
      if (decision === "pending") continue;
      if (decision === "browser") {
        await chrome.downloads.download({ url: originalUrl, conflictAction: "uniquify" });
      }
      return;
    } catch {
      failures += 1;
      if (failures >= 4) return;
    }
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const type = String(message?.type || "");
  if (type === "LUMI_MEDIA_INFO") {
    void inspectMedia(message.url)
      .then(info => sendResponse({ ok: true, info }))
      .catch(error => sendResponse({ ok: false, error: error.message }));
    return true;
  }
  if (type === "LUMI_MEDIA_STAGE") {
    void stageMedia(message, sender)
      .then(result => sendResponse({ ok: true, task: result.task, handoff: result.handoff }))
      .catch(error => sendResponse({ ok: false, error: error.message }));
    return true;
  }
  return false;
});
