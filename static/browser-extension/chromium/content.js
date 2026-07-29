"use strict";

(() => {
  if (window.top !== window.self || location.hostname === "127.0.0.1" || location.hostname === "localhost") return;

  const state = {
    enabled: true,
    open: false,
    busy: false,
    info: null,
    host: null,
    shadow: null,
    largestVideo: null,
    mutationTimer: null,
  };

  const esc = value => String(value ?? "").replace(/[&<>"']/g, char => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[char]));

  function send(message) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(message, response => {
        const runtimeError = chrome.runtime.lastError;
        if (runtimeError) reject(new Error(runtimeError.message));
        else if (!response?.ok) reject(new Error(response?.error || "Lumi extension request failed"));
        else resolve(response);
      });
    });
  }

  function visibleVideos() {
    return [...document.querySelectorAll("video")].filter(video => {
      const rect = video.getBoundingClientRect();
      const style = getComputedStyle(video);
      return rect.width >= 240 && rect.height >= 135 && style.display !== "none" && style.visibility !== "hidden";
    });
  }

  function directSources() {
    const values = new Set();
    for (const video of document.querySelectorAll("video")) {
      for (const value of [video.currentSrc, video.src, ...[...video.querySelectorAll("source")].map(source => source.src)]) {
        if (/^https?:/i.test(String(value || ""))) values.add(value);
      }
    }
    for (const selector of ['meta[property="og:video"]', 'meta[property="og:video:url"]', 'meta[name="twitter:player:stream"]']) {
      const value = document.querySelector(selector)?.content;
      if (/^https?:/i.test(String(value || ""))) values.add(value);
    }
    return [...values].slice(0, 12);
  }

  function pageHasMedia() {
    return visibleVideos().length > 0 || directSources().length > 0 || Boolean(document.querySelector('[itemtype*="VideoObject"], meta[property="og:type"][content*="video"]'));
  }

  function chooseLargestVideo() {
    state.largestVideo = visibleVideos().sort((a, b) => {
      const ar = a.getBoundingClientRect();
      const br = b.getBoundingClientRect();
      return br.width * br.height - ar.width * ar.height;
    })[0] || null;
    return state.largestVideo;
  }

  function styles() {
    return `
      :host{all:initial;position:fixed;z-index:2147483647;font-family:Segoe UI,Arial,sans-serif;color:#f4f7fc;line-height:1.35}
      *{box-sizing:border-box}.lumi-root{position:relative}.lumi-trigger{height:38px;border:1px solid rgba(159,67,255,.72);border-radius:9px;background:linear-gradient(100deg,rgba(63,10,110,.96),rgba(6,35,73,.97));color:#fff;display:flex;align-items:center;gap:9px;padding:0 12px 0 8px;font:700 12px Segoe UI,Arial;cursor:pointer;box-shadow:0 8px 28px rgba(0,0,0,.44),0 0 20px rgba(121,34,227,.22);backdrop-filter:blur(14px)}
      .lumi-trigger:hover{border-color:#c970ff;transform:translateY(-1px)}.lumi-mark{width:25px;height:25px;border-radius:7px;display:grid;place-items:center;background:linear-gradient(145deg,#bc2dff,#0da7ff);font-size:17px;font-weight:900;box-shadow:0 0 13px rgba(126,40,255,.38)}.lumi-trigger .chev{margin-left:2px;color:#dcbcff;font-size:14px}
      .lumi-panel{width:390px;margin-top:7px;border:1px solid rgba(123,145,178,.27);border-radius:14px;background:linear-gradient(145deg,rgba(7,12,22,.985),rgba(3,8,16,.99));box-shadow:0 22px 65px rgba(0,0,0,.66),0 0 30px rgba(92,20,165,.18);overflow:hidden;backdrop-filter:blur(18px)}
      .lumi-head{display:flex;align-items:flex-start;gap:11px;padding:14px 14px 12px;border-bottom:1px solid rgba(255,255,255,.07)}.lumi-head .brand{width:38px;height:38px;border-radius:10px;display:grid;place-items:center;background:linear-gradient(145deg,#b729ff,#139eff);font-size:21px;font-weight:900}.lumi-title{min-width:0;flex:1}.lumi-title strong{display:block;font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.lumi-title small{display:block;margin-top:4px;color:#8895aa;font-size:9px;text-transform:uppercase;letter-spacing:.1em}.lumi-close{width:29px;height:29px;border:1px solid rgba(110,130,161,.2);border-radius:8px;background:#08111e;color:#aeb8c8;font-size:17px;cursor:pointer}
      .lumi-body{padding:13px}.lumi-state{min-height:74px;border:1px solid rgba(104,124,155,.18);border-radius:10px;background:#07101c;display:grid;place-items:center;text-align:center;padding:13px;color:#9aa6b9;font-size:11px}.lumi-state strong{display:block;color:#eef3fa;font-size:12px;margin-bottom:5px}.lumi-state.bad{border-color:rgba(255,82,96,.25);background:rgba(65,8,16,.28);color:#ff98a1}.lumi-state.ok{border-color:rgba(37,204,98,.22);background:rgba(8,54,28,.3);color:#77e69c}
      .lumi-formats{display:grid;gap:7px}.lumi-format{width:100%;min-height:49px;border:1px solid rgba(105,125,157,.18);border-radius:9px;background:#07101c;color:#eef2f8;display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:center;gap:11px;padding:8px 11px;text-align:left;cursor:pointer}.lumi-format:hover{border-color:#8c2be1;background:rgba(74,17,124,.3)}.lumi-format strong{display:block;font-size:11px}.lumi-format small{display:block;margin-top:4px;color:#8491a5;font-size:9px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.lumi-format b{min-width:57px;padding:5px 8px;border-radius:999px;background:rgba(30,120,255,.13);color:#72b5ff;text-align:center;font-size:9px}.lumi-format.best b{background:rgba(143,31,230,.18);color:#d18cff}.lumi-format.audio b{background:rgba(36,204,100,.13);color:#65df90}
      .lumi-actions{display:flex;gap:8px;margin-top:10px}.lumi-btn{height:36px;border:1px solid rgba(111,133,164,.25);border-radius:8px;background:#091321;color:#dce4ef;padding:0 12px;font:700 10px Segoe UI;cursor:pointer}.lumi-btn.primary{flex:1;border-color:#a642ef;background:linear-gradient(100deg,#7c16d4,#2369e5);color:#fff}.lumi-note{margin:11px 2px 0;color:#738096;font-size:9px}.lumi-spinner{width:25px;height:25px;border:3px solid rgba(124,145,177,.2);border-top-color:#a82cff;border-right-color:#159cff;border-radius:50%;animation:lumi-spin .75s linear infinite;margin:0 auto 8px}@keyframes lumi-spin{to{transform:rotate(360deg)}}
    `;
  }

  function ensureHost() {
    if (state.host?.isConnected) return state.host;
    const host = document.createElement("div");
    host.id = "lumi-media-capture-host";
    const shadow = host.attachShadow({ mode: "open" });
    shadow.innerHTML = `<style>${styles()}</style><div class="lumi-root"><button class="lumi-trigger" type="button"><span class="lumi-mark">↓</span><span>Download this video</span><span class="chev">⌄</span></button><div class="lumi-panel" hidden></div></div>`;
    document.documentElement.appendChild(host);
    state.host = host;
    state.shadow = shadow;
    shadow.querySelector(".lumi-trigger").addEventListener("click", () => togglePanel());
    shadow.querySelector(".lumi-panel").addEventListener("click", onPanelClick);
    positionHost();
    return host;
  }

  function positionHost() {
    if (!state.host?.isConnected) return;
    const video = chooseLargestVideo();
    let top = 14;
    let left = Math.max(12, window.innerWidth - 220);
    if (video) {
      const rect = video.getBoundingClientRect();
      top = Math.max(8, Math.min(window.innerHeight - 54, rect.top + 8));
      left = Math.max(8, Math.min(window.innerWidth - (state.open ? 408 : 205), rect.left + 8));
    }
    state.host.style.top = `${Math.round(top)}px`;
    state.host.style.left = `${Math.round(left)}px`;
  }

  function removeHost() {
    state.host?.remove();
    state.host = null;
    state.shadow = null;
    state.open = false;
    state.info = null;
  }

  function titleText() {
    const og = document.querySelector('meta[property="og:title"]')?.content;
    return (og || document.title || "Video").replace(/^\(\d+\)\s*/, "").trim();
  }

  function renderPanel(content) {
    const panel = state.shadow?.querySelector(".lumi-panel");
    if (!panel) return;
    panel.hidden = false;
    panel.innerHTML = `<div class="lumi-head"><div class="brand">↓</div><div class="lumi-title"><strong title="${esc(titleText())}">${esc(titleText())}</strong><small>Lumi media capture</small></div><button class="lumi-close" type="button" data-lumi-action="close">×</button></div><div class="lumi-body">${content}</div>`;
  }

  function loading(message = "Finding available qualities…") {
    renderPanel(`<div class="lumi-state"><div><div class="lumi-spinner"></div><strong>${esc(message)}</strong><span>Lumi is checking the current page through the desktop app.</span></div></div>`);
  }

  function stateCard(title, message, kind = "", actions = "") {
    renderPanel(`<div class="lumi-state ${kind}"><div><strong>${esc(title)}</strong><span>${esc(message)}</span></div></div>${actions ? `<div class="lumi-actions">${actions}</div>` : ""}`);
  }

  function formatSize(value) {
    const bytes = Number(value || 0);
    if (!bytes) return "Size unknown";
    if (bytes >= 1073741824) return `${(bytes / 1073741824).toFixed(1)} GB`;
    if (bytes >= 1048576) return `${(bytes / 1048576).toFixed(0)} MB`;
    return `${(bytes / 1024).toFixed(0)} KB`;
  }

  function usefulFormats(info) {
    const values = Array.isArray(info?.formats) ? info.formats : [];
    const normalized = values.map(item => {
      const audio = String(item.vcodec || "").toLowerCase() === "none";
      const videoOnly = !audio && String(item.acodec || "").toLowerCase() === "none";
      const height = Number(item.height || 0);
      const quality = audio ? `${Math.round(Number(item.abr || item.tbr || 0)) || "Audio"}${Number(item.abr || item.tbr || 0) ? " kbps" : ""}` : (height ? `${height}p` : item.resolution || item.format_note || "Video");
      return {
        id: String(item.format_id || ""),
        quality,
        ext: String(item.ext || "media").toUpperCase(),
        audio,
        videoOnly,
        height,
        size: Number(item.filesize || item.filesize_approx || 0),
        tbr: Number(item.tbr || 0),
      };
    }).filter(item => item.id && (item.audio || item.height || item.quality));
    normalized.sort((a, b) => {
      if (a.audio !== b.audio) return a.audio ? 1 : -1;
      return (b.height - a.height) || (b.tbr - a.tbr);
    });
    const seen = new Set();
    return normalized.filter(item => {
      const key = `${item.audio ? "audio" : item.height || item.quality}-${item.ext}-${item.videoOnly}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }).slice(0, 9);
  }

  function renderFormats(info) {
    const formats = usefulFormats(info);
    const fallback = directSources();
    const rows = [
      `<button class="lumi-format best" type="button" data-lumi-start="best"><span><strong>Best available quality</strong><small>Lumi chooses the best video and audio combination</small></span><b>BEST</b></button>`,
      ...formats.map(item => `<button class="lumi-format ${item.audio ? "audio" : ""}" type="button" data-lumi-format="${esc(item.id)}" data-lumi-audio="${item.audio}"><span><strong>${esc(item.quality)} · ${esc(item.ext)}</strong><small>${esc(item.audio ? "Audio only" : item.videoOnly ? "Video stream · Lumi will merge audio when supported" : "Video + audio")} · ${esc(formatSize(item.size))}</small></span><b>${item.audio ? "AUDIO" : esc(item.quality)}</b></button>`),
      ...(!formats.length ? fallback.map((url, index) => `<button class="lumi-format" type="button" data-lumi-direct="${esc(url)}"><span><strong>Direct video source ${index + 1}</strong><small>${esc(url)}</small></span><b>FILE</b></button>`) : []),
    ].join("");
    renderPanel(`<div class="lumi-formats">${rows}</div><div class="lumi-actions"><button class="lumi-btn" type="button" data-lumi-action="rescan">↻ Scan again</button><button class="lumi-btn primary" type="button" data-lumi-start="audio">Download audio only</button></div><p class="lumi-note">Qualities come from Lumi’s media engine, not from guessed player labels. Protected or DRM-only streams may not be downloadable.</p>`);
  }

  async function inspect() {
    if (state.busy) return;
    state.busy = true;
    loading();
    try {
      const status = await send({ type: "lumi-extension-status" });
      if (!status.paired || !status.available) {
        stateCard("Pair Lumi first", status.message || "Open the Lumi extension from the toolbar and enter a pairing code.", "bad", `<button class="lumi-btn primary" type="button" data-lumi-action="close">Close</button>`);
        return;
      }
      const result = await send({ type: "lumi-media-info", url: location.href });
      state.info = result.info || {};
      renderFormats(state.info);
    } catch (error) {
      const fallback = directSources();
      if (fallback.length) {
        state.info = { title: titleText(), formats: [] };
        renderFormats(state.info);
      } else {
        stateCard("Video could not be inspected", error.message, "bad", `<button class="lumi-btn" type="button" data-lumi-action="rescan">Try again</button><button class="lumi-btn primary" type="button" data-lumi-action="close">Close</button>`);
      }
    } finally {
      state.busy = false;
    }
  }

  async function startMedia(formatId = "", audioOnly = false) {
    if (state.busy) return;
    state.busy = true;
    loading("Sending this download to Lumi…");
    try {
      await send({ type: "lumi-media-start", url: location.href, formatId, audioOnly });
      stateCard("Added to Lumi", "The selected media is now in your Lumi download queue.", "ok", `<button class="lumi-btn primary" type="button" data-lumi-action="close">Done</button>`);
    } catch (error) {
      stateCard("Download was not added", error.message, "bad", `<button class="lumi-btn" type="button" data-lumi-action="rescan">Try again</button><button class="lumi-btn primary" type="button" data-lumi-action="close">Close</button>`);
    } finally {
      state.busy = false;
    }
  }

  async function startDirect(url) {
    if (state.busy) return;
    state.busy = true;
    loading("Sending the direct video source to Lumi…");
    try {
      await send({ type: "lumi-download-direct", url, filename: "" });
      stateCard("Added to Lumi", "The direct video source is now in your Lumi download queue.", "ok", `<button class="lumi-btn primary" type="button" data-lumi-action="close">Done</button>`);
    } catch (error) {
      stateCard("Download was not added", error.message, "bad", `<button class="lumi-btn primary" type="button" data-lumi-action="close">Close</button>`);
    } finally {
      state.busy = false;
    }
  }

  function onPanelClick(event) {
    const button = event.target.closest("button");
    if (!button) return;
    if (button.dataset.lumiAction === "close") return closePanel();
    if (button.dataset.lumiAction === "rescan") return void inspect();
    if (button.dataset.lumiStart === "best") return void startMedia("", false);
    if (button.dataset.lumiStart === "audio") return void startMedia("", true);
    if (button.dataset.lumiFormat !== undefined) return void startMedia(button.dataset.lumiFormat, button.dataset.lumiAudio === "true");
    if (button.dataset.lumiDirect) return void startDirect(button.dataset.lumiDirect);
  }

  function closePanel() {
    state.open = false;
    const panel = state.shadow?.querySelector(".lumi-panel");
    if (panel) panel.hidden = true;
    positionHost();
  }

  function togglePanel(forceOpen = false) {
    state.open = forceOpen || !state.open;
    if (!state.open) return closePanel();
    positionHost();
    void inspect();
  }

  function syncPresence() {
    if (!state.enabled || !pageHasMedia()) return removeHost();
    ensureHost();
    positionHost();
  }

  function schedulePresence() {
    clearTimeout(state.mutationTimer);
    state.mutationTimer = setTimeout(syncPresence, 350);
  }

  chrome.storage.local.get(["lumiEnabled"], value => {
    state.enabled = value.lumiEnabled !== false;
    syncPresence();
  });

  chrome.storage.onChanged.addListener(changes => {
    if (!changes.lumiEnabled) return;
    state.enabled = changes.lumiEnabled.newValue !== false;
    syncPresence();
  });

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === "lumi-page-state") {
      sendResponse({ ok: true, hasMedia: pageHasMedia(), title: titleText(), directCount: directSources().length });
      return;
    }
    if (message?.type === "lumi-open-panel") {
      if (!pageHasMedia()) { sendResponse({ ok: false, error: "No video player was detected on this page" }); return; }
      state.enabled = true;
      ensureHost();
      togglePanel(true);
      sendResponse({ ok: true });
    }
  });

  new MutationObserver(schedulePresence).observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ["src"] });
  addEventListener("resize", positionHost, { passive: true });
  addEventListener("scroll", positionHost, { passive: true });
  setInterval(syncPresence, 2500);
})();
