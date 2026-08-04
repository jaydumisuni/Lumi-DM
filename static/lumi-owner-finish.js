"use strict";

(() => {
  if (new URLSearchParams(location.search).has("preview")) return;

  let pendingDownload = null;
  const $ = selector => document.querySelector(selector);
  const escapeHtml = value => String(value ?? "").replace(/[&<>"']/g, character => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[character]));

  async function api(path, options = {}) {
    const request = {
      method: options.method || "GET",
      credentials: "same-origin",
      headers: { "X-Lumi-Client": "owner-finish-v1", ...(options.headers || {}) },
    };
    if (options.body !== undefined) {
      request.headers["Content-Type"] = "application/json";
      request.body = JSON.stringify(options.body);
    }
    let response = await fetch(path, request);
    if (response.status === 401) {
      await fetch("/api/security/bootstrap", {
        credentials: "same-origin",
        headers: { "X-Lumi-Client": "owner-finish-v1" },
      });
      response = await fetch(path, request);
    }
    const text = await response.text();
    let data = {};
    try { data = text ? JSON.parse(text) : {}; } catch { data = { error: text }; }
    if (!response.ok) {
      const error = new Error(data.error || `Lumi request failed (${response.status})`);
      error.status = response.status;
      error.data = data;
      throw error;
    }
    return data;
  }

  function modalHeader(title) {
    if (typeof window.modalHeader === "function") return window.modalHeader(title);
    return `<div class="modal-head"><h2>${escapeHtml(title)}</h2><button class="modal-close" data-close-modal aria-label="Close">×</button></div>`;
  }

  function showNewDownload(prefill = "") {
    pendingDownload = null;
    const settings = window.LumiReplica?.state?.settings || {};
    const target = settings.default_dir || "";
    window.showModal?.(`${modalHeader("New Download")}<div class="modal-body">
      <div class="field"><label>Download URL</label><input id="owner-final-url" value="${escapeHtml(prefill)}" placeholder="https://example.com/file.iso"></div>
      <div class="form-row"><div class="field"><label>Category</label><select id="owner-final-category"><option value="other">Uncategorized</option><option value="operating-systems">Operating Systems</option><option value="utilities">Utilities</option><option value="software">Software</option><option value="mobile-firmware">Mobile Firmware</option><option value="video">Video</option></select></div><div class="field"><label>Connections</label><input id="owner-final-connections" type="number" min="1" max="128" value="32"></div></div>
      <div class="field"><label>Save to</label><input id="owner-final-target" value="${escapeHtml(target)}" placeholder="Choose your download folder"></div>
      <div class="modal-actions"><button class="btn" data-close-modal>Cancel</button><button class="btn primary" data-owner-final-start>Start Download</button></div>
    </div>`);
    setTimeout(() => document.getElementById("owner-final-url")?.focus(), 0);
  }

  function collectRequest() {
    if (pendingDownload) return { ...pendingDownload };
    const url = String($("#owner-final-url")?.value || "").trim();
    const targetDir = String($("#owner-final-target")?.value || "").trim();
    const connections = Math.max(1, Math.min(128, Number($("#owner-final-connections")?.value || 32)));
    const categoryId = String($("#owner-final-category")?.value || "other");
    if (!url) throw new Error("Enter a download URL");
    if (!targetDir) throw new Error("Choose a download folder");
    return { url, targetDir, connections, categoryId };
  }

  function isMedia(request) {
    return request.categoryId === "video"
      || /(?:youtube\.com|youtu\.be|vimeo\.com|dailymotion\.com)/i.test(request.url)
      || /\.(?:m3u8|mpd)(?:[?#]|$)/i.test(request.url);
  }

  function showDuplicateChoice() {
    window.showModal?.(`${modalHeader("File already exists")}<div class="modal-body"><p>This exact file already exists in the selected folder. Choose what Lumi should do now.</p><div class="modal-actions" style="display:grid;grid-template-columns:1fr 1fr;gap:8px"><button class="btn" data-owner-final-duplicate="rename">Keep both</button><button class="btn danger" data-owner-final-duplicate="overwrite">Replace existing file</button><button class="btn" style="grid-column:1/-1" data-close-modal>Cancel</button></div></div>`);
  }

  async function startDownload(policy = "reject") {
    let request;
    try { request = collectRequest(); }
    catch (error) { window.toast?.(error.message, "bad"); return; }
    pendingDownload = request;
    try {
      if (isMedia(request)) {
        await api("/api/downloads/video", {
          method: "POST",
          body: {
            url: request.url,
            target_dir: request.targetDir,
            format_id: "bestvideo+bestaudio/best",
            queue_id: "default",
            category_id: "video",
            start_paused: false,
          },
        });
      } else {
        await api("/api/downloads/start", {
          method: "POST",
          body: {
            url: request.url,
            target_dir: request.targetDir,
            filename: "",
            queue_id: "default",
            category_id: request.categoryId,
            connections: request.connections,
            duplicate_policy: policy,
            overwrite: policy === "overwrite",
            start_paused: false,
          },
        });
      }
      pendingDownload = null;
      window.closeModal?.();
      if (window.LumiReplica?.state) window.LumiReplica.state.view = "downloads";
      await window.maybeLoadProductionData?.();
      window.LumiReplica?.render();
      window.toast?.("Download started", "good");
    } catch (error) {
      if (error.status === 409 || /DUPLICATE_FILE|already exists|duplicate/i.test(error.message)) {
        showDuplicateChoice();
        return;
      }
      pendingDownload = null;
      window.toast?.(error.message, "bad");
    }
  }

  function normalizeVisibleStatus(root = document) {
    const candidates = root.querySelectorAll?.(".status-pill,.status-text,.task-status,.row-meta,.task-meta,.dl-pct") || [];
    for (const node of candidates) {
      if (/^resolving$/i.test(String(node.textContent || "").trim())) node.textContent = "Downloading";
      else if (/\bresolving\b/i.test(String(node.textContent || ""))) node.textContent = String(node.textContent).replace(/resolving/ig, "downloading");
    }
  }

  function wrapLiveTaskMapper() {
    const original = window.mapLiveTask;
    if (typeof original !== "function" || original.__ownerWrapped) return;
    const wrapped = function (...args) {
      const task = original.apply(this, args);
      const status = String(task?.status || "").toLowerCase();
      if (["resolving", "verifying", "post_processing", "running"].includes(status)) task.status = "downloading";
      return task;
    };
    wrapped.__ownerWrapped = true;
    window.mapLiveTask = wrapped;
  }

  document.addEventListener("click", event => {
    const openNew = event.target.closest("[data-open-new]");
    if (openNew) {
      event.preventDefault();
      event.stopImmediatePropagation();
      showNewDownload();
      return;
    }
    const openLink = event.target.closest("[data-open-link]");
    if (openLink) {
      event.preventDefault();
      event.stopImmediatePropagation();
      showNewDownload("https://");
      return;
    }
    const start = event.target.closest("[data-owner-final-start]");
    if (start) {
      event.preventDefault();
      event.stopImmediatePropagation();
      void startDownload("reject");
      return;
    }
    const duplicate = event.target.closest("[data-owner-final-duplicate]");
    if (duplicate) {
      event.preventDefault();
      event.stopImmediatePropagation();
      void startDownload(duplicate.dataset.ownerFinalDuplicate);
    }
  }, true);

  const observer = new MutationObserver(records => {
    wrapLiveTaskMapper();
    for (const record of records) {
      for (const node of record.addedNodes) if (node.nodeType === Node.ELEMENT_NODE) normalizeVisibleStatus(node);
    }
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
  wrapLiveTaskMapper();
  normalizeVisibleStatus();
})();
