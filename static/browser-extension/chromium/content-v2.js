"use strict";

(() => {
  if (window.top !== window.self || ["127.0.0.1", "localhost"].includes(location.hostname)) return;

  const state = {
    enabled: true,
    open: false,
    busy: false,
    host: null,
    shadow: null,
    media: null,
    snapshot: null,
    mutationTimer: null,
  };
  const esc = value => String(value ?? "").replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));

  function send(message, timeout = 16000) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("Lumi did not answer before the media scan timed out.")), timeout);
      chrome.runtime.sendMessage(message, response => {
        clearTimeout(timer);
        const runtimeError = chrome.runtime.lastError;
        if (runtimeError) reject(new Error(runtimeError.message));
        else if (!response?.ok) reject(new Error(response?.error || "Lumi extension request failed"));
        else resolve(response);
      });
    });
  }

  function absoluteUrl(value) {
    try { return new URL(String(value || ""), location.href).href; }
    catch (_) { return ""; }
  }

  function mediaKind(url, type = "") {
    const value = String(url || "").toLowerCase();
    const mime = String(type || "").toLowerCase();
    if (value.includes(".m3u8") || mime.includes("mpegurl")) return "hls";
    if (value.includes(".mpd") || mime.includes("dash")) return "dash";
    if (/\.(vtt|srt|ass)(?:$|[?#])/i.test(value) || mime.includes("text/vtt")) return "subtitle";
    if (/\.(mp3|m4a|aac|ogg|opus|wav)(?:$|[?#])/i.test(value) || mime.startsWith("audio/")) return "audio";
    return "direct";
  }

  function collectSnapshot() {
    const observations = [];
    const seen = new Set();
    let hasBlob = false;
    const add = raw => {
      const url = absoluteUrl(raw.url);
      if (!url || !/^https?:/i.test(url)) return;
      // The network URL is the browser resource identity. currentSrc, <source>
      // and Performance entries can all report that same resource with
      // different incidental parent-video dimensions or kind labels. Collapse
      // those observations here so one browser resource cannot become multiple
      // visible download rows. Subtitle identity additionally keeps language.
      const kind = String(raw.kind || "").toLowerCase();
      const key = kind === "subtitle"
        ? `subtitle|${url}|${raw.language || ""}`
        : `media|${url}`;
      if (seen.has(key)) return;
      seen.add(key);
      observations.push({ ...raw, url });
    };

    document.querySelectorAll("video,audio").forEach(element => {
      const rect = element.getBoundingClientRect();
      const explicitSources = [...element.querySelectorAll("source")]
        .map(node => ({ url: node.src, type: node.type || "" }))
        .filter(source => String(source.url || "").trim());
      const directAttribute = String(element.getAttribute("src") || "").trim();
      const candidates = explicitSources.length
        ? explicitSources
        : directAttribute
          ? [{ url: element.src, type: element.type || "" }]
          : [{ url: element.currentSrc, type: element.type || "" }];

      // An element with explicit <source> children already declares its
      // candidate set. currentSrc is merely the browser-selected member of that
      // set and must not become a second generic row with parent display-box
      // dimensions. Direct video/audio src remains supported when no child
      // sources exist.
      for (const source of candidates) {
        if (String(source.url || "").startsWith("blob:")) { hasBlob = true; continue; }
        add({
          kind: mediaKind(source.url, source.type),
          url: source.url,
          width: Number(element.videoWidth || rect.width || 0),
          height: Number(element.videoHeight || rect.height || 0),
          container: String(source.type || "").split("/").pop() || "",
          label: element.tagName === "AUDIO" ? "Page audio" : (element.videoHeight ? `${element.videoHeight}p page video` : "Page video"),
          audio_only: element.tagName === "AUDIO",
        });
      }
      element.querySelectorAll("track").forEach(track => add({
        kind: "subtitle",
        url: track.src,
        language: track.srclang || "",
        label: track.label || track.srclang || "Subtitle",
        container: String(track.src || "").split(".").pop()?.split(/[?#]/)[0] || "",
      }));
    });

    for (const selector of [
      'meta[property="og:video"]',
      'meta[property="og:video:url"]',
      'meta[property="og:video:secure_url"]',
      'meta[name="twitter:player:stream"]',
    ]) {
      const node = document.querySelector(selector);
      if (node?.content) add({ kind: mediaKind(node.content, node.getAttribute("content-type") || ""), url: node.content, label: "Page media source" });
    }

    try {
      for (const entry of performance.getEntriesByType("resource").slice(-1200)) {
        const url = String(entry.name || "");
        if (!/^https?:/i.test(url)) continue;
        if (!/\.m3u8(?:$|[?#])|\.mpd(?:$|[?#])|\.(mp4|webm|m4v|mov|m4a|mp3|aac|ogg|opus)(?:$|[?#])/i.test(url)) continue;
        add({ kind: mediaKind(url), url, label: "Browser resource" });
        if (observations.length >= 320) break;
      }
    } catch (_) {}

    const thumbnail = document.querySelector('meta[property="og:image"]')?.content || "";
    return {
      url: location.href,
      title: (document.querySelector('meta[property="og:title"]')?.content || document.title || "Media").replace(/^\(\d+\)\s*/, "").trim(),
      referrer: document.referrer || "",
      thumbnail: absoluteUrl(thumbnail),
      has_blob: hasBlob,
      observations,
      captured_at: new Date().toISOString(),
    };
  }

  function pageHasMedia() {
    const snapshot = collectSnapshot();
    return snapshot.has_blob || snapshot.observations.some(item => item.kind !== "subtitle") || Boolean(document.querySelector("video,audio,[itemtype*='VideoObject'],meta[property='og:type'][content*='video']"));
  }

  function styles() {
    return `
      :host{all:initial;position:fixed;z-index:2147483647;font-family:"Segoe UI",Inter,Arial,sans-serif;color:#f5f7fc;line-height:1.35}
      *{box-sizing:border-box}.root{position:relative}.trigger{height:42px;border:1px solid rgba(178,75,255,.7);border-radius:11px;background:linear-gradient(100deg,rgba(49,11,91,.98),rgba(6,37,78,.98));color:#fff;display:flex;align-items:center;gap:9px;padding:0 13px 0 8px;font:800 12px "Segoe UI",Arial;cursor:pointer;box-shadow:0 10px 32px rgba(0,0,0,.48),0 0 24px rgba(123,34,232,.24)}
      .trigger img{width:29px;height:29px;object-fit:contain}.panel{width:430px;margin-top:8px;border:1px solid rgba(126,149,184,.28);border-radius:16px;background:linear-gradient(145deg,rgba(7,13,24,.995),rgba(2,7,14,.995));box-shadow:0 26px 78px rgba(0,0,0,.7);overflow:hidden}.head{display:flex;align-items:center;gap:11px;padding:14px;border-bottom:1px solid rgba(255,255,255,.07)}.head img{width:42px;height:42px;object-fit:contain}.title{min-width:0;flex:1}.title strong,.title small{display:block}.title strong{font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.title small{margin-top:4px;color:#8290a6;font-size:9px}.close{width:31px;height:31px;border:1px solid rgba(111,133,166,.22);border-radius:9px;background:#07101d;color:#aeb9ca;cursor:pointer}.body{padding:13px}.state{min-height:105px;border:1px solid rgba(104,124,155,.18);border-radius:11px;background:#07101c;display:grid;place-items:center;text-align:center;padding:14px;color:#9aa6b9;font-size:10px}.state strong{display:block;color:#eef3fa;font-size:12px;margin-bottom:5px}.state.bad{border-color:rgba(255,82,96,.25);color:#ff98a1}.state.ok{border-color:rgba(37,204,98,.22);color:#77e69c}.spinner{width:27px;height:27px;border:3px solid rgba(124,145,177,.2);border-top-color:#a82cff;border-right-color:#159cff;border-radius:50%;animation:spin .75s linear infinite;margin:0 auto 9px}@keyframes spin{to{transform:rotate(360deg)}}
      .groups{display:grid;gap:12px;max-height:410px;overflow:auto;padding-right:3px}.group h4{margin:0 0 6px;color:#8997aa;font:800 9px "Segoe UI";text-transform:uppercase;letter-spacing:.08em}.row{width:100%;min-height:57px;border:1px solid rgba(105,125,157,.18);border-radius:10px;background:linear-gradient(145deg,#08111e,#06101b);color:#eef2f8;display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:center;gap:12px;padding:9px 11px;text-align:left;cursor:pointer;margin-bottom:7px}.row:hover{border-color:#9a35e8}.row strong,.row small{display:block}.row strong{font-size:11px}.row small{margin-top:4px;color:#8491a5;font-size:9px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.row b{min-width:62px;padding:6px 8px;border-radius:999px;background:rgba(30,120,255,.13);color:#72b5ff;text-align:center;font-size:9px}.row.audio b{color:#65df90;background:rgba(36,204,100,.13)}.actions{display:flex;gap:8px;margin-top:11px}.btn{height:38px;border:1px solid rgba(111,133,164,.25);border-radius:9px;background:#091321;color:#dce4ef;padding:0 12px;font:800 10px "Segoe UI";cursor:pointer}.btn.primary{flex:1;border-color:#a642ef;background:linear-gradient(100deg,#7c16d4,#2369e5);color:#fff}.note{margin:10px 2px 0;color:#748197;font-size:9px;line-height:1.5}
    `;
  }

  function ensureHost() {
    if (state.host?.isConnected) return state.host;
    const host = document.createElement("div");
    host.id = "lumi-media-capture-host";
    const shadow = host.attachShadow({ mode: "open" });
    const icon = chrome.runtime.getURL("icon.svg");
    shadow.innerHTML = `<style>${styles()}</style><div class="root"><button class="trigger" type="button"><img src="${icon}" alt=""><span>Download with Lumi</span><span>⌄</span></button><div class="panel" hidden></div></div>`;
    document.documentElement.appendChild(host);
    state.host = host;
    state.shadow = shadow;
    shadow.querySelector(".trigger").addEventListener("click", () => togglePanel());
    shadow.querySelector(".panel").addEventListener("click", onPanelClick);
    positionHost();
    return host;
  }

  function positionHost() {
    if (!state.host?.isConnected) return;
    const videos = [...document.querySelectorAll("video")].map(video => ({ video, rect: video.getBoundingClientRect() })).filter(item => item.rect.width >= 160 && item.rect.height >= 90).sort((a, b) => b.rect.width * b.rect.height - a.rect.width * a.rect.height);
    const rect = videos[0]?.rect;
    const top = rect ? Math.max(8, Math.min(innerHeight - 58, rect.top + 8)) : 14;
    const left = rect ? Math.max(8, Math.min(innerWidth - (state.open ? 448 : 220), rect.left + 8)) : Math.max(12, innerWidth - 236);
    state.host.style.top = `${Math.round(top)}px`;
    state.host.style.left = `${Math.round(left)}px`;
  }

  function removeHost() { state.host?.remove(); state.host = null; state.shadow = null; state.open = false; state.media = null; }
  function render(content) {
    const panel = state.shadow?.querySelector(".panel");
    if (!panel) return;
    const icon = chrome.runtime.getURL("icon.svg");
    panel.hidden = false;
    panel.innerHTML = `<div class="head"><img src="${icon}" alt="Lumi"><div class="title"><strong>${esc(state.snapshot?.title || document.title || "Media")}</strong><small>Browser discovery → one Lumi Runtime</small></div><button class="close" type="button" data-action="close">×</button></div><div class="body">${content}</div>`;
  }
  function loading() { render(`<div class="state"><div><div class="spinner"></div><strong>Finding downloadable media…</strong><span>Reading this browser session and resolving available variants.</span></div></div>`); }
  function stateCard(title, message, kind = "", retry = true) { render(`<div class="state ${kind}"><div><strong>${esc(title)}</strong><span>${esc(message)}</span></div></div><div class="actions">${retry ? '<button class="btn" type="button" data-action="rescan">Scan again</button>' : ""}<button class="btn primary" type="button" data-action="close">Close</button></div>`); }

  function formatSize(value) {
    const bytes = Number(value || 0);
    if (!bytes) return "size unknown";
    if (bytes >= 1073741824) return `${(bytes / 1073741824).toFixed(1)} GB`;
    if (bytes >= 1048576) return `${(bytes / 1048576).toFixed(0)} MB`;
    return `${(bytes / 1024).toFixed(0)} KB`;
  }
  function variantTitle(item) {
    const quality = item.height ? `${item.height}p${item.fps ? ` ${Math.round(item.fps)}fps` : ""}` : item.label || (item.audio_only ? "Audio" : item.kind || "Media");
    const container = String(item.container || "").toUpperCase();
    return [quality, container].filter(Boolean).join(" · ");
  }
  function variantDetail(item) {
    const parts = [];
    if (item.video_only) parts.push("video only · Lumi merges audio when required");
    else if (item.audio_only) parts.push("audio only");
    else if (item.kind) parts.push(item.kind.toUpperCase());
    if (item.vcodec && item.vcodec !== "none") parts.push(item.vcodec);
    if (item.acodec && item.acodec !== "none") parts.push(item.acodec);
    if (item.hdr) parts.push(item.hdr);
    if (item.bitrate) parts.push(`${Math.round(item.bitrate / 1000)} kbps`);
    parts.push(formatSize(item.filesize));
    return parts.join(" · ");
  }

  function renderVariants(media) {
    const variants = Array.isArray(media.variants) ? media.variants : [];
    const groups = [
      ["Video & streams", variants.filter(item => !item.audio_only)],
      ["Audio", variants.filter(item => item.audio_only)],
    ].filter(([, rows]) => rows.length);
    const html = groups.map(([name, rows]) => `<section class="group"><h4>${esc(name)} · ${rows.length}</h4>${rows.map(item => {
      const index = variants.indexOf(item);
      return `<button class="row ${item.audio_only ? "audio" : ""}" type="button" data-variant="${index}"><span><strong>${esc(variantTitle(item))}</strong><small>${esc(variantDetail(item))}</small></span><b>${item.audio_only ? "AUDIO" : item.height ? `${item.height}p` : esc(String(item.kind || "FILE").toUpperCase())}</b></button>`;
    }).join("")}</section>`).join("");
    const subtitleCount = Array.isArray(media.subtitles) ? media.subtitles.length : 0;
    render(`<div class="groups">${html}</div><div class="actions"><button class="btn" type="button" data-action="rescan">↻ Scan again</button></div><p class="note">${variants.length} downloadable variant${variants.length === 1 ? "" : "s"}${subtitleCount ? ` · ${subtitleCount} subtitle track${subtitleCount === 1 ? "" : "s"}` : ""}. Protected/DRM streams remain unavailable rather than spinning forever.</p>`);
  }

  async function inspect() {
    if (state.busy) return;
    state.busy = true;
    state.snapshot = collectSnapshot();
    loading();
    try {
      const statusResult = await send({ type: "lumi-extension-status" }, 6000);
      const status = statusResult.status || {};
      if (!status.available) {
        stateCard("Lumi is not running", status.message || "Start Lumi DM on this computer and scan again.", "bad");
        return;
      }
      const result = await send({ type: "lumi-media-discover", snapshot: state.snapshot });
      state.media = result.media || {};
      const terminal = String(state.media.state || "error");
      if (terminal === "variants_found" && state.media.variants?.length) renderVariants(state.media);
      else if (terminal === "resolver_timeout") stateCard("Media scan timed out", "The browser observations did not produce a downloadable variant before the resolver deadline.", "bad");
      else if (terminal === "unsupported_protected") stateCard("Protected media", "This stream appears protected or DRM-controlled and Lumi will not pretend it is downloadable.", "bad", false);
      else if (terminal === "session_unavailable") stateCard("Browser session required", "The page uses session-bound/blob media and no transferable source was observable yet.", "bad");
      else if (terminal === "no_downloadable_media") stateCard("No downloadable media found", "Lumi inspected this browser session but found no supported media source.", "");
      else stateCard("Media scan failed", state.media.resolver_error || "The media resolver returned an explicit error.", "bad");
    } catch (error) {
      stateCard("Media scan failed", error.message || String(error), "bad");
    } finally {
      state.busy = false;
    }
  }

  async function stageVariant(index) {
    if (state.busy) return;
    const variant = state.media?.variants?.[Number(index)];
    if (!variant) return stateCard("Variant unavailable", "Scan the page again and choose a current media variant.", "bad");
    state.busy = true;
    render(`<div class="state"><div><div class="spinner"></div><strong>Sending to Lumi…</strong><span>The same Lumi Runtime is creating the pending download.</span></div></div>`);
    try {
      await send({ type: "lumi-media-stage", variant, snapshot: state.snapshot, filename: state.snapshot?.title || "Media" });
      stateCard("Ready in Lumi", "The Lumi widget has the pending download. Starting it there uses the same Runtime and then returns the widget to compact progress mode.", "ok", false);
    } catch (error) {
      stateCard("Download was not staged", error.message || String(error), "bad");
    } finally { state.busy = false; }
  }

  function onPanelClick(event) {
    const button = event.target.closest("button");
    if (!button) return;
    if (button.dataset.action === "close") return closePanel();
    if (button.dataset.action === "rescan") return void inspect();
    if (button.dataset.variant !== undefined) return void stageVariant(button.dataset.variant);
  }
  function closePanel() { state.open = false; const panel = state.shadow?.querySelector(".panel"); if (panel) panel.hidden = true; positionHost(); }
  function togglePanel(forceOpen = false) { state.open = forceOpen || !state.open; if (!state.open) return closePanel(); positionHost(); void inspect(); }
  function syncPresence() { if (!state.enabled || !pageHasMedia()) return removeHost(); ensureHost(); positionHost(); }
  function schedulePresence() { clearTimeout(state.mutationTimer); state.mutationTimer = setTimeout(syncPresence, 350); }

  chrome.storage.local.get(["lumiEnabled"], value => { state.enabled = value.lumiEnabled !== false; syncPresence(); });
  chrome.storage.onChanged.addListener(changes => { if (!changes.lumiEnabled) return; state.enabled = changes.lumiEnabled.newValue !== false; syncPresence(); });
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === "lumi-page-state") {
      const snapshot = collectSnapshot();
      sendResponse({ ok: true, hasMedia: pageHasMedia(), title: snapshot.title, directCount: snapshot.observations.filter(item => ["direct", "hls", "dash", "audio"].includes(item.kind)).length });
      return;
    }
    if (message?.type === "lumi-open-panel") {
      if (!pageHasMedia()) { sendResponse({ ok: false, error: "No supported media was detected on this page" }); return; }
      state.enabled = true; ensureHost(); togglePanel(true); sendResponse({ ok: true });
    }
  });

  new MutationObserver(schedulePresence).observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ["src"] });
  addEventListener("resize", positionHost, { passive: true });
  addEventListener("scroll", positionHost, { passive: true });
  setInterval(syncPresence, 2500);
})();
