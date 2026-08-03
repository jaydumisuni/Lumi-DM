"use strict";

(() => {
  const ACTIVE_RAW = new Set(["running", "downloading", "resolving", "verifying", "post_processing"]);
  const selected = new Set();
  let selectionMode = false;
  let refreshing = false;
  let bestSessionBps = 0;

  const replica = () => window.LumiReplica;
  const appState = () => replica()?.state;
  const byId = id => document.getElementById(id);
  const finite = value => Number.isFinite(Number(value)) ? Number(value) : 0;
  const rawStatus = task => String(task?._runtimeStatus || task?.raw?.status || task?.status || "").toLowerCase();
  const shownStatus = task => ACTIVE_RAW.has(rawStatus(task)) ? "downloading" : rawStatus(task);
  const formatRate = value => {
    const bps = finite(value);
    if (bps >= 1048576) return `${(bps / 1048576).toFixed(1)} MB/s`;
    if (bps >= 1024) return `${(bps / 1024).toFixed(0)} KB/s`;
    return `${Math.round(bps)} B/s`;
  };

  async function api(path, options = {}) {
    const request = {
      method: options.method || "GET",
      credentials: "same-origin",
      headers: { "X-Lumi-Client": "approved-ui-runtime-v6", ...(options.headers || {}) },
    };
    if (options.body !== undefined) {
      request.headers["Content-Type"] = "application/json";
      request.body = JSON.stringify(options.body);
    }
    let response = await fetch(path, request);
    if (response.status === 401) {
      await fetch("/api/security/bootstrap", {
        credentials: "same-origin",
        headers: { "X-Lumi-Client": "approved-ui-runtime-v6" },
      });
      response = await fetch(path, request);
    }
    const text = await response.text();
    let data = {};
    try { data = text ? JSON.parse(text) : {}; } catch { data = { error: text }; }
    if (!response.ok) throw new Error(data.error || `${request.method} ${path} failed (${response.status})`);
    return data;
  }

  function normalizeTasks() {
    const state = appState();
    if (!state?.tasks) return;
    for (const task of state.tasks) {
      const current = String(task.raw?.status || task.status || "").toLowerCase();
      task._runtimeStatus = current;
      if (ACTIVE_RAW.has(current)) task.status = "downloading";
      task.speed = formatRate(task.raw?.speed_bytes_per_sec ?? task.speed_bytes_per_sec ?? 0);
    }
  }

  function patchOverview() {
    const state = appState();
    if (!state || state.view !== "overview") return;
    const tasks = state.tasks || [];
    const counts = { active: 0, completed: 0, queued: 0, failed: 0 };
    let liveBps = 0;
    for (const task of tasks) {
      const status = rawStatus(task);
      if (ACTIVE_RAW.has(status)) {
        counts.active += 1;
        liveBps += finite(task.raw?.speed_bytes_per_sec ?? task.speed_bytes_per_sec);
      } else if (status === "completed") counts.completed += 1;
      else if (["queued", "browser_pending", "staged"].includes(status)) counts.queued += 1;
      else if (["failed", "cancelled"].includes(status)) counts.failed += 1;
    }
    bestSessionBps = Math.max(bestSessionBps, liveBps);
    const cards = [...document.querySelectorAll(".stat-grid .stat-card")];
    const values = [tasks.length, counts.active, counts.completed, counts.queued];
    cards.slice(0, 4).forEach((card, index) => {
      const strong = card.querySelector(".stat-copy strong");
      if (strong) strong.textContent = String(values[index]);
    });
    const speed = document.querySelector(".speed-value");
    if (speed) speed.innerHTML = `${formatRate(liveBps).replace(/\s[^ ]+$/, "")} <small>${formatRate(liveBps).split(" ").slice(1).join(" ")}</small>`;
    const metrics = [...document.querySelectorAll(".speed-metric b")];
    if (metrics[0]) metrics[0].textContent = formatRate(liveBps);
    if (metrics[1]) metrics[1].textContent = "0 B/s";
    if (metrics[2]) metrics[2].textContent = "—";
    const best = document.querySelector(".best-speed b");
    if (best) best.textContent = formatRate(bestSessionBps);
    const donut = document.querySelector(".donut");
    const donutTotal = donut?.querySelector("strong");
    if (donutTotal) donutTotal.textContent = String(tasks.length);
    const legendRows = [...document.querySelectorAll(".legend-row")];
    const legendValues = [counts.completed, counts.active, counts.queued, counts.failed];
    legendRows.forEach((row, index) => {
      const value = legendValues[index] || 0;
      const pct = tasks.length ? value * 100 / tasks.length : 0;
      const strong = row.querySelector("strong");
      if (strong) strong.textContent = `${value}  (${pct.toFixed(1)}%)`;
    });
  }

  function taskIdForRow(row) {
    return row.querySelector("[data-task]")?.dataset.task || row.dataset.runtimeTask || "";
  }

  function injectSelectionStyle() {
    if (byId("lumi-runtime-style")) return;
    const style = document.createElement("style");
    style.id = "lumi-runtime-style";
    style.textContent = `
      .lumi-selection-toolbar{display:flex;gap:8px;align-items:center;flex-wrap:wrap;padding:10px 12px;border:1px solid rgba(102,123,160,.28);border-radius:10px;background:rgba(7,16,32,.78)}
      .lumi-selection-toolbar .selection-count{margin-left:auto;color:#aab3c5;font-size:12px}
      .lumi-select-cell{width:36px!important;text-align:center!important;padding:0 7px!important}
      .lumi-select-cell input{accent-color:#8f27f4;width:15px;height:15px}
      .lumi-row-delete{color:#ff6473!important}
      .lumi-connected-card{border:1px solid rgba(103,123,160,.29);border-radius:11px;background:#081324;padding:14px 16px;min-height:180px}
      .lumi-connected-card h3{margin:0 0 10px;font-size:18px}.lumi-connected-card p{color:#aeb6c5;font-size:13px;line-height:1.5}
      body.light-glass .lumi-selection-toolbar,body.light-glass .lumi-connected-card{background:rgba(255,255,255,.27);border-color:rgba(255,255,255,.74);color:#101326}
    `;
    document.head.append(style);
  }

  function updateSelectionCount() {
    const value = document.querySelector(".selection-count");
    if (value) value.textContent = selected.size ? `${selected.size} selected` : "No selection";
    const selectButton = document.querySelector("[data-runtime-action='select']");
    if (selectButton) selectButton.classList.toggle("primary", selectionMode);
    document.querySelectorAll(".lumi-select-cell").forEach(cell => { cell.hidden = !selectionMode; });
  }

  function decorateDownloads() {
    const state = appState();
    if (!state || !["downloads", "unfinished"].includes(state.view)) return;
    const page = document.querySelector("#content .page");
    const tablePanel = page?.querySelector(".table-panel");
    const table = tablePanel?.querySelector("table");
    if (!page || !tablePanel || !table) return;

    let toolbar = page.querySelector(".lumi-selection-toolbar");
    if (!toolbar) {
      toolbar = document.createElement("div");
      toolbar.className = "lumi-selection-toolbar";
      toolbar.innerHTML = `
        <button class="btn small" data-runtime-action="refresh">↻ Refresh</button>
        <button class="btn small" data-runtime-action="select">☑ Select</button>
        <button class="btn small" data-runtime-action="pause-all">Ⅱ Pause all</button>
        <button class="btn small" data-runtime-action="resume-all">▶ Resume all</button>
        <button class="btn small danger" data-runtime-action="cancel-all">× Cancel all</button>
        <button class="btn small" data-runtime-action="clear-done">Clear done</button>
        <button class="btn small danger" data-runtime-action="delete-selected" hidden>Delete selected</button>
        <span class="selection-count">No selection</span>`;
      page.insertBefore(toolbar, tablePanel);
    }

    const headRow = table.tHead?.rows?.[0];
    if (headRow && !headRow.querySelector(".lumi-select-cell")) {
      const cell = document.createElement("th");
      cell.className = "lumi-select-cell";
      cell.innerHTML = '<input type="checkbox" data-runtime-select-all aria-label="Select all downloads">';
      headRow.prepend(cell);
    }
    [...(table.tBodies?.[0]?.rows || [])].forEach(row => {
      const id = taskIdForRow(row);
      if (!id) return;
      row.dataset.runtimeTask = id;
      if (!row.querySelector(".lumi-select-cell")) {
        const cell = row.insertCell(0);
        cell.className = "lumi-select-cell";
        cell.innerHTML = `<input type="checkbox" data-runtime-select="${id}" aria-label="Select download" ${selected.has(id) ? "checked" : ""}>`;
      }
      const actions = row.querySelector(".action-icons");
      if (actions && !actions.querySelector("[data-runtime-delete]")) {
        const button = document.createElement("button");
        button.className = "mini-action lumi-row-delete";
        button.dataset.runtimeDelete = id;
        button.title = "Remove download";
        button.setAttribute("aria-label", "Remove download");
        button.textContent = "▣";
        actions.append(button);
      }
    });
    const deleteSelected = toolbar.querySelector("[data-runtime-action='delete-selected']");
    if (deleteSelected) deleteSelected.hidden = !selected.size;
    updateSelectionCount();
  }

  async function actionForTask(id, action) {
    if (action === "delete") {
      try { await api(`/api/downloads/${encodeURIComponent(id)}/cancel`, { method: "POST", body: {} }); } catch {}
      return api(`/api/downloads/${encodeURIComponent(id)}/delete`, { method: "POST", body: { delete_file: false } });
    }
    return api(`/api/downloads/${encodeURIComponent(id)}/${action}`, { method: "POST", body: {} });
  }

  async function refreshLive(force = false) {
    if (refreshing || location.protocol === "file:") return;
    const activeElement = document.activeElement;
    if (!force && (document.hidden || document.querySelector("#modal:not([hidden])") || ["INPUT", "TEXTAREA", "SELECT"].includes(activeElement?.tagName))) return;
    refreshing = true;
    try {
      if (typeof window.maybeLoadProductionData === "function") await window.maybeLoadProductionData();
      else if (typeof maybeLoadProductionData === "function") await maybeLoadProductionData();
      normalizeTasks();
      replica()?.render();
      queueMicrotask(decorate);
    } catch (error) {
      console.warn("Lumi live refresh failed", error);
    } finally {
      refreshing = false;
    }
  }

  function decorateConnectedDevices() {
    const state = appState();
    if (state?.view !== "settings") return;
    const grid = document.querySelector(".settings-grid");
    if (!grid || grid.querySelector(".lumi-connected-card")) return;
    const card = document.createElement("section");
    card.className = "lumi-connected-card";
    card.innerHTML = `<h3>⌁ Connected Devices</h3><p>Pair a phone, tablet or another computer. The browser extension on this PC connects automatically and does not use this code.</p><button class="btn" data-runtime-action="pair-device">Pair another device</button><button class="btn" data-runtime-action="view-devices">Manage devices</button>`;
    grid.append(card);
  }

  function decorateBrowserPage() {
    const state = appState();
    if (state?.view !== "browser-extension") return;
    const cards = [...document.querySelectorAll(".browser-card")];
    cards.forEach(card => {
      const name = card.querySelector("h3")?.textContent || "";
      if (/firefox/i.test(name)) {
        card.remove();
        return;
      }
      const pill = card.querySelector(".status-pill");
      if (pill) {
        pill.textContent = "Same-PC auto connection";
        pill.className = "status-pill completed";
      }
      card.querySelectorAll("button").forEach(button => {
        if (/disconnect|install/i.test(button.textContent)) button.remove();
      });
    });
  }

  function decorate() {
    injectSelectionStyle();
    patchOverview();
    decorateDownloads();
    decorateConnectedDevices();
    decorateBrowserPage();
  }

  function setSpeedFields(status, download = "—", upload = "—", ping = "—") {
    const statusNode = byId("speed-status");
    const downloadNode = byId("speed-download");
    const uploadNode = byId("speed-upload");
    const pingNode = byId("speed-ping");
    if (statusNode) statusNode.textContent = status;
    if (downloadNode) downloadNode.textContent = download;
    if (uploadNode) uploadNode.textContent = upload;
    if (pingNode) pingNode.textContent = ping;
  }

  async function runMeasuredSpeedTest() {
    replica()?.openSpeedTest();
    const button = document.querySelector("[data-start-speed-test]");
    if (button) { button.disabled = true; button.textContent = "Testing…"; }
    setSpeedFields("Testing", "Measuring…", "Measuring…", "Measuring…");
    try {
      const result = await api("/api/v6/speedtest", { method: "POST", body: {} });
      if (result.state !== "complete" || !(finite(result.download_bps) > 0)) throw new Error(result.error || "Speed test did not return a valid measurement");
      const download = `${finite(result.download_mbps).toFixed(1)} Mbps`;
      const upload = finite(result.upload_bps) > 0 ? `${finite(result.upload_mbps).toFixed(1)} Mbps` : "Unavailable";
      const ping = finite(result.latency_ms) > 0 ? `${finite(result.latency_ms).toFixed(1)} ms` : "Unavailable";
      setSpeedFields("Complete", download, upload, ping);
      if (button) button.textContent = "↻ Test Again";
      if (typeof toast === "function") toast("Measured speed test complete", "good");
    } catch (error) {
      setSpeedFields("Failed", "—", "—", "—");
      if (button) button.textContent = "↻ Retry Test";
      if (typeof toast === "function") toast(`Speed test failed: ${error.message}`, "bad");
    } finally {
      if (button) button.disabled = false;
    }
  }

  async function showPairCode() {
    const result = await api("/api/v4/security/pairing", {
      method: "POST",
      body: { role: "owner", client_name: "Connected Lumi device", expires_in: 600 },
    });
    if (typeof showModal === "function") {
      showModal(`${modalHeader("Pair another device")}<div class="modal-body"><p>Enter this one-time code in the Lumi mobile app or another computer:</p><div style="font-size:34px;text-align:center;letter-spacing:.12em;padding:20px">${result.code}</div><p style="color:#aeb6c5">Expires at ${result.expires_at}. The browser extension on this PC never needs this code.</p><div class="modal-actions"><button class="btn" data-close-modal>Close</button></div></div>`);
    }
  }

  async function showDevices() {
    const result = await api("/api/v4/security/clients");
    const items = (result.clients || []).filter(item => !item.revoked).map(item => `<div class="setting-row"><span>${String(item.client_name || "Connected device")}</span><b>${item.kind === "local_extension" ? "This PC extension" : item.role}</b></div>`).join("") || "<p>No connected devices.</p>";
    if (typeof showModal === "function") showModal(`${modalHeader("Connected Devices")}<div class="modal-body">${items}<div class="modal-actions"><button class="btn" data-close-modal>Close</button></div></div>`);
  }

  document.addEventListener("click", event => {
    const speed = event.target.closest("[data-start-speed-test]");
    if (speed) {
      event.preventDefault();
      event.stopImmediatePropagation();
      void runMeasuredSpeedTest();
      return;
    }
    const select = event.target.closest("[data-runtime-select]");
    if (select) {
      const id = select.dataset.runtimeSelect;
      select.checked ? selected.add(id) : selected.delete(id);
      decorateDownloads();
      return;
    }
    const all = event.target.closest("[data-runtime-select-all]");
    if (all) {
      document.querySelectorAll("[data-runtime-select]").forEach(box => {
        box.checked = all.checked;
        all.checked ? selected.add(box.dataset.runtimeSelect) : selected.delete(box.dataset.runtimeSelect);
      });
      decorateDownloads();
      return;
    }
    const remove = event.target.closest("[data-runtime-delete]");
    if (remove) {
      event.preventDefault();
      event.stopImmediatePropagation();
      if (confirm("Remove this download from Lumi? The downloaded file will be kept.")) {
        void actionForTask(remove.dataset.runtimeDelete, "delete").then(() => refreshLive(true));
      }
      return;
    }
    const action = event.target.closest("[data-runtime-action]")?.dataset.runtimeAction;
    if (!action) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (action === "refresh") return void refreshLive(true);
    if (action === "select") {
      selectionMode = !selectionMode;
      if (!selectionMode) selected.clear();
      decorateDownloads();
      return;
    }
    if (action === "pause-all") return void api("/api/downloads/pause-all", { method: "POST", body: {} }).then(() => refreshLive(true));
    if (action === "resume-all") return void api("/api/downloads/resume-all", { method: "POST", body: {} }).then(() => refreshLive(true));
    if (action === "cancel-all") {
      if (confirm("Cancel every active Lumi download?")) void api("/api/downloads/cancel-all", { method: "POST", body: {} }).then(() => refreshLive(true));
      return;
    }
    if (action === "clear-done") return void api("/api/downloads/clear", { method: "POST", body: {} }).then(() => refreshLive(true));
    if (action === "delete-selected") {
      if (!selected.size || !confirm(`Remove ${selected.size} selected download(s) from Lumi? Downloaded files will be kept.`)) return;
      const ids = [...selected];
      selected.clear();
      void Promise.all(ids.map(id => actionForTask(id, "delete"))).then(() => refreshLive(true));
      return;
    }
    if (action === "pair-device") return void showPairCode();
    if (action === "view-devices") return void showDevices();
  }, true);

  const observer = new MutationObserver(() => queueMicrotask(decorate));
  document.addEventListener("DOMContentLoaded", () => {
    observer.observe(document.body, { childList: true, subtree: true });
    setTimeout(() => { normalizeTasks(); decorate(); }, 350);
    setInterval(() => void refreshLive(false), 1500);
  });
})();
