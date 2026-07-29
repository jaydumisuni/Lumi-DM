"use strict";
(() => {
  const UI = window.LumiMainUI = window.LumiMainUI || {};
  const EXTENSION_PROMPT_KEY = "LUMI.extensionNotice.dismissed";
  const NOTIFY_KEY = "LUMI.notifications.downloadComplete";
  const TOOLS_URL = "https://thetechguyds.com/tools";
  const CONNECTIONS = [4, 8, 16, 24, 32, 48, 64, 96, 128];
  const ACTIVE = new Set(["running", "resolving", "verifying", "post_processing", "pausing"]);
  const UNFINISHED = new Set(["staged", "queued", "resolving", "running", "pausing", "paused", "needs_link", "verifying", "post_processing", "failed", "cancelling"]);
  const BRAND = Object.freeze({
    windows: "/static/brand/windows.svg",
    apple: "/static/brand/apple.svg",
    android: "/static/brand/android.svg",
    ubuntu: "/static/brand/ubuntu.svg",
    linux: "/static/brand/linux.svg",
    archive: "/static/brand/archive.svg",
    lumi: "/static/favicon-96.png",
  });

  const h = value => typeof esc === "function"
    ? esc(value)
    : String(value ?? "").replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
  const number = value => Number(value || 0);
  const rate = value => typeof fmtRate === "function" ? fmtRate(number(value)) : `${(number(value) / 1048576).toFixed(1)} MB/s`;
  const bytes = value => typeof fmtBytes === "function" ? fmtBytes(number(value)) : `${(number(value) / 1048576).toFixed(1)} MB`;
  const date = value => typeof fmtDate === "function" && value ? fmtDate(value) : (value ? String(value) : "—");
  const pct = task => Math.max(0, Math.min(100, typeof progress === "function" ? Number(progress(task)) : number(task.downloaded_bytes) / Math.max(1, number(task.total_bytes)) * 100));
  const label = status => typeof statusLabel === "function" ? statusLabel(status) : String(status || "").replaceAll("_", " ");
  const tasks = () => typeof state !== "undefined" && Array.isArray(state.tasks) ? state.tasks : [];
  const queues = () => typeof state !== "undefined" && Array.isArray(state.queues) ? state.queues : [];
  const categories = () => typeof state !== "undefined" && Array.isArray(state.categories) ? state.categories : [];

  function bindTechnicianGroup() {
    const group = document.querySelector(".nav-group");
    const toggle = group?.querySelector(".nav-group-toggle");
    if (!group || !toggle || group.dataset.bound === "true") return;
    group.classList.remove("open");
    toggle.setAttribute("aria-expanded", "false");
    toggle.addEventListener("click", () => {
      const open = !group.classList.contains("open");
      group.classList.toggle("open", open);
      toggle.setAttribute("aria-expanded", String(open));
    });
    group.querySelectorAll(".nav-submenu .nav-item").forEach(item => item.addEventListener("click", () => {
      group.classList.add("open");
      toggle.setAttribute("aria-expanded", "true");
    }));
    document.querySelectorAll(".nav-list > .nav-item").forEach(item => item.addEventListener("click", () => {
      group.classList.remove("open");
      toggle.setAttribute("aria-expanded", "false");
    }));
    group.dataset.bound = "true";
  }

  function installViewMetadata() {
    try {
      Object.assign(viewMeta, {
        overview: ["Overview", "Complete summary of your download activity"],
        downloads: ["All Downloads", "Every download in one organised view"],
        unfinished: ["Unfinished", "Active, paused and queued downloads"],
        finished: ["Finished", "Successfully completed downloads"],
        queues: ["Queues", "Control download order, schedules and limits"],
        categories: ["Categories", "Organise downloads automatically by type"],
        grabber: ["LinkGrabber", "Collect links, inspect them and start downloads"],
        settings: ["Settings", "Lumi preferences and tool health"],
      });
    } catch (_) {}
  }

  function iconSvg(kind) {
    const paths = {
      download: '<path d="M12 3v12m-5-5 5 5 5-5M4 20h16"/>',
      check: '<circle cx="12" cy="12" r="9"/><path d="m8 12 2.5 2.5L16 9"/>',
      clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
      plus: '<path d="M12 4v16M4 12h16"/>',
      link: '<path d="M10 13a5 5 0 0 0 7.1.1l2-2a5 5 0 0 0-7.1-7.1M14 11a5 5 0 0 0-7.1-.1l-2 2A5 5 0 0 0 12 20l1.1-1.1"/>',
      folder: '<path d="M3 7.5h7l2-2h9v14H3z"/>',
      gear: '<circle cx="12" cy="12" r="3"/><path d="M19 12a7 7 0 0 0-.1-1l2-1.5-2-3.5-2.4 1a7 7 0 0 0-1.7-1L14.5 3h-5L9 6a7 7 0 0 0-1.7 1L5 6 3 9.5 5 11a7 7 0 0 0 0 2l-2 1.5L5 18l2.3-1a7 7 0 0 0 1.7 1l.5 3h5l.5-3a7 7 0 0 0 1.7-1l2.3 1 2-3.5-2-1.5a7 7 0 0 0 .1-1Z"/>',
      queue: '<path d="m12 3 8 4-8 4-8-4 8-4Z"/><path d="m4 12 8 4 8-4M4 17l8 4 8-4"/>',
    };
    return `<svg viewBox="0 0 24 24">${paths[kind] || paths.download}</svg>`;
  }

  function spark(color) {
    return `<svg class="lumi-spark" viewBox="0 0 180 34" preserveAspectRatio="none"><polyline points="0,22 12,27 24,20 36,24 48,18 60,25 72,21 84,24 96,17 108,26 120,19 132,23 144,16 156,25 168,21 180,24" style="stroke:${color}"/></svg>`;
  }

  function stat(css, title, value, note, kind, color) {
    return `<article class="lumi-stat ${css}"><div class="lumi-stat-top"><div class="lumi-stat-icon">${iconSvg(kind)}</div><div class="lumi-stat-copy"><small>${h(title)}</small><strong>${h(value)}</strong><span>${h(note)}</span></div></div>${spark(color)}</article>`;
  }

  function assetFor(filename, category = "") {
    const text = `${filename || ""} ${category || ""}`.toLowerCase();
    if (text.includes("ventoy") || /\.(zip|rar|7z|tar|gz|xz)(\s|$)/.test(text)) return BRAND.archive;
    if (text.includes("ubuntu")) return BRAND.ubuntu;
    if (text.includes("macos") || text.includes("dmg") || text.includes("iphone") || text.includes("ipad") || text.includes("apple") || text.includes("ipsw")) return BRAND.apple;
    if (text.includes("android") || text.includes("apk")) return BRAND.android;
    if (text.includes("windows") || text.includes("win10") || text.includes("win11") || text.includes(".exe") || text.includes(".msi")) return BRAND.windows;
    if (text.includes("linux") || text.includes("debian") || text.includes("fedora") || text.includes("mint")) return BRAND.linux;
    return BRAND.lumi;
  }

  Object.assign(UI, { EXTENSION_PROMPT_KEY, NOTIFY_KEY, TOOLS_URL, CONNECTIONS, ACTIVE, UNFINISHED, BRAND, h, number, rate, bytes, date, pct, label, tasks, queues, categories, bindTechnicianGroup, installViewMetadata, iconSvg, spark, stat, assetFor });
})();
