"use strict";

(() => {
  if (window.top !== window.self || ["localhost", "127.0.0.1"].includes(location.hostname)) return;

  const KNOWN_MEDIA_PAGE = /youtube\.com\/watch|youtu\.be\/[\w-]{6,}|vimeo\.com\/\d+|dailymotion\.com\/video|twitch\.tv|tiktok\.com\/@[^/]+\/video|reddit\.com\/.*\/comments|facebook\.com\/.*video|instagram\.com\/(?:p|reel|tv)\//i;
  const state = {
    host: null,
    shadow: null,
    open: false,
    dismissed: false,
    busy: false,
    pageUrl: location.href,
    info: null,
    direct: [],
  };

  const escapeHtml = value => String(value ?? "").replace(/[&<>"']/g, char => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[char]));

  function send(message) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(message, response => {
        const runtimeError = chrome.runtime.lastError;
        if (runtimeError) reject(new Error(runtimeError.message));
        else if (!response?.ok) reject(new Error(response?.error || response?.result?.error || "Lumi extension request failed"));
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

  function largestVideo() {
    return visibleVideos().sort((left, right) => {
      const a = left.getBoundingClientRect();
      const b = right.getBoundingClientRect();
      return b.width * b.height - a.width * a.height;
    })[0] || null;
  }

  function directDomSources() {
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
    return [...values];
  }

  function pageHasMedia() {
    return KNOWN_MEDIA_PAGE.test(location.href)
      || visibleVideos().length > 0
      || directDomSources().length > 0
      || Boolean(document.querySelector('[itemtype*="VideoObject"],meta[property="og:type"][content*="video"]'));
  }

  function pageTitle() {
    return String(document.querySelector('meta[property="og:title"]')?.content || document.title || "Media download")
      .replace(/^\(\d+\)\s*/, "")
      .trim();
  }

  function formatBytes(value) {
    const bytes = Number(value || 0);
    if (!(bytes > 0)) return "Size unknown";
    if (bytes >= 1073741824) return `${(bytes / 1073741824).toFixed(2)} GB`;
    if (bytes >= 1048576) return `${(bytes / 1048576).toFixed(1)} MB`;
    if (bytes >= 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${bytes} B`;
  }

  function codecName(value) {
    const codec = String(value || "").toLowerCase();
    if (!codec || codec === "none") return "";
    return codec.split(".")[0].toUpperCase();
  }

  function qualityName(format) {
    const height = Number(format.height || 0);
    const fps = Number(format.fps || 0);
    if (height) return `${height}p${fps > 30 ? ` ${Math.round(fps)}fps` : ""}`;
    const note = String(format.format_note || format.format || "").trim();
    if (note) return note;
    const abr = Number(format.abr || format.tbr || 0);
    return abr ? `${Math.round(abr)} kbps` : "Media";
  }

  function normalizedFormats(info) {
    const rows = [];
    for (const format of Array.isArray(info?.formats) ? info.formats : []) {
      const id = String(format.format_id || "");
      if (!id) continue;
      const protocol = String(format.protocol || "").trim().toLowerCase();
      if (protocol && protocol !== "http" && protocol !== "https") continue;
      const videoCodec = codecName(format.vcodec);
      const audioCodec = codecName(format.acodec);
      const audioOnly = !videoCodec && Boolean(audioCodec);
      const videoOnly = Boolean(videoCodec) && !audioCodec;
      if (!videoCodec && !audioCodec) continue;
      const group = audioOnly ? "audio" : videoOnly ? "video-only" : "combined";
      rows.push({
        id,
        group,
        quality: qualityName(format),
        ext: String(format.ext || "media").toUpperCase(),
        size: Number(format.filesize || 0),
        videoCodec,
        audioCodec,
        fps: Number(format.fps || 0),
        height: Number(format.height || 0),
        bitrate: Number(format.tbr || format.abr || format.vbr || 0),
        hdr: String(format.dynamic_range || "").trim(),
        language: String(format.language || "").trim(),
        protocol,
      });
    }
    rows.sort((left, right) => {
      const order = { combined: 0, "video-only": 1, audio: 2 };
      return order[left.group] - order[right.group]
        || right.height - left.height
        || right.fps - left.fps
        || right.bitrate - left.bitrate
        || right.size - left.size;
    });
    const seen = new Set();
    return rows.filter(row => {
      const key = `${row.group}|${row.height}|${row.fps}|${row.ext}|${row.videoCodec}|${row.audioCodec}|${Math.round(row.bitrate)}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }).slice(0, 28);
  }

  function subtitleLanguages(info) {
    const result = [];
    for (const [language, values] of Object.entries(info?.subtitles || {})) {
      const rows = Array.isArray(values) ? values : [];
      if (!rows.length) continue;
      result.push({
        language,
        automatic: rows.every(row => row.source === "automatic_captions"),
        formats: [...new Set(rows.map(row => String(row.ext || "").toUpperCase()).filter(Boolean))].slice(0, 4),
      });
    }
    return result.slice(0, 12);
  }

  function styles() {
    return `
      :host{all:initial;position:fixed;z-index:2147483647;font-family:"Segoe UI",Inter,Arial,sans-serif;color:#f5f7fc;line-height:1.35}
      *{box-sizing:border-box}.root{position:relative}.trigger{height:35px;border:1px solid rgba(180,74,255,.72);border-radius:8px;background:linear-gradient(100deg,rgba(52,11,92,.97),rgba(6,39,82,.97));color:#fff;display:flex;align-items:center;gap:7px;padding:0 10px 0 6px;font:700 11px "Segoe UI",Arial;cursor:pointer;box-shadow:0 8px 26px rgba(0,0,0,.48);backdrop-filter:blur(14px)}
      .trigger:hover{filter:brightness(1.1)}.trigger img{width:24px;height:24px;object-fit:contain}.trigger .chevron{color:#d7b5ff}.panel{width:430px;margin-top:7px;border:1px solid rgba(126,149,184,.3);border-radius:13px;background:radial-gradient(circle at 96% 0,rgba(20,143,255,.14),transparent 30%),radial-gradient(circle at 0 100%,rgba(169,44,255,.15),transparent 34%),linear-gradient(145deg,rgba(7,13,24,.99),rgba(2,7,14,.995));box-shadow:0 24px 72px rgba(0,0,0,.72);overflow:hidden;backdrop-filter:blur(20px)}
      .head{display:flex;align-items:center;gap:10px;padding:12px 13px;border-bottom:1px solid rgba(255,255,255,.07)}.head img{width:34px;height:34px;object-fit:contain}.title{min-width:0;flex:1}.title strong{display:block;font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.title small{display:block;margin-top:3px;color:#8794a8;font-size:9px}.close{width:28px;height:28px;border:1px solid rgba(111,133,166,.22);border-radius:8px;background:#07101d;color:#aeb9ca;font-size:16px;cursor:pointer}.safe{padding:7px 12px;border-bottom:1px solid rgba(255,255,255,.055);background:rgba(7,33,23,.34);color:#7ee5a1;font-size:9px}.body{padding:10px;max-height:430px;overflow:auto}.section{margin:8px 2px 5px;color:#8794a8;font-size:9px;font-weight:800;text-transform:uppercase;letter-spacing:.09em}.row{width:100%;min-height:52px;border:1px solid rgba(105,125,157,.18);border-radius:9px;background:linear-gradient(145deg,#08111e,#06101b);color:#eef2f8;display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:center;gap:12px;padding:8px 10px;margin-bottom:6px;text-align:left;cursor:pointer}.row:hover{border-color:#9a35e8;background:rgba(74,17,124,.34)}.row.best{border-color:rgba(168,44,255,.34);background:linear-gradient(100deg,rgba(76,17,128,.38),rgba(8,31,66,.6))}.row.audio{border-color:rgba(42,196,99,.23)}.row.subtitle{border-color:rgba(241,181,58,.22)}.primary{display:block;font-size:11px;font-weight:750}.detail{display:block;margin-top:4px;color:#8794a8;font-size:9px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.badge{min-width:69px;padding:6px 8px;border-radius:999px;background:rgba(30,120,255,.13);color:#72b5ff;text-align:center;font-size:9px;font-weight:800}.row.audio .badge{background:rgba(36,204,100,.13);color:#65df90}.row.subtitle .badge{background:rgba(241,181,58,.12);color:#f1c56e}.state{min-height:94px;border:1px solid rgba(104,124,155,.18);border-radius:10px;background:#07101c;display:grid;place-items:center;text-align:center;padding:14px;color:#9aa6b9;font-size:10px}.state strong{display:block;color:#eef3fa;font-size:12px;margin-bottom:5px}.state.bad{border-color:rgba(255,82,96,.25);color:#ff98a1}.spinner{width:26px;height:26px;border:3px solid rgba(124,145,177,.2);border-top-color:#a82cff;border-right-color:#159cff;border-radius:50%;animation:spin .75s linear infinite;margin:0 auto 9px}@keyframes spin{to{transform:rotate(360deg)}}
    `;
  }

  function ensureHost() {
    if (state.host?.isConnected) return;
    const host = document.createElement("div");
    host.id = "lumi-media-quality-picker";
    const shadow = host.attachShadow({ mode: "open" });
    const icon = chrome.runtime.getURL("icons/icon48.png");
    shadow.innerHTML = `<style>${styles()}</style><div class="root"><button class="trigger" type="button" aria-label="Download this video with Lumi"><img src="${icon}" alt=""><span>Download this video</span><span class="chevron">⌄</span></button><section class="panel" hidden></section></div>`;
    document.documentElement.appendChild(host);
    state.host = host;
    state.shadow = shadow;
    shadow.querySelector(".trigger").addEventListener("click", () => toggle());
    shadow.querySelector(".panel").addEventListener("click", event => void panelClick(event));
    positionHost();
  }

  function positionHost() {
    if (!state.host?.isConnected) return;
    const video = largestVideo();
    const width = state.open ? 448 : 190;
    let top = 12;
    let left = 12;
    if (video) {
      const rect = video.getBoundingClientRect();
      top = Math.max(8, Math.min(window.innerHeight - 45, rect.top + 8));
      left = Math.max(8, Math.min(window.innerWidth - width, rect.left + 8));
    }
    state.host.style.top = `${Math.round(top)}px`;
    state.host.style.left = `${Math.round(left)}px`;
  }

  function renderShell(content) {
    const panel = state.shadow?.querySelector(".panel");
    if (!panel) return;
    const icon = chrome.runtime.getURL("icons/icon48.png");
    panel.hidden = false;
    panel.innerHTML = `<div class="head"><img src="${icon}" alt="Lumi"><div class="title"><strong title="${escapeHtml(pageTitle())}">${escapeHtml(pageTitle())}</strong><small>Choose the exact quality. Lumi remains the download manager.</small></div><button class="close" type="button" data-action="close" aria-label="Close quality list">×</button></div><div class="safe">Nothing starts until the normal Lumi setup is confirmed.</div><div class="body">${content}</div>`;
  }

  function loading() {
    renderShell('<div class="state"><div><div class="spinner"></div><strong>Finding available qualities…</strong><span>Lumi is reading the current page and media formats.</span></div></div>');
  }

  function detail(row) {
    const codecs = [row.videoCodec, row.audioCodec].filter(Boolean).join(" + ") || "Codec unknown";
    const extras = [codecs, row.hdr && row.hdr !== "SDR" ? row.hdr : "", row.language, formatBytes(row.size)].filter(Boolean);
    return extras.join(" · ");
  }

  function rowHtml(row) {
    const formatId = row.group === "video-only" ? `${row.id}+bestaudio/best` : row.id;
    const label = row.group === "video-only" ? `${row.quality} · ${row.ext}` : `${row.quality} · ${row.ext}`;
    const note = row.group === "video-only" ? `Video stream + best audio merge · ${detail(row)}` : detail(row);
    return `<button class="row ${row.group === "audio" ? "audio" : ""}" type="button" data-stage="format" data-format="${escapeHtml(formatId)}" data-audio="${row.group === "audio" ? "1" : "0"}" data-video-only="0"><span><span class="primary">${escapeHtml(label)}</span><span class="detail">${escapeHtml(note)}</span></span><span class="badge">${escapeHtml(row.group === "audio" ? "AUDIO" : row.quality)}</span></button>`;
  }

  function renderChoices() {
    const formats = normalizedFormats(state.info);
    const groups = {
      combined: formats.filter(row => row.group === "combined"),
      "video-only": formats.filter(row => row.group === "video-only"),
      audio: formats.filter(row => row.group === "audio"),
    };
    const subtitles = subtitleLanguages(state.info);
    const direct = state.direct.slice(0, 8);
    let html = '<button class="row best" type="button" data-stage="format" data-format="bestvideo+bestaudio/best" data-audio="0" data-video-only="0"><span><span class="primary">Best available quality</span><span class="detail">Lumi chooses the best video and audio combination</span></span><span class="badge">BEST</span></button>';
    const addGroup = (title, rows) => {
      if (!rows.length) return;
      html += `<div class="section">${escapeHtml(title)}</div>${rows.map(rowHtml).join("")}`;
    };
    addGroup("Video + audio", groups.combined);
    addGroup("Higher video qualities — Lumi merges audio", groups["video-only"]);
    addGroup("Audio only", groups.audio);
    if (subtitles.length) {
      html += '<div class="section">Subtitles</div>' + subtitles.map(item => `<button class="row subtitle" type="button" data-stage="subtitle" data-language="${escapeHtml(item.language)}"><span><span class="primary">${escapeHtml(item.language)}</span><span class="detail">${escapeHtml(item.automatic ? "Automatic captions" : "Creator subtitles")} · ${escapeHtml(item.formats.join(", ") || "available")}</span></span><span class="badge">SUBTITLE</span></button>`).join("");
    }
    if (direct.length) {
      html += '<div class="section">Captured direct streams</div>' + direct.map((url, index) => `<button class="row" type="button" data-stage="direct" data-url="${escapeHtml(url)}"><span><span class="primary">Direct media source ${index + 1}</span><span class="detail">${escapeHtml(url)}</span></span><span class="badge">STREAM</span></button>`).join("");
    }
    renderShell(html);
  }

  async function loadChoices() {
    state.busy = true;
    loading();
    try {
      const [infoResult, sniffedResult] = await Promise.allSettled([
        send({ type: "LUMI_MEDIA_INFO", url: location.href }),
        send({ type: "GET_SNIFFED_MEDIA" }),
      ]);
      state.info = infoResult.status === "fulfilled" ? infoResult.value.info : null;
      const sniffed = sniffedResult.status === "fulfilled" ? sniffedResult.value.urls || [] : [];
      state.direct = [...new Set([...sniffed, ...directDomSources()])].filter(url => /^https?:/i.test(url));
      if (!state.info && !state.direct.length) {
        throw new Error(infoResult.status === "rejected" ? infoResult.reason.message : "No downloadable media was found");
      }
      renderChoices();
    } catch (error) {
      renderShell(`<div class="state bad"><div><strong>Could not list media qualities</strong><span>${escapeHtml(error.message)}</span></div></div>`);
    } finally {
      state.busy = false;
    }
  }

  async function stage(button) {
    if (state.busy) return;
    state.busy = true;
    const kind = button.dataset.stage;
    const message = {
      type: "LUMI_MEDIA_STAGE",
      url: kind === "direct" ? button.dataset.url : location.href,
      title: pageTitle(),
      filename: pageTitle(),
      format_id: button.dataset.format || "bestvideo+bestaudio/best",
      audio_only: button.dataset.audio === "1",
      video_only: button.dataset.videoOnly === "1",
      subtitles: kind === "subtitle",
      subtitle_languages: kind === "subtitle" ? [button.dataset.language] : [],
      referrer: location.href,
    };
    renderShell('<div class="state"><div><div class="spinner"></div><strong>Opening Lumi setup…</strong><span>The selected quality is being persisted into the Lumi handoff.</span></div></div>');
    try {
      await send(message);
      renderShell('<div class="state"><div><strong>Ready in Lumi</strong><span>Finish the download in the normal Lumi setup popup.</span></div></div>');
      setTimeout(() => closePanel(), 900);
    } catch (error) {
      renderShell(`<div class="state bad"><div><strong>Lumi could not stage this quality</strong><span>${escapeHtml(error.message)}</span></div></div>`);
    } finally {
      state.busy = false;
    }
  }

  async function panelClick(event) {
    const button = event.target.closest("button");
    if (!button) return;
    if (button.dataset.action === "close") return closePanel();
    if (button.dataset.stage) await stage(button);
  }

  function closePanel() {
    state.open = false;
    const panel = state.shadow?.querySelector(".panel");
    if (panel) panel.hidden = true;
    positionHost();
  }

  function toggle() {
    if (state.open) return closePanel();
    state.open = true;
    positionHost();
    void loadChoices();
  }

  function removeHost() {
    state.host?.remove();
    state.host = null;
    state.shadow = null;
    state.open = false;
    state.info = null;
    state.direct = [];
  }

  function refresh() {
    if (location.href !== state.pageUrl) {
      state.pageUrl = location.href;
      state.dismissed = false;
      removeHost();
    }
    if (state.dismissed || !pageHasMedia()) {
      if (state.host) removeHost();
      return;
    }
    ensureHost();
    positionHost();
  }

  window.addEventListener("resize", positionHost, { passive: true });
  window.addEventListener("scroll", positionHost, { passive: true });
  document.addEventListener("play", refresh, true);
  new MutationObserver(() => {
    clearTimeout(state.mutationTimer);
    state.mutationTimer = setTimeout(refresh, 250);
  }).observe(document.documentElement, { childList: true, subtree: true });
  setInterval(refresh, 900);
  setTimeout(refresh, 700);
})();