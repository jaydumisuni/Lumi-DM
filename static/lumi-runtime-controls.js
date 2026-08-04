"use strict";

(() => {
  const ACTIVE = new Set(["running", "downloading", "resolving", "verifying", "post_processing", "pausing"]);
  const QUEUED = new Set(["queued", "browser_pending", "staged"]);
  const speedSamples = Array(28).fill(0);
  const selected = new Set();
  let refreshing = false;
  let decorating = false;
  let lastSampleAt = 0;

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const state = () => window.LumiReplica?.state;
  const rawStatus = task => String(task?._runtimeStatus || task?.raw?.status || task?.status || "queued").toLowerCase();
  const publicStatus = value => ACTIVE.has(String(value || "").toLowerCase()) ? "downloading" : String(value || "queued").toLowerCase();
  const finite = value => Number.isFinite(Number(value)) ? Number(value) : 0;
  const escapeHtml = value => String(value ?? "").replace(/[&<>"']/g, char => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[char]));

  function formatRate(value) {
    const bps = Math.max(0, finite(value));
    if (bps >= 1073741824) return `${(bps / 1073741824).toFixed(2)} GB/s`;
    if (bps >= 1048576) return `${(bps / 1048576).toFixed(2)} MB/s`;
    if (bps >= 1024) return `${(bps / 1024).toFixed(1)} KB/s`;
    return `${Math.round(bps)} B/s`;
  }

  async function api(path, options = {}) {
    const request = {
      method: options.method || "GET",
      credentials: "same-origin",
      headers: { "X-Lumi-Client": "approved-ui-owner-runtime-v7", ...(options.headers || {}) },
    };
    if (options.body !== undefined) {
      request.headers["Content-Type"] = "application/json";
      request.body = JSON.stringify(options.body);
    }
    let response = await fetch(path, request);
    if (response.status === 401) {
      await fetch("/api/security/bootstrap", {
        credentials: "same-origin",
        headers: { "X-Lumi-Client": "approved-ui-owner-runtime-v7" },
      });
      response = await fetch(path, request);
    }
    const text = await response.text();
    let data = {};
    try { data = text ? JSON.parse(text) : {}; } catch { data = { error: text }; }
    if (!response.ok) {
      const error = new Error(data.error || `${request.method} ${path} failed (${response.status})`);
      error.status = response.status;
      error.data = data;
      throw error;
    }
    return data;
  }

  function liveTasks() {
    return (state()?.tasks || []).filter(task => ACTIVE.has(rawStatus(task)));
  }

  function liveBytesPerSecond() {
    return liveTasks().reduce((sum, task) => sum + finite(task.raw?.speed_bytes_per_sec ?? task.speed_bytes_per_sec), 0);
  }

  function normalizeTasks() {
    const current = state();
    if (!current?.tasks) return;
    current.settings = { ...(current.settings || {}), default_connections: 32 };
    for (const task of current.tasks) {
      const raw = String(task.raw?.status || task._runtimeStatus || task.status || "queued").toLowerCase();
      task._runtimeStatus = raw;
      task.status = publicStatus(raw);
      task.speed_bytes_per_sec = finite(task.raw?.speed_bytes_per_sec ?? task.speed_bytes_per_sec);
      task.speed = ACTIVE.has(raw) ? formatRate(task.speed_bytes_per_sec) : (raw === "paused" ? "Paused" : "—");
      if (task.raw && !task.progress && task.raw.total_bytes) {
        task.progress = Math.max(0, Math.min(100, Math.round(finite(task.raw.downloaded_bytes) * 100 / finite(task.raw.total_bytes))));
      }
    }
  }

  function recordSpeedSample(force = false) {
    const now = Date.now();
    if (!force && now - lastSampleAt < 1000) return;
    lastSampleAt = now;
    speedSamples.push(liveBytesPerSecond());
    while (speedSamples.length > 28) speedSamples.shift();
  }

  function patchSpeedPanel() {
    const current = state();
    if (current?.view !== "overview") return;
    const live = liveBytesPerSecond();
    const formatted = formatRate(live);
    const [number, ...unitParts] = formatted.split(" ");
    const value = $(".speed-value");
    if (value) value.innerHTML = `${escapeHtml(number)} <small>${escapeHtml(unitParts.join(" "))}</small>`;
    const subtitle = $(".speed-sub");
    if (subtitle) subtitle.textContent = live > 0 ? "Current Lumi download speed" : "No active downloads";

    const metrics = $$(".speed-metric");
    if (metrics[0]) {
      const label = $("small", metrics[0]);
      const output = $("b", metrics[0]);
      if (label) label.textContent = "Live download";
      if (output) output.textContent = formatted;
    }
    if (metrics[1]) {
      const label = $("small", metrics[1]);
      const output = $("b", metrics[1]);
      if (label) label.textContent = "Upload";
      if (output) output.textContent = "Not measured";
    }
    if (metrics[2]) {
      const label = $("small", metrics[2]);
      const output = $("b", metrics[2]);
      if (label) label.textContent = "Latency";
      if (output) output.textContent = "Not measured";
    }

    const max = Math.max(1, ...speedSamples);
    const bars = $$(".bars-wrap i");
    bars.forEach((bar, index) => {
      const sampleIndex = Math.max(0, speedSamples.length - bars.length + index);
      const sample = speedSamples[sampleIndex] || 0;
      bar.style.height = `${sample > 0 ? Math.max(4, sample * 100 / max) : 2}%`;
      bar.title = formatRate(sample);
    });

    const axis = $$(".speed-axis span");
    const axisValues = [max, max * .75, max * .5, max * .25, 0];
    axis.forEach((node, index) => { node.textContent = formatRate(axisValues[index] || 0); });

    const best = $(".best-speed b");
    if (best) best.textContent = formatRate(Math.max(...speedSamples));
  }

  function patchCounts() {
    const current = state();
    if (!current?.tasks) return;
    const counts = { active: 0, completed: 0, queued: 0, failed: 0 };
    for (const task of current.tasks) {
      const status = rawStatus(task);
      if (ACTIVE.has(status)) counts.active += 1;
      else if (status === "completed") counts.completed += 1;
      else if (QUEUED.has(status)) counts.queued += 1;
      else if (["failed", "cancelled"].includes(status)) counts.failed += 1;
    }
    if (current.view === "overview") {
      const cards = $$(".stat-grid .stat-card");
      [current.tasks.length, counts.active, counts.completed, counts.queued].forEach((value, index) => {
        const output = cards[index]?.querySelector("strong");
        if (output) output.textContent = String(value);
      });
      const donutTotal = $(".donut strong");
      if (donutTotal) donutTotal.textContent = String(current.tasks.length);
      const legendRows = $$(".legend-row");
      [counts.completed, counts.active, counts.queued, counts.failed].forEach((value, index) => {
        const output = legendRows[index]?.querySelector("strong");
        if (output) output.textContent = `${value}  (${current.tasks.length ? (value * 100 / current.tasks.length).toFixed(1) : "0.0"}%)`;
      });
    }
  }

  function injectStyle() {
    if ($("#lumi-owner-runtime-style")) return;
    const style = document.createElement("style");
    style.id = "lumi-owner-runtime-style";
    style.textContent = `
      .lumi-download-toolbar{display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:10px 12px;margin-bottom:10px;border:1px solid rgba(103,124,161,.28);border-radius:10px;background:rgba(7,16,32,.76)}
      .lumi-download-toolbar .selection-count{margin-left:auto;color:#aab4c6;font-size:12px}
      .lumi-select-cell{width:38px!important;text-align:center!important;padding:0 7px!important}
      .lumi-select-cell input{width:16px;height:16px;accent-color:#962dff}
      .lumi-delete-action{color:#ff6978!important}
      .lumi-dialog-choice{display:grid;gap:8px;margin-top:14px}
      .lumi-dialog-choice .btn{width:100%;justify-content:center}
      .lumi-connected-card{border:1px solid rgba(103,123,160,.29);border-radius:11px;background:#081324;padding:14px 16px;min-height:180px}
      .lumi-connected-card h3{margin:0 0 10px;font-size:18px}.lumi-connected-card p{color:#aeb6c5;font-size:13px;line-height:1.5}
      body.light-glass .lumi-download-toolbar,body.light-glass .lumi-connected-card{background:rgba(255,255,255,.27);border-color:rgba(255,255,255,.74);color:#101326}
    `;
    document.head.append(style);
  }

  function taskIdForRow(row) {
    return row.querySelector("[data-task]")?.dataset.task || row.dataset.runtimeTask || "";
  }

  function decorateDownloads() {
    const current = state();
    if (!current || !["downloads", "unfinished"].includes(current.view)) return;
    const page = $("#content .page");
    const panel = $(".table-panel", page);
    const table = $("table", panel);
    if (!page || !panel || !table) return;

    let toolbar = $(".lumi-download-toolbar", page);
    if (!toolbar) {
      toolbar = document.createElement("div");
      toolbar.className = "lumi-download-toolbar";
      toolbar.innerHTML = `
        <button class="btn small" data-runtime-action="refresh">↻ Refresh</button>
        <button class="btn small" data-runtime-action="pause-all">Ⅱ Pause all</button>
        <button class="btn small" data-runtime-action="resume-all">▶ Resume all</button>
        <button class="btn small" data-runtime-action="clear-done">Clear completed</button>
        <button class="btn small danger" data-runtime-action="remove-selected">Remove selected</button>
        <button class="btn small danger" data-runtime-action="delete-files-selected">Delete files selected</button>
        <span class="selection-count">${selected.size ? `${selected.size} selected` : "Select downloads below"}</span>`;
      page.insertBefore(toolbar, panel);
    } else {
      const count = $(".selection-count", toolbar);
      if (count) count.textContent = selected.size ? `${selected.size} selected` : "Select downloads below";
    }

    const headRow = table.tHead?.rows?.[0];
    if (headRow && !$(".lumi-select-cell", headRow)) {
      const cell = document.createElement("th");
      cell.className = "lumi-select-cell";
      cell.innerHTML = '<input type="checkbox" data-runtime-select-all aria-label="Select all downloads">';
      headRow.prepend(cell);
    }

    [...(table.tBodies?.[0]?.rows || [])].forEach(row => {
      const id = taskIdForRow(row);
      if (!id) return;
      row.dataset.runtimeTask = id;
      if (!$(".lumi-select-cell", row)) {
        const cell = row.insertCell(0);
        cell.className = "lumi-select-cell";
        cell.innerHTML = `<input type="checkbox" data-runtime-select="${escapeHtml(id)}" aria-label="Select download" ${selected.has(id) ? "checked" : ""}>`;
      }
      const actions = $(".action-icons", row);
      if (actions && !$("[data-runtime-delete]", actions)) {
        const button = document.createElement("button");
        button.className = "mini-action lumi-delete-action";
        button.dataset.runtimeDelete = id;
        button.title = "Remove download";
        button.setAttribute("aria-label", "Remove download");
        button.textContent = "▣";
        actions.append(button);
      }
    });
  }

  async function deleteTask(id, deleteFile) {
    try { await api(`/api/downloads/${encodeURIComponent(id)}/cancel`, { method: "POST", body: {} }); } catch {}
    return api(`/api/downloads/${encodeURIComponent(id)}/delete`, { method: "POST", body: { delete_file: Boolean(deleteFile) } });
  }

  async function deleteMany(ids, deleteFile) {
    for (const id of ids) await deleteTask(id, deleteFile);
    selected.clear();
    window.closeModal?.();
    await refreshLive(true);
  }

  function showDeleteChoice(ids) {
    if (!ids.length) {
      window.toast?.("Select at least one download", "bad");
      return;
    }
    window.showModal?.(`${window.modalHeader?.("Remove download") || '<div class="modal-head"><h2>Remove download</h2></div>'}<div class="modal-body"><p>Remove ${ids.length} selected download${ids.length === 1 ? "" : "s"} from Lumi.</p><div class="lumi-dialog-choice"><button class="btn" data-delete-choice="keep">Remove from Lumi and keep downloaded files</button><button class="btn danger" data-delete-choice="files">Remove from Lumi and delete downloaded files</button><button class="btn" data-close-modal>Cancel</button></div></div>`);
    const modal = $("#modal");
    $("[data-delete-choice='keep']", modal)?.addEventListener("click", () => void deleteMany(ids, false));
    $("[data-delete-choice='files']", modal)?.addEventListener("click", () => void deleteMany(ids, true));
  }

  function correctedNewDownload(prefill = "") {
    const current = state();
    const defaultDir = current?.settings?.default_dir || "";
    window.showModal?.(`${window.modalHeader?.("New Download") || '<div class="modal-head"><h2>New Download</h2></div>'}<div class="modal-body">
      <div class="field"><label>Download URL</label><input id="owner-new-url" value="${escapeHtml(prefill)}" placeholder="https://example.com/file.iso"></div>
      <div class="form-row"><div class="field"><label>Category</label><select id="owner-new-category"><option>Uncategorized</option><option>Operating Systems</option><option>Utilities</option><option>Software</option><option>Mobile Firmware</option></select></div><div class="field"><label>Connections</label><input id="owner-new-connections" type="number" min="1" max="128" value="32"></div></div>
      <div class="field"><label>Save to</label><input id="owner-new-target" value="${escapeHtml(defaultDir)}" placeholder="Choose your download folder"></div>
      <div class="modal-actions"><button class="btn" data-close-modal>Cancel</button><button class="btn primary" data-owner-confirm-download>Start Download</button></div>
    </div>`);
  }

  async function startDirectDownload(policy = "reject") {
    const url = String($("#owner-new-url")?.value || "").trim();
    const targetDir = String($("#owner-new-target")?.value || "").trim();
    const connections = Math.max(1, Math.min(128, Number($("#owner-new-connections")?.value || 32)));
    const category = String($("#owner-new-category")?.value || "Uncategorized");
    if (!url) return window.toast?.("Enter a download URL", "bad");
    if (!targetDir) return window.toast?.("Choose a download folder", "bad");
    try {
      await api("/api/downloads/start", {
        method: "POST",
        body: {
          url,
          target_dir: targetDir,
          filename: "",
          queue_id: "default",
          category_id: category,
          connections,
          duplicate_policy: policy,
          overwrite: policy === "overwrite",
          start_paused: false,
        },
      });
      window.closeModal?.();
      state().view = "downloads";
      await refreshLive(true);
      window.toast?.("Download started", "good");
    } catch (error) {
      if (error.status === 409 || /exist|duplicate/i.test(error.message)) {
        window.showModal?.(`${window.modalHeader?.("File already exists") || '<div class="modal-head"><h2>File already exists</h2></div>'}<div class="modal-body"><p>This exact file already exists in the selected folder. Choose what Lumi should do now.</p><div class="lumi-dialog-choice"><button class="btn" data-owner-duplicate="rename">Keep both</button><button class="btn danger" data-owner-duplicate="overwrite">Replace existing file</button><button class="btn" data-close-modal>Cancel</button></div></div>`);
        return;
      }
      window.toast?.(error.message, "bad");
    }
  }

  function setSpeedFields(status, download = "—", upload = "—", ping = "—") {
    const set = (id, value) => { const node = document.getElementById(id); if (node) node.textContent = value; };
    set("speed-status", status);
    set("speed-download", download);
    set("speed-upload", upload);
    set("speed-ping", ping);
  }

  async function runMeasuredSpeedTest() {
    window.LumiReplica?.openSpeedTest();
    const button = $("[data-start-speed-test]");
    if (button) { button.disabled = true; button.textContent = "Testing…"; }
    setSpeedFields("Testing", "Measuring…", "Measuring…", "Measuring…");
    try {
      const result = await api("/api/v6/speedtest", { method: "POST", body: {} });
      if (result.state !== "complete" || !(finite(result.download_bps) > 0)) throw new Error(result.error || "Speed test returned no valid measurement");
      const download = `${finite(result.download_mbps || result.download_bps * 8 / 1e6).toFixed(1)} Mbps`;
      const upload = finite(result.upload_bps) > 0 ? `${finite(result.upload_mbps || result.upload_bps * 8 / 1e6).toFixed(1)} Mbps` : "Unavailable";
      const ping = finite(result.latency_ms) > 0 ? `${finite(result.latency_ms).toFixed(1)} ms` : "Unavailable";
      setSpeedFields("Complete", download, upload, ping);
      if (button) button.textContent = "↻ Test Again";
      window.toast?.("Measured Internet speed test complete", "good");
    } catch (error) {
      setSpeedFields("Failed", "—", "—", "—");
      if (button) button.textContent = "↻ Retry Test";
      window.toast?.(`Speed test failed: ${error.message}`, "bad");
    } finally {
      if (button) button.disabled = false;
    }
  }

  async function showRealUpdateDialog() {
    window.showModal?.(`${window.modalHeader?.("Check for updates") || '<div class="modal-head"><h2>Check for updates</h2></div>'}<div class="modal-body"><div id="owner-update-status" style="padding:24px;text-align:center">Checking tools.thetechguyds.com for the latest Lumi release…</div><div class="modal-actions"><button class="btn" data-close-modal>Close</button></div></div>`);
    const output = $("#owner-update-status");
    try {
      if (!window.electronApp?.checkForUpdates) throw new Error("Update service is available only in the Lumi desktop app");
      const result = await window.electronApp.checkForUpdates(true);
      if (result.available) {
        output.innerHTML = `<strong style="color:#19d64d">Update available: ${escapeHtml(result.version)}</strong><p>Current version: ${escapeHtml(result.currentVersion)}</p><p>Lumi will securely download the matching installer from the latest release and verify its SHA-256 checksum.</p>`;
      } else {
        output.innerHTML = `<strong style="color:#19d64d">Lumi is up to date</strong><p>Current version: ${escapeHtml(result.currentVersion || "")}</p><p>No newer release is available on tools.thetechguyds.com.</p>`;
      }
    } catch (error) {
      output.innerHTML = `<strong style="color:#ff6978">Unable to check for updates</strong><p>${escapeHtml(error.message)}</p>`;
    }
  }

  function decorateSettings() {
    const current = state();
    if (current?.view !== "settings") return;
    const downloadCard = $$(".settings-card").find(card => /Downloads/i.test($("h3", card)?.textContent || ""));
    if (downloadCard) {
      const rows = $$(".setting-row", downloadCard);
      const connectionRow = rows.find(row => /Max connections per download/i.test(row.textContent));
      const input = $("input", connectionRow);
      if (input && document.activeElement !== input) input.value = "32";
      const fileExistsRow = rows.find(row => /If file exists/i.test(row.textContent));
      fileExistsRow?.remove();
    }
    const grid = $(".settings-grid");
    if (grid && !$(".lumi-connected-card", grid)) {
      const card = document.createElement("section");
      card.className = "lumi-connected-card";
      card.innerHTML = `<h3>⌁ Connected Devices</h3><p>Pair mobile apps, tablets, or another computer here. The browser extension on this PC connects automatically and never asks for a pairing code.</p><button class="btn" data-runtime-action="pair-device">Pair another device</button> <button class="btn" data-runtime-action="view-devices">Manage devices</button>`;
      grid.append(card);
    }
  }

  function decorateBrowserPage() {
    if (state()?.view !== "browser-extension") return;
    $$(".browser-card").forEach(card => {
      const name = $("h3", card)?.textContent || "";
      if (/firefox/i.test(name)) return card.remove();
      const pill = $(".status-pill", card);
      if (pill) { pill.textContent = "Same-PC auto connection"; pill.className = "status-pill completed"; }
      $$("button", card).forEach(button => {
        if (/disconnect|install/i.test(button.textContent)) button.remove();
      });
    });
  }

  async function refreshLive(force = false) {
    if (refreshing || location.protocol === "file:") return;
    if (!force && (document.hidden || $("#modal:not([hidden])") || ["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement?.tagName))) return;
    refreshing = true;
    try {
      if (typeof window.maybeLoadProductionData === "function") await window.maybeLoadProductionData();
      else {
        const result = await api("/api/downloads?limit=5000");
        if (Array.isArray(result.downloads) && typeof window.mapLiveTask === "function") state().tasks = result.downloads.map(window.mapLiveTask);
      }
      normalizeTasks();
      recordSpeedSample();
      window.LumiReplica?.render();
      queueMicrotask(decorate);
    } catch (error) {
      console.warn("Lumi live refresh failed", error);
    } finally {
      refreshing = false;
    }
  }

  async function showPairCode() {
    const result = await api("/api/v4/security/pairing", { method: "POST", body: { role: "owner", client_name: "Connected Lumi device", expires_in: 600 } });
    window.showModal?.(`${window.modalHeader?.("Pair another device") || '<div class="modal-head"><h2>Pair another device</h2></div>'}<div class="modal-body"><p>Enter this one-time code in a Lumi mobile app or another computer:</p><div style="font-size:34px;text-align:center;letter-spacing:.12em;padding:20px">${escapeHtml(result.code)}</div><p style="color:#aeb6c5">This code expires in 10 minutes. The browser extension on this PC never needs it.</p><div class="modal-actions"><button class="btn" data-close-modal>Close</button></div></div>`);
  }

  async function showDevices() {
    const result = await api("/api/v4/security/clients");
    const items = (result.clients || []).filter(item => !item.revoked && item.kind !== "local_extension").map(item => `<div class="setting-row"><span>${escapeHtml(item.client_name || "Connected device")}</span><b>${escapeHtml(item.role || "client")}</b></div>`).join("") || "<p>No paired mobile or cross-platform devices.</p>";
    window.showModal?.(`${window.modalHeader?.("Connected Devices") || '<div class="modal-head"><h2>Connected Devices</h2></div>'}<div class="modal-body">${items}<div class="modal-actions"><button class="btn" data-close-modal>Close</button></div></div>`);
  }

  function decorate() {
    if (decorating) return;
    decorating = true;
    try {
      injectStyle();
      normalizeTasks();
      patchCounts();
      patchSpeedPanel();
      decorateDownloads();
      decorateSettings();
      decorateBrowserPage();
    } finally {
      decorating = false;
    }
  }

  document.addEventListener("click", event => {
    const newButton = event.target.closest("[data-open-new]");
    if (newButton) {
      event.preventDefault(); event.stopImmediatePropagation(); correctedNewDownload(); return;
    }
    const linkButton = event.target.closest("[data-open-link]");
    if (linkButton) {
      event.preventDefault(); event.stopImmediatePropagation(); correctedNewDownload("https://"); return;
    }
    const confirmDownload = event.target.closest("[data-owner-confirm-download]");
    if (confirmDownload) {
      event.preventDefault(); event.stopImmediatePropagation(); void startDirectDownload("reject"); return;
    }
    const duplicate = event.target.closest("[data-owner-duplicate]");
    if (duplicate) {
      event.preventDefault(); event.stopImmediatePropagation(); void startDirectDownload(duplicate.dataset.ownerDuplicate); return;
    }
    const speedButton = event.target.closest("[data-start-speed-test]");
    if (speedButton) {
      event.preventDefault(); event.stopImmediatePropagation(); void runMeasuredSpeedTest(); return;
    }
    const updateButton = event.target.closest("[data-control='updates']");
    if (updateButton) {
      event.preventDefault(); event.stopImmediatePropagation(); document.getElementById("gear-menu")?.setAttribute("hidden", ""); void showRealUpdateDialog(); return;
    }
    const checkbox = event.target.closest("[data-runtime-select]");
    if (checkbox) {
      checkbox.checked ? selected.add(checkbox.dataset.runtimeSelect) : selected.delete(checkbox.dataset.runtimeSelect);
      decorateDownloads(); return;
    }
    const all = event.target.closest("[data-runtime-select-all]");
    if (all) {
      $$('[data-runtime-select]').forEach(box => { box.checked = all.checked; all.checked ? selected.add(box.dataset.runtimeSelect) : selected.delete(box.dataset.runtimeSelect); });
      decorateDownloads(); return;
    }
    const rowDelete = event.target.closest("[data-runtime-delete]");
    if (rowDelete) {
      event.preventDefault(); event.stopImmediatePropagation(); showDeleteChoice([rowDelete.dataset.runtimeDelete]); return;
    }
    const action = event.target.closest("[data-runtime-action]")?.dataset.runtimeAction;
    if (!action) return;
    event.preventDefault(); event.stopImmediatePropagation();
    if (action === "refresh") return void refreshLive(true);
    if (action === "pause-all") return void api("/api/downloads/pause-all", { method: "POST", body: {} }).then(() => refreshLive(true));
    if (action === "resume-all") return void api("/api/downloads/resume-all", { method: "POST", body: {} }).then(() => refreshLive(true));
    if (action === "clear-done") return void api("/api/downloads/clear", { method: "POST", body: {} }).then(() => refreshLive(true));
    if (action === "remove-selected") return showDeleteChoice([...selected]);
    if (action === "delete-files-selected") return showDeleteChoice([...selected]);
    if (action === "pair-device") return void showPairCode();
    if (action === "view-devices") return void showDevices();
  }, true);

  const observer = new MutationObserver(() => queueMicrotask(decorate));
  document.addEventListener("DOMContentLoaded", () => {
    observer.observe(document.body, { childList: true, subtree: true });
    setTimeout(() => { normalizeTasks(); recordSpeedSample(true); decorate(); }, 150);
    setInterval(() => void refreshLive(false), 1000);
  });
})();

(() => {
  if (document.getElementById("lumi-owner-responsive-runtime")) return;
  const style = document.createElement("style");
  style.id = "lumi-owner-responsive-runtime";
  style.textContent = `
    @media(max-width:1200px){.overview-grid{grid-template-columns:minmax(0,1fr)!important}}
    @media(max-width:850px){.app-frame{grid-template-columns:minmax(0,1fr)!important}.titlebar{padding-left:10px!important}}
  `;
  document.head.appendChild(style);
})();
