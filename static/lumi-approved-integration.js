"use strict";

/*
 * Lumi approved UI production integration.
 *
 * The approved renderer remains the visual source of truth. This adapter replaces
 * preview-only behaviour with the existing Lumi Flask and Electron contracts.
 */
(() => {
  const replica = window.LumiReplica;
  if (!replica) throw new Error("Lumi approved renderer did not initialize");

  const state = replica.state;
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const escapeHtml = value => String(value ?? "").replace(/[&<>"']/g, character => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[character]));
  const byteUnits = ["B", "KB", "MB", "GB", "TB"];
  const unfinished = new Set([
    "staged", "queued", "resolving", "running", "downloading", "pausing",
    "paused", "needs_link", "verifying", "post_processing", "failed",
    "cancelling", "browser_pending",
  ]);
  const active = new Set(["queued", "resolving", "running", "downloading", "pausing", "verifying", "post_processing"]);
  const supportUrl = "https://thetechguyds.com/tools#report-bug";
  const toolsUrl = "https://thetechguyds.com/tools";
  const privacyUrl = "https://thetechguyds.com/privacy";
  const extensionUrl = "https://thetechguyds.com/tools";

  Object.assign(state, {
    productionReady: false,
    productionOffline: false,
    productionError: "",
    auth: null,
    rawTasks: [],
    queueDefinitions: [],
    rawCategories: [],
    netstats: { rx_bps: 0, tx_bps: 0, capacity_bps: 0, available: false },
    storageRows: [],
    selectedStoragePath: "",
    speedHistory: Array(28).fill(0),
    speedResult: null,
    appInfo: { name: "Lumi DM", version: "development", publisher: "THETECHGUY DIGITAL SOLUTIONS", website: toolsUrl },
    firmwareCatalogue: null,
    firmwareResults: [],
    osCatalogue: null,
    osResults: [],
    extension: { chrome: "Available", edge: "Available", firefox: "Available" },
    grabInput: "",
    livePollTimer: null,
  });

  function previewRuntime() {
    const parameters = new URLSearchParams(location.search);
    if (window.__LUMI_REPLICA_PREVIEW__ === true || parameters.get("preview") === "1") return true;
    if (window.electronApp?.isElectron) return false;
    return location.protocol === "file:" || location.protocol === "about:";
  }

  function headers(body = false) {
    const value = { "X-Lumi-Client": "web-ui-approved" };
    const token = sessionStorage.getItem("LUMI.bearerToken") || "";
    if (token) value.Authorization = `Bearer ${token}`;
    if (body) value["Content-Type"] = "application/json";
    return value;
  }

  async function api(method, path, body = null) {
    const token = sessionStorage.getItem("LUMI.bearerToken") || "";
    const response = await fetch(path, {
      method,
      credentials: token ? "omit" : "same-origin",
      headers: headers(body !== null),
      ...(body !== null ? { body: JSON.stringify(body) } : {}),
    });
    const text = await response.text();
    let data = {};
    try { data = text ? JSON.parse(text) : {}; }
    catch (_) { data = { error: text.slice(0, 500) }; }
    if (!response.ok) throw new Error(data.error || `${method} ${path} failed (${response.status})`);
    return data;
  }

  async function establishSession() {
    try {
      const me = await api("GET", "/api/v4/security/me");
      if (me?.authenticated) return me;
    } catch (_) {}
    const response = await fetch("/api/security/bootstrap", {
      credentials: "same-origin",
      headers: { "X-Lumi-Client": "web-ui-approved" },
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "Lumi secure local session is unavailable");
    return data;
  }

  function bytes(value, digits = 1) {
    let number = Math.max(0, Number(value || 0));
    let unit = 0;
    while (number >= 1024 && unit < byteUnits.length - 1) { number /= 1024; unit += 1; }
    return `${number.toFixed(unit === 0 ? 0 : digits)} ${byteUnits[unit]}`;
  }

  function rate(value) {
    return `${bytes(value)}/s`;
  }

  function mbps(value) {
    return `${(Number(value || 0) * 8 / 1_000_000).toFixed(1)} Mbps`;
  }

  function formatDate(value) {
    if (!value) return "—";
    const date = new Date(value);
    return Number.isNaN(date.valueOf()) ? String(value) : date.toLocaleString();
  }

  function sourceHost(value) {
    try { return new URL(value).hostname.replace(/^www\./, ""); }
    catch (_) { return "Lumi"; }
  }

  function priorityLabel(value) {
    const number = Number(value || 0);
    if (number >= 50) return "High";
    if (number < 0) return "Low";
    const text = String(value || "Normal");
    return /high/i.test(text) ? "High" : /low/i.test(text) ? "Low" : "Normal";
  }

  function mappedStatus(value) {
    const status = String(value || "queued").toLowerCase();
    if (["running", "resolving", "verifying", "post_processing", "pausing"].includes(status)) return "downloading";
    if (status === "complete") return "completed";
    if (["cancelled", "canceled"].includes(status)) return "failed";
    return status;
  }

  function iconFor(filename, type = "") {
    const text = `${filename} ${type}`.toLowerCase();
    if (text.includes("windows") || /\.(exe|msi)$/i.test(filename)) return "windows";
    if (text.includes("ubuntu") || text.includes("linux")) return "ubuntu";
    if (/\.pdf$/i.test(filename)) return "pdf";
    if (/\.iso$/i.test(filename)) return "iso";
    if (/\.7z$/i.test(filename)) return "7z";
    return mappedStatus(type) === "completed" ? "check" : "zip";
  }

  function mapTask(task, index) {
    const filename = String(task.filename || task.metadata?.title || task.url || `Download ${index + 1}`);
    const downloadedBytes = Number(task.downloaded_bytes || 0);
    const totalBytes = Number(task.total_bytes || 0);
    const status = mappedStatus(task.status);
    const percentage = totalBytes > 0 ? Math.max(0, Math.min(100, Math.round(downloadedBytes / totalBytes * 100))) : Number(task.progress || 0);
    return {
      id: String(task.id || `live-${index}`),
      name: filename,
      category: String(task.category_id || task.type || "Uncategorized"),
      source: String(task.source_name || task.metadata?.source_name || sourceHost(task.url)),
      downloaded: Number((downloadedBytes / 1073741824).toFixed(3)),
      total: Number((Math.max(totalBytes, 1) / 1073741824).toFixed(3)),
      downloadedLabel: bytes(downloadedBytes),
      totalLabel: totalBytes ? bytes(totalBytes) : "Unknown",
      progress: percentage,
      speed: Number(task.speed_bytes_per_sec || 0) > 0 ? rate(task.speed_bytes_per_sec) : "—",
      eta: task.eta_seconds ? `${Math.floor(task.eta_seconds / 60).toString().padStart(2, "0")}:${Math.floor(task.eta_seconds % 60).toString().padStart(2, "0")}` : status === "completed" ? "Completed" : "—",
      status,
      icon: iconFor(filename, status),
      priority: priorityLabel(task.priority),
      finished: task.finished_at || task.completed_at || task.updated_at || "",
      checksum: task.checksum_status || task.metadata?.checksum_status || "—",
      raw: task,
    };
  }

  function mapCategory(category, index) {
    const id = String(category.id || category.name || `category-${index}`);
    const name = String(category.name || id);
    const count = state.tasks.filter(task => String(task.raw?.category_id || task.category) === id).length;
    const total = state.tasks.filter(task => String(task.raw?.category_id || task.category) === id)
      .reduce((sum, task) => sum + Number(task.raw?.total_bytes || 0), 0);
    const symbols = ["⊞", "▯", "🛠", "▤", "ZIP", "⚙", "▣", "♫", "◇"];
    return [
      name,
      `${count} download${count === 1 ? "" : "s"}`,
      bytes(total),
      String(category.folder || category.target_dir || state.settings.default_dir || ""),
      symbols[index % symbols.length],
      ["os", "util", "image", "doc"][index % 4],
      Array.isArray(category.extensions) && category.extensions.length
        ? category.extensions.map(extension => String(extension).startsWith(".") ? extension : `.${extension}`).join(", ")
        : "*.* (unmatched files)",
      { ...category, id },
    ];
  }

  function mapQueues(rawQueues) {
    const definitions = new Map((rawQueues || []).map(queue => [String(queue.id || queue.name || "default"), queue]));
    return state.tasks
      .filter(task => unfinished.has(String(task.raw?.status || task.status)))
      .map((task, index) => {
        const queueId = String(task.raw?.queue_id || "default");
        const queue = definitions.get(queueId) || {};
        return {
          id: task.id,
          taskId: task.id,
          queueId,
          name: task.name,
          category: task.category,
          source: task.source,
          size: task.totalLabel || `${task.total} GB`,
          status: task.status === "paused" ? "Waiting" : task.raw?.scheduled_at ? "Scheduled" : task.status === "queued" ? "Ready" : "Waiting",
          priority: task.priority,
          scheduled: task.raw?.scheduled_at ? formatDate(task.raw.scheduled_at) : "—",
          queueName: queue.name || queueId,
          order: Number(task.raw?.priority || index),
        };
      });
  }

  function storageRoot(path) {
    const value = String(path || "");
    const windows = value.match(/^[A-Za-z]:/);
    if (windows) return windows[0].toUpperCase();
    return value === "/" ? "/" : value.split("/").filter(Boolean)[0] ? `/${value.split("/").filter(Boolean)[0]}` : value;
  }

  function updateStorageChrome() {
    const select = $("#drive-select");
    if (!select) return;
    const rows = state.storageRows || [];
    if (!rows.length) {
      select.innerHTML = `<option>${escapeHtml(storageRoot(state.settings.default_dir) || "Download drive")}</option>`;
      $("#storage-left").textContent = "Unavailable";
      $("#storage-percent").textContent = "—";
      return;
    }
    const roots = [];
    for (const row of rows) {
      const root = storageRoot(row.path);
      if (!roots.some(item => item.root === root)) roots.push({ root, row });
    }
    const previous = state.selectedStoragePath || roots.find(item => String(state.settings.default_dir || "").startsWith(item.root))?.row.path || roots[0].row.path;
    state.selectedStoragePath = previous;
    select.innerHTML = roots.map(item => `<option value="${escapeHtml(item.row.path)}" ${item.row.path === previous ? "selected" : ""}>Drive ${escapeHtml(item.root)}</option>`).join("");
    const row = roots.find(item => item.row.path === previous)?.row || roots[0].row;
    const percent = row.total_bytes ? Math.round(row.used_bytes / row.total_bytes * 100) : 0;
    $("#storage-left").textContent = bytes(row.free_bytes);
    $("#storage-percent").textContent = `${percent}%`;
    const note = $(".storage-body small");
    if (note) note.textContent = `of ${bytes(row.total_bytes, 0)}`;
    const best = $(".best-speed b");
    if (best) best.textContent = state.netstats.capacity_bps ? rate(state.netstats.capacity_bps) : "Not tested";
  }

  async function refreshLive({ renderAfter = false, full = true } = {}) {
    if (previewRuntime()) return false;
    try {
      if (!state.auth?.authenticated) state.auth = await establishSession();
      const requests = [
        api("GET", "/api/downloads?limit=5000"),
        api("GET", "/api/v4/overview"),
        api("GET", "/api/netstats").catch(() => ({})),
      ];
      if (full) {
        requests.push(
          api("GET", "/api/queues").catch(() => ({ queues: [] })),
          api("GET", "/api/categories").catch(() => ({ categories: [] })),
          api("GET", "/api/settings").catch(() => ({})),
          api("GET", "/api/v4/maintenance/storage").catch(() => ({ directories: [] })),
        );
      }
      const result = await Promise.all(requests);
      const [taskData, overview, netstats] = result;
      state.rawTasks = Array.isArray(taskData.downloads) ? taskData.downloads : [];
      state.tasks = state.rawTasks.map(mapTask);
      state.overview = overview || {};
      state.netstats = { ...state.netstats, ...(netstats || {}) };
      const currentSpeed = Number(overview?.total_speed_bytes_per_sec || netstats?.rx_bps || 0);
      state.speedHistory.push(currentSpeed);
      state.speedHistory = state.speedHistory.slice(-28);
      if (full) {
        const [, , , queueData, categoryData, settingsData, storageData] = result;
        state.queueDefinitions = Array.isArray(queueData?.queues) ? queueData.queues : [];
        state.rawCategories = Array.isArray(categoryData?.categories) ? categoryData.categories : [];
        state.settings = { ...state.settings, ...(settingsData || {}) };
        state.categories = state.rawCategories.map(mapCategory);
        state.storageRows = Array.isArray(storageData?.directories) ? storageData.directories : [];
      }
      state.queues = mapQueues(state.queueDefinitions);
      state.productionReady = true;
      state.productionOffline = false;
      state.productionError = "";
      updateStorageChrome();
      if (renderAfter) replica.render();
      return true;
    } catch (error) {
      state.productionReady = false;
      state.productionOffline = true;
      state.productionError = error.message || String(error);
      state.tasks = [];
      state.queues = [];
      state.categories = [];
      state.overview = {};
      updateStorageChrome();
      if (renderAfter) replica.render();
      return false;
    }
  }

  function count(status) {
    return state.tasks.filter(task => status.has ? status.has(task.status) : task.status === status).length;
  }

  function chartBars() {
    const values = state.speedHistory || [];
    const maximum = Math.max(...values, 1);
    return values.map(value => Math.max(5, Math.round(value / maximum * 92)));
  }

  function emptyOffline() {
    if (!state.productionOffline) return "";
    return `<div class="offline-strip"><strong>Lumi server unavailable</strong><span>${escapeHtml(state.productionError || "The local download engine is not responding.")}</span><button class="btn small" data-live-retry>Retry</button></div>`;
  }

  function liveOverview() {
    if (previewRuntime()) return null;
    const counts = state.overview.counts || {};
    const total = Number(state.overview.total_tasks ?? state.tasks.length);
    const downloading = count(active);
    const completed = Number(counts.completed || count("completed"));
    const queued = Number(counts.queued || count("queued"));
    const failed = Number(counts.failed || count("failed"));
    const current = Number(state.overview.total_speed_bytes_per_sec || state.netstats.rx_bps || 0);
    const upload = Number(state.netstats.tx_bps || 0);
    const recent = state.tasks.slice(0, 3);
    const bars = chartBars();
    const pct = value => total ? value / total * 100 : 0;
    const completedPct = pct(completed);
    const downloadingPct = pct(downloading);
    const queuedPct = pct(queued);
    return `<div class="page">${pageHead("overview")}${emptyOffline()}
      <div class="stat-grid">
        ${statCard("", "TOTAL DOWNLOADS", String(total), "All time downloads", icon("download"), "#9d22ff")}
        ${statCard("blue", "DOWNLOADING", String(downloading), "Active downloads", icon("download"), "#00a2ff")}
        ${statCard("green", "COMPLETED", String(completed), "Successfully completed", icon("check"), "#10db42")}
        ${statCard("orange", "QUEUED", String(queued), "Waiting in queue", icon("clock"), "#ff780c")}
      </div>
      <div class="overview-grid">
        <section class="panel"><div class="panel-head"><h2>DOWNLOAD SPEED</h2><button class="btn small">This session⌄</button></div><div class="speed-body"><div class="speed-value">${(current / 1048576).toFixed(1)} <small>MB/s</small></div><div class="speed-sub">Current speed</div><div class="speed-chart"><div class="speed-axis"><span>${rate(Math.max(...state.speedHistory, 10 * 1048576))}</span><span>75%</span><span>50%</span><span>25%</span><span>0</span></div><div class="bars-wrap">${bars.map(value => `<i style="height:${value}%"></i>`).join("")}</div></div><div class="chart-labels"><span>60s</span><span>50s</span><span>40s</span><span>30s</span><span>20s</span><span>10s</span><span>Now</span></div><div class="speed-metrics"><div class="speed-metric"><span class="glyph">⇩</span><div><b>${rate(current)}</b><small>Download</small></div></div><div class="speed-metric"><span class="glyph">↑</span><div><b>${rate(upload)}</b><small>Upload</small></div></div><div class="speed-metric"><span class="glyph">◷</span><div><b>—</b><small>Latency</small></div></div></div></div></section>
        <section class="panel"><div class="panel-head"><h2>DOWNLOADS BY STATUS</h2></div><div class="status-body"><div class="donut" style="--c1:${completedPct}%;--c2:${completedPct + downloadingPct}%;--c3:${completedPct + downloadingPct + queuedPct}%"><strong>${total}</strong><span>Total</span></div><div class="legend"><div class="legend-row"><i style="background:#13d141"></i><span>Completed</span><strong>${completed}&nbsp;&nbsp;(${completedPct.toFixed(1)}%)</strong></div><div class="legend-row"><i style="background:#6a12df"></i><span>Downloading</span><strong>${downloading}&nbsp;&nbsp;(${downloadingPct.toFixed(1)}%)</strong></div><div class="legend-row"><i style="background:#ff790c"></i><span>Queued</span><strong>${queued}&nbsp;&nbsp;(${queuedPct.toFixed(1)}%)</strong></div><div class="legend-row"><i style="background:#56627a"></i><span>Failed</span><strong>${failed}&nbsp;&nbsp;(${pct(failed).toFixed(1)}%)</strong></div></div></div></section>
      </div>
      <div class="overview-grid">
        <section class="panel"><div class="panel-head"><h2>RECENT DOWNLOADS</h2><button class="btn small" data-view-jump="downloads">View all</button></div><div class="recent-list">${recent.length ? recent.map(task => `<div class="recent-row" data-task-row="${escapeHtml(task.id)}"><div class="file-cell">${fileIcon(task.icon)}<div class="file-copy"><strong>${escapeHtml(task.name)}</strong><small><em>↓${escapeHtml(task.speed)}</em> · ${escapeHtml(task.downloadedLabel)} / ${escapeHtml(task.totalLabel)}</small></div></div><b>${task.progress}%</b><button class="pause-ring" data-task-action="${task.status === "downloading" ? "pause" : "resume"}" data-task="${escapeHtml(task.id)}">${task.status === "downloading" ? "Ⅱ" : "▶"}</button></div>`).join("") : `<div class="empty-live">No downloads yet.</div>`}</div></section>
        <section class="panel"><div class="panel-head"><h2>QUICK ACTIONS</h2></div><div class="quick-grid"><button class="quick-card" data-open-new>${icon("plus", "quick-icon")}<span>New Download</span></button><button class="quick-card" data-open-link>${icon("link", "quick-icon")}<span>Add Link</span></button><button class="quick-card" data-open-folder>${icon("folder", "quick-icon")}<span>Open Folder</span></button><button class="quick-card" data-control-jump="settings">${icon("gear", "quick-icon")}<span>Settings</span></button><button class="quick-card" data-view-jump="queues">${icon("clock", "quick-icon")}<span>Manage Queues</span></button><button class="quick-card" data-view-jump="categories">${icon("grid", "quick-icon")}<span>Categories</span></button></div></section>
      </div>
    </div>`;
  }

  const originalRenderOverview = window.renderOverview;
  window.renderOverview = function renderOverviewIntegrated() {
    return liveOverview() || originalRenderOverview();
  };

  const originalRenderDownloads = window.renderDownloads;
  window.renderDownloads = function renderDownloadsIntegrated(kind) {
    if (previewRuntime()) return originalRenderDownloads(kind);
    const list = filterTasks(kind);
    const title = kind === "all" ? "downloads" : "unfinished";
    const activeCount = count(active);
    const queuedCount = count("queued");
    const completedCount = count("completed");
    const failedCount = count("failed");
    const pausedCount = count("paused");
    const cards = kind === "all" ? [
      statCard("blue", "ACTIVE", String(activeCount), "Currently downloading", "⇩", "#00a2ff"),
      statCard("orange", "QUEUED", String(queuedCount), "Waiting in queue", icon("clock"), "#ff790c"),
      statCard("green", "COMPLETED", String(completedCount), "Successfully completed", icon("check"), "#10db42"),
      statCard("red", "FAILED", String(failedCount), "Download failed", "×", "#ff3247"),
    ] : [
      statCard("blue", "DOWNLOADING", String(activeCount), "Active downloads", icon("download"), "#00a2ff"),
      statCard("orange", "PAUSED", String(pausedCount), "Paused downloads", "Ⅱ", "#ff790c"),
      statCard("orange", "QUEUED", String(queuedCount), "Waiting in queue", icon("clock"), "#ff790c"),
      statCard("red", "FAILED RETRY", String(failedCount), "Failed downloads", "↻", "#ff3247"),
    ];
    return `<div class="page">${pageHead(title, kind === "all" ? '<button class="btn primary" data-open-new>＋ New Download</button><button class="btn" data-open-link>↗ Add Link</button>' : "")}${emptyOffline()}
      <div class="stat-grid">${cards.join("")}</div>
      ${kind === "all" ? `<div class="filters"><label class="search-control"><span>⌕</span><input data-local-search placeholder="Search downloads..."></label>${["all", "downloading", "queued", "completed", "failed"].map(status => `<button class="btn small ${state.status === status ? "primary" : ""}" data-status-filter="${status}">${status === "all" ? "All Status" : taskStatusLabel(status)}</button>`).join("")}<button class="btn small">All Categories⌄</button><button class="btn small">All Sources⌄</button><button class="btn small">Newest First⌄</button><button class="btn icon-button" data-refresh>↻</button></div>` : ""}
      <section class="table-panel"><div class="table-scroll"><table class="data-table"><thead><tr><th class="file-col">${kind === "all" ? "File" : "Name"}</th>${kind === "all" ? "<th>Category</th><th>Source</th>" : ""}<th>Progress</th><th>Speed</th><th>ETA</th><th>Size</th>${kind !== "all" ? "<th>Source</th><th>Priority</th>" : ""}<th>Status</th><th class="actions-col">Actions</th></tr></thead><tbody>${list.length ? list.map(task => downloadTableRow(task, kind)).join("") : `<tr><td colspan="10"><div class="empty-live">No matching downloads.</div></td></tr>`}</tbody></table></div><div class="table-footer"><span>Showing ${list.length ? 1 : 0} to ${list.length} of ${list.length} ${kind === "all" ? "downloads" : "items"}</span><div class="pagination"><button class="page-button">‹</button><button class="page-button active">1</button><button class="page-button">›</button><button class="btn small">20 / page⌄</button></div></div></section>
    </div>`;
  };

  const originalRenderFinished = window.renderFinished;
  window.renderFinished = function renderFinishedIntegrated() {
    if (previewRuntime()) return originalRenderFinished();
    const completed = state.tasks.filter(task => task.status === "completed");
    const today = new Date().toDateString();
    const completedToday = completed.filter(task => task.finished && new Date(task.finished).toDateString() === today).length;
    const storageUsed = completed.reduce((sum, task) => sum + Number(task.raw?.total_bytes || 0), 0);
    const last = completed[0];
    return `<div class="page">${pageHead("finished")}${emptyOffline()}
      <div class="stat-grid">${statCard("green", "COMPLETED TODAY", String(completedToday), "Downloads", "✓", "#13d141")}${statCard("blue", "TOTAL COMPLETED", String(completed.length), "All time downloads", "⇩", "#00a2ff")}${statCard("", "LAST COMPLETED", last ? formatDate(last.finished) : "—", last?.name || "No completed downloads", "◷", "#9d22ff")}${statCard("orange", "STORAGE USED", bytes(storageUsed), "Across all completed files", "▣", "#ff790c")}</div>
      <section class="table-panel"><div class="panel-head"><h2>COMPLETED DOWNLOADS</h2></div><table class="data-table"><thead><tr><th class="file-col">File Name</th><th>Finished On</th><th>Size</th><th>Category</th><th>Source</th><th>Checksum</th><th class="actions-col">Actions</th></tr></thead><tbody>${completed.length ? completed.slice(0, 50).map(task => `<tr><td><div class="file-cell">${fileIcon(task.icon)}<div class="file-copy"><strong>${escapeHtml(task.name)}</strong></div></div></td><td>${escapeHtml(formatDate(task.finished))}</td><td>${escapeHtml(task.totalLabel)}</td><td><span class="category-pill ${pillClass(task.category)}">${escapeHtml(task.category)}</span></td><td>${escapeHtml(task.source)}</td><td style="color:${task.checksum === "Verified" ? "#15d640" : "#aeb6c5"}">${task.checksum === "Verified" ? "✓ Verified" : escapeHtml(task.checksum)}</td><td class="actions-col"><div class="action-icons"><button class="mini-action" data-task-action="open" data-task="${escapeHtml(task.id)}">↗</button><button class="mini-action red" data-task-action="delete" data-task="${escapeHtml(task.id)}">▣</button></div></td></tr>`).join("") : `<tr><td colspan="7"><div class="empty-live">No completed downloads.</div></td></tr>`}</tbody></table><div class="table-footer"><span>Showing ${completed.length ? 1 : 0} to ${Math.min(completed.length, 50)} of ${completed.length} entries</span><div class="pagination"><button class="page-button">‹</button><button class="page-button active">1</button><button class="page-button">›</button></div></div></section>
    </div>`;
  };

  const originalRenderQueues = window.renderQueues;
  window.renderQueues = function renderQueuesIntegrated() {
    if (previewRuntime()) return originalRenderQueues();
    const waiting = state.queues.filter(queue => queue.status === "Waiting").length;
    const scheduled = state.queues.filter(queue => queue.status === "Scheduled").length;
    const maximum = Number(state.settings.max_concurrent || 3);
    const totalBytes = state.queues.reduce((sum, queue) => sum + Number(state.tasks.find(task => task.id === queue.taskId)?.raw?.total_bytes || 0), 0);
    return `<div class="page">${pageHead("queues")}${emptyOffline()}
      <div class="queue-top">${statCard("orange", "WAITING", String(waiting), "In queue", "◷", "#ff790c")}${statCard("blue", "SCHEDULED", String(scheduled), "Scheduled", "▦", "#00a2ff")}${statCard("", "PRIORITY", state.queues[0]?.priority || "Normal", "Current mode", "⚑", "#9d22ff")}${statCard("green", "AUTO-START", "Enabled", "When downloads finish", "▶", "#13d141")}<section class="queue-rule-card"><h3>⚙ QUEUE RULES</h3><label>Max simultaneous downloads <input class="number-input" id="queue-max-concurrent" type="number" value="${maximum}"></label><label><input type="checkbox" checked> Start next queue automatically</label><label><input type="checkbox"> Stop queue on completion</label><label><input type="checkbox" checked> Respect download limits</label><button class="btn small" data-edit-queue-rules>Edit Queue Rules</button></section></div>
      <section class="table-panel"><table class="data-table"><thead><tr><th>#</th><th class="file-col">Queue Name / File</th><th>Category</th><th>Source</th><th>Size</th><th>Status</th><th>Priority</th><th>Scheduled</th><th class="actions-col">Actions</th></tr></thead><tbody>${state.queues.length ? state.queues.map((queue, index) => `<tr><td>${index + 1}</td><td><div class="file-copy"><strong>${escapeHtml(queue.name)}</strong><small>${escapeHtml(queue.queueName)} · ${escapeHtml(queue.name.split(".").pop()?.toUpperCase() || "FILE")}</small></div></td><td>▰ ${escapeHtml(queue.category)}</td><td>◎ ${escapeHtml(queue.source)}</td><td>${escapeHtml(queue.size)}</td><td>${queue.status === "Waiting" ? "🕘" : queue.status === "Scheduled" ? "▣" : "▶"} ${escapeHtml(queue.status)}</td><td><span class="priority-pill ${queue.priority.toLowerCase()}">${escapeHtml(queue.priority)}</span></td><td style="white-space:pre-line">${escapeHtml(queue.scheduled)}</td><td class="actions-col"><div class="action-icons"><button class="mini-action" data-queue-move="up" data-queue="${escapeHtml(queue.id)}">↑</button><button class="mini-action" data-queue-move="down" data-queue="${escapeHtml(queue.id)}">↓</button><button class="mini-action" data-queue-pause="${escapeHtml(queue.id)}">Ⅱ</button><button class="mini-action" data-queue-start="${escapeHtml(queue.id)}">▶</button><button class="mini-action" data-queue-delete="${escapeHtml(queue.id)}">▣</button></div></td></tr>`).join("") : `<tr><td colspan="9"><div class="empty-live">The queue is empty.</div></td></tr>`}</tbody></table><div class="table-footer"><span>Showing ${state.queues.length ? 1 : 0} to ${state.queues.length} of ${state.queues.length} queued tasks</span><strong>Total Queued Size:&nbsp;&nbsp;${bytes(totalBytes)}</strong></div></section>
      <div class="legend-bar"><strong>ACTIONS LEGEND</strong><span>↑ Move Up</span><span>↓ Move Down</span><span>Ⅱ Pause Queue</span><span>▶ Start Now</span><span>▣ Remove from Queue</span></div>
    </div>`;
  };

  function integratedSettings() {
    if (previewRuntime()) return null;
    const settings = state.settings || {};
    const defaultDir = settings.default_dir || "";
    const concurrent = Number(settings.max_concurrent || 3);
    const connections = Number(settings.default_connections || 16);
    return `<div class="page">${pageHead("settings")}${emptyOffline()}
      <div class="settings-grid">
        <section class="settings-card"><h3>⚙ General</h3>${settingRow("Launch Lumi on system startup", switchHTML(Boolean(state.desktopSettings?.startAtLogin)))}${settingRow("Start minimized to system tray", switchHTML(true))}${settingRow("When closing the window", '<select id="close-behaviour"><option>Minimize to tray</option></select>')}${settingRow("Language", '<select id="language-select"><option>English</option></select>')}${settingRow("Check for updates", '<select id="update-frequency"><option>Daily</option></select>')}${settingRow("Default download folder", `<div class="inline-field"><input id="default-download-folder" type="text" value="${escapeHtml(defaultDir)}"><button class="btn small" data-pick-default-folder>Browse</button></div>`)}</section>
        <section class="settings-card"><h3>⇩ Downloads</h3>${settingRow("Default download category", `<select id="default-category"><option value="">Uncategorized</option>${state.rawCategories.map(category => `<option value="${escapeHtml(category.id)}">${escapeHtml(category.name || category.id)}</option>`).join("")}</select>`)}${settingRow("Default download queue", `<select id="default-queue">${state.queueDefinitions.map(queue => `<option value="${escapeHtml(queue.id || "default")}">${escapeHtml(queue.name || queue.id || "Default Queue")}</option>`).join("") || '<option value="default">Default Queue</option>'}</select>`)}${settingRow("Max concurrent downloads", `<input id="max-concurrent" type="number" min="1" max="128" value="${concurrent}">`)}${settingRow("Max connections per download", `<input id="default-connections" type="number" min="1" max="128" value="${connections}">`)}${settingRow("If file exists", '<select id="duplicate-policy"><option value="ask">Ask what to do</option><option value="rename">Rename automatically</option><option value="overwrite">Overwrite</option></select>')}<label class="setting-row full"><span><input id="auto-start-downloads" type="checkbox" checked> Automatically start downloads</span></label><label class="setting-row full"><span><input id="add-to-top" type="checkbox"> Add downloads to top of queue</span></label><label class="setting-row full"><span><input id="smart-filename" type="checkbox" checked> Enable smart file name ⓘ</span></label></section>
        <section class="settings-card"><h3 style="color:#00a7ff">⌁ Network</h3><div style="font-size:13px;margin-bottom:8px">Connection type</div><label class="setting-row full"><span><input type="radio" name="connection" checked> Auto-detect (Recommended)</span></label><label class="setting-row full"><span><input type="radio" name="connection"> Direct connection</span></label><label class="setting-row full"><span><input type="radio" name="connection"> Manual proxy</span></label><hr style="border:0;border-top:1px solid rgba(108,126,160,.2)">${settingRow("Global download speed limit", switchHTML(false))}${settingRow("Maximum download speed", '<input id="max-download-speed" type="number" min="0" value="0">')}${settingRow("Maximum upload speed", '<input id="max-upload-speed" type="number" min="0" value="0">')}${settingRow("Rate limit mode", '<select><option>Per download</option></select>')}<button class="btn" data-test-network style="margin:10px auto 0;display:flex">▥ &nbsp;Test Network</button></section>
        <section class="settings-card"><h3>♧ Notifications</h3>${settingRow("Show desktop notifications", switchHTML(safeLocal.getItem("LUMI.notifications.downloadComplete") !== "false"))}${settingRow("Play sound on download complete", switchHTML(true))}${settingRow("Notify on download errors", switchHTML(true))}${settingRow("Notify on queue completion", switchHTML(false))}<hr style="border:0;border-top:1px solid rgba(108,126,160,.2)">${settingRow("Sound", '<select><option>Chime</option></select>')}${settingRow("Notification timeout", '<select><option>5 seconds</option></select>')}</section>
        <section class="settings-card"><h3>◉ Appearance</h3>${settingRow("Theme", `<select id="theme-select"><option value="dark" ${state.theme === "dark" ? "selected" : ""}>Lumi Dark (Default)</option><option value="light" ${state.theme === "light" ? "selected" : ""}>Lumi Light Glass</option></select>`)}<div class="setting-row"><span>Accent color</span><div class="color-dots"><i class="active" style="background:#9122ff"></i><i style="background:#147cff"></i><i style="background:#00b7d7"></i><i style="background:#00c94f"></i><i style="background:#ff7c0d"></i><i style="background:#f33b74"></i><i style="background:conic-gradient(red,yellow,lime,cyan,blue,magenta,red)"></i></div></div>${settingRow("UI density", '<select><option>Comfortable</option></select>')}${settingRow("Use system title bar", switchHTML(false))}${settingRow("Acrylic / Transparency", '<select><option>Medium</option></select>')}</section>
        <section class="settings-card"><h3>✚ Integrations</h3>${settingRow("Browser extension", '<span style="color:#18d247">Available &nbsp;&nbsp;<button class="btn small" data-control-jump="browser-extension">Manage</button></span>')}${settingRow("Clipboard monitoring", switchHTML(true))}${settingRow("Capture downloads from browsers", switchHTML(true))}${settingRow("Internet download capture", switchHTML(true))}<hr style="border:0;border-top:1px solid rgba(108,126,160,.2)">${settingRow("Export settings", '<button class="btn small" data-export-settings>Export</button>')}${settingRow("Import settings", '<button class="btn small" data-import-settings>Import</button>')}${settingRow("Reset settings", '<button class="btn small danger" data-reset-settings>Reset</button>')}</section>
      </div>
      <div class="setting-bottom"><button class="btn ghost" data-restore-defaults>↻ &nbsp;Restore Defaults</button><div><button class="btn" data-view-jump="overview">Cancel</button> <button class="btn primary" data-save-settings>Save Changes</button></div></div>
    </div>`;
  }

  const originalRenderSettings = window.renderSettings;
  window.renderSettings = function renderSettingsIntegrated() {
    return integratedSettings() || originalRenderSettings();
  };

  const originalRenderAbout = window.renderAbout;
  window.renderAbout = function renderAboutIntegrated() {
    if (previewRuntime()) return originalRenderAbout();
    const info = state.appInfo || {};
    const version = info.version || "development";
    return `<div class="page"><section class="panel about-panel"><h2>ⓘ &nbsp;About Lumi</h2><div class="about-center"><img class="about-logo" src="lumi-approved-brand.svg" alt="Lumi"><h3>Smart. Fast. Reliable.</h3><p>Lumi Download Manager is your all-in-one solution for faster downloads,<br>smarter management, and complete control.</p><div class="about-table"><div class="about-row"><span>◇ &nbsp;Version</span><b>${escapeHtml(version)}</b></div><div class="about-row"><span>⌁ &nbsp;Build</span><b>${escapeHtml(info.build || version)}</b></div><div class="about-row"><span>▣ &nbsp;Publisher</span><b>${escapeHtml(info.publisher || "THETECHGUY DIGITAL SOLUTIONS")}</b></div><div class="about-row"><span>◎ &nbsp;Website</span><b style="color:#a52cff">${escapeHtml(info.website || toolsUrl)}</b></div></div><p>© ${new Date().getFullYear()} THETECHGUY DIGITAL SOLUTIONS. All rights reserved.</p><p>Thank you for choosing <span style="color:#a62cff">Lumi</span> Download Manager.</p><div class="about-buttons"><button class="btn" data-website>Website&nbsp;&nbsp;↗</button><button class="btn" data-licenses>Licenses&nbsp;&nbsp;▤</button><button class="btn primary" data-view-jump="overview">× &nbsp;Close</button></div></div></section></div>`;
  };

  window.isPreviewRuntime = previewRuntime;
  window.maybeLoadProductionData = () => refreshLive({ full: true });

  async function openPath(path) {
    if (!path) throw new Error("No folder is configured");
    if (window.electronApp?.openPath) return window.electronApp.openPath(path);
    throw new Error("Folder opening is available in the Lumi desktop app");
  }

  async function saveSettings() {
    const theme = $("#theme-select")?.value || state.theme;
    state.theme = theme;
    safeLocal.setItem("lumi.theme", theme);
    if (previewRuntime()) { replica.render(); toast("Settings saved", "good"); return; }
    const defaultDir = $("#default-download-folder")?.value.trim() || state.settings.default_dir || "";
    const maximum = Number($("#max-concurrent")?.value || state.settings.max_concurrent || 3);
    const connections = Number($("#default-connections")?.value || state.settings.default_connections || 16);
    try {
      await Promise.all([
        api("POST", "/api/settings/default-dir", { dir: defaultDir }),
        api("POST", "/api/settings/concurrent", { value: maximum }),
        api("POST", "/api/settings/connections", { value: connections }),
      ]);
      await refreshLive({ full: true, renderAfter: true });
      toast("Settings saved", "good");
    } catch (error) { toast(error.message, "bad"); }
  }

  const previewOpenSpeedTest = window.openSpeedTest;
  const previewRunSpeedTest = window.runSpeedTest;
  const previewOpenUpdateDialog = window.openUpdateDialog;

  async function runRealSpeedTest() {
    if (previewRuntime()) return previewRunSpeedTest();
    if (state.speedTestRunning) return;
    state.speedTestRunning = true;
    state.speedResult = null;
    openSpeedTestIntegrated();
    try {
      let result = null;
      if (window.electronApp?.runConnectionCapacityTest) {
        result = await window.electronApp.runConnectionCapacityTest();
      } else {
        result = await api("GET", "/api/speedtest");
      }
      const bps = Number(result?.capacity_bps || result?.bps || result?.download_bps || 0);
      const uploadBps = Number(result?.upload_bps || state.netstats.tx_bps || 0);
      const ping = Number(result?.ping_ms || result?.latency_ms || 0);
      state.speedResult = { bps, uploadBps, ping };
      if (bps) state.netstats.capacity_bps = bps;
      updateStorageChrome();
      toast("Speed test complete", "good");
    } catch (error) {
      state.speedResult = { error: error.message || String(error) };
      toast(state.speedResult.error, "bad");
    } finally {
      state.speedTestRunning = false;
      openSpeedTestIntegrated();
    }
  }

  function openSpeedTestIntegrated() {
    if (previewRuntime()) return previewOpenSpeedTest();
    const result = state.speedResult || {};
    const panel = $("#floating-panel");
    panel.hidden = false;
    panel.innerHTML = `<div style="display:flex;justify-content:space-between;align-items:center"><h2>Speed Test</h2><button class="modal-close" data-close-floating>×</button></div><div class="speed-test-row"><span>Status</span><b id="speed-status">● &nbsp;${state.speedTestRunning ? "Testing" : result.error ? "Failed" : result.bps ? "Complete" : "Idle"}</b></div><div class="speed-test-row"><span>Download Speed</span><b id="speed-download">${state.speedTestRunning ? "Testing…" : result.bps ? mbps(result.bps) : "— — — Mbps"}</b></div><div class="speed-test-row"><span>Upload Speed</span><b id="speed-upload">${state.speedTestRunning ? "Testing…" : result.uploadBps ? mbps(result.uploadBps) : "Unavailable"}</b></div><div class="speed-test-row"><span>Ping</span><b id="speed-ping">${state.speedTestRunning ? "Testing…" : result.ping ? `${result.ping.toFixed(0)} ms` : "Unavailable"}</b></div>${result.error ? `<div class="speed-test-error">${escapeHtml(result.error)}</div>` : ""}<button class="btn primary" style="width:100%;margin-top:10px" data-start-speed-test ${state.speedTestRunning ? "disabled" : ""}>${state.speedTestRunning ? "Testing…" : result.bps ? "↻  Test Again" : "▷  Start Test"}</button>`;
  }

  window.openSpeedTest = openSpeedTestIntegrated;
  window.runSpeedTest = runRealSpeedTest;

  async function openUpdateDialogIntegrated() {
    if (previewRuntime()) return previewOpenUpdateDialog();
    let info = state.appInfo || {};
    try { if (window.electronApp?.getAppInfo) info = { ...info, ...(await window.electronApp.getAppInfo()) }; }
    catch (_) {}
    state.appInfo = info;
    showModal(`${modalHeader("↻  Check for updates")}<div class="modal-body"><div class="setting-row"><span>Current version:</span><b>${escapeHtml(info.version || "development")}</b></div><div class="setting-row"><span>Update status:</span><b id="update-status-text" style="color:#aeb6c5">Checking…</b></div><div class="setting-row"><span>Last checked:</span><b>${escapeHtml(new Date().toLocaleString())}</b></div><hr style="border:0;border-top:1px solid rgba(110,128,163,.25)"><div id="update-detail" style="line-height:1.7;color:#cbd0db">Contacting the configured Lumi update channel.</div><div class="modal-actions"><button class="btn primary" data-check-update-now>Check again</button><button class="btn" data-close-modal>Close</button></div></div>`);
    await checkUpdate();
  }

  async function checkUpdate() {
    const status = $("#update-status-text");
    const detail = $("#update-detail");
    if (status) { status.textContent = "Checking…"; status.style.color = "#aeb6c5"; }
    try {
      if (!window.electronApp?.checkForUpdates) throw new Error("Update checks are available in the Lumi desktop app");
      const result = await window.electronApp.checkForUpdates(true);
      const text = String(result?.status || result?.state || "checked").replaceAll("_", " ");
      if (status) { status.textContent = text.charAt(0).toUpperCase() + text.slice(1); status.style.color = /available|downloaded|ready/i.test(text) ? "#14d640" : "#aeb6c5"; }
      if (detail) detail.textContent = result?.message || (result?.version || result?.releaseName ? `Latest reported version: ${result.version || result.releaseName}` : "Lumi completed the configured update check.");
    } catch (error) {
      if (status) { status.textContent = "Check failed"; status.style.color = "#ff5365"; }
      if (detail) detail.textContent = error.message || String(error);
    }
  }

  window.openUpdateDialog = openUpdateDialogIntegrated;

  async function loadFirmware() {
    if (previewRuntime() || !state.productionReady) return;
    try {
      if (!state.firmwareCatalogue) state.firmwareCatalogue = await api("GET", "/api/v5/firmware/catalogue");
      const params = new URLSearchParams({ provider: "all", brand: "Samsung", device: "SM-S928B", query: "", channel: "all", include_community: "true" });
      const response = await api("GET", `/api/v5/firmware/search?${params}`);
      state.firmwareResults = response.results || [];
      if (state.firmwareResults.length) {
        state.firmware = state.firmwareResults.map(item => [
          item.title || item.device || item.brand || "Firmware",
          item.device || item.brand || "—",
          item.build || item.version || "—",
          item.version || item.channel || "—",
          item.metadata?.region || item.region || "—",
          item.source_name || "Official source",
          item.file_type || item.channel || "Firmware",
          item.notes || item.source_group || "—",
          item.size ? bytes(item.size) : "—",
          item.release_date || "—",
          item.signed === false ? "Unsigned" : item.signed === true ? "Signed" : item.official ? "Official" : "Review",
          item,
        ]);
      } else state.firmware = [];
      if (state.view === "firmware") replica.render();
    } catch (error) { toast(`Firmware catalogue: ${error.message}`, "bad"); }
  }

  async function loadOperatingSystems() {
    if (previewRuntime() || !state.productionReady) return;
    try {
      if (!state.osCatalogue) state.osCatalogue = await api("GET", "/api/v5/os/catalogue");
      const params = new URLSearchParams({ family: "Windows", version: "", edition: "", architecture: "x64", channel: "all", language: "English", query: "" });
      const response = await api("GET", `/api/v5/os/search?${params}`);
      state.osResults = response.results || [];
      if (state.osResults.length) {
        state.os = state.osResults.map(item => [
          item.title || item.version || "Operating System",
          item.channel === "latest" ? "Latest" : "",
          item.file_type || item.metadata?.edition || "Recommended",
          item.metadata?.architecture || item.device || "x64",
          item.channel || "Stable",
          item.size ? bytes(item.size) : "—",
          item.build || item.release_date || item.version || "—",
          item,
        ]);
      } else state.os = [];
      if (state.view === "operating-systems") replica.render();
    } catch (error) { toast(`Operating systems: ${error.message}`, "bad"); }
  }

  async function stageCatalogueItem(item, kind) {
    const raw = item?.[item.length - 1];
    if (!raw?.url) throw new Error("This catalogue result does not provide a direct download URL");
    const endpoint = kind === "firmware" ? "/api/v5/firmware/stage" : "/api/v5/os/stage";
    const body = kind === "firmware" ? {
      url: raw.url,
      filename: raw.filename || "",
      target_dir: state.settings.default_dir || "",
      provider: raw.provider,
      source_name: raw.source_name,
      source_url: raw.source_url,
      brand: raw.brand,
      device: raw.device,
      version: raw.version,
      build: raw.build,
      channel: raw.channel,
      sha256: raw.sha256,
    } : {
      url: raw.url,
      filename: raw.filename || "",
      target_dir: state.settings.default_dir || "",
      family: raw.metadata?.os_family || raw.brand || "Windows",
      distribution: raw.metadata?.distribution || "",
      version: raw.version,
      edition: raw.file_type,
      architecture: raw.metadata?.architecture || raw.device,
      channel: raw.channel,
      provider: raw.provider,
      source_name: raw.source_name,
      source_url: raw.source_url,
      sha256: raw.sha256,
    };
    const task = await api("POST", endpoint, body);
    await api("POST", `/api/downloads/${encodeURIComponent(task.id)}/confirm`, {
      filename: task.filename,
      target_dir: state.settings.default_dir || "",
      connections: 0,
    });
    await refreshLive({ full: false });
    replica.switchView("downloads");
  }

  async function loadDesktopInfo() {
    if (!window.electronApp?.isElectron) return;
    try { state.appInfo = { ...state.appInfo, ...(await window.electronApp.getAppInfo?.()) }; } catch (_) {}
    try { state.desktopSettings = await window.electronApp.getDesktopSettings?.(); } catch (_) {}
    try {
      const current = await window.electronApp.getConnectionCapacity?.();
      if (current?.capacity_bps) state.netstats.capacity_bps = Number(current.capacity_bps);
    } catch (_) {}
    updateStorageChrome();
  }

  async function handleRealAction(event) {
    if (previewRuntime()) return;
    const target = event.target;
    const stop = () => { event.preventDefault(); event.stopImmediatePropagation(); };

    const windowButton = target.closest("[data-window-action]");
    if (windowButton) {
      stop();
      try {
        const result = await window.electronApp?.windowControl?.(windowButton.dataset.windowAction);
        if (windowButton.dataset.windowAction === "maximize") updateMaximizeButton(result);
      } catch (error) { toast(error.message, "bad"); }
      return;
    }

    if (target.closest("[data-live-retry]")) { stop(); await refreshLive({ full: true, renderAfter: true }); return; }
    if (target.closest("[data-open-folder]")) {
      stop();
      try { await openPath(state.settings.default_dir); toast("Opened selected download folder", "good"); }
      catch (error) { toast(error.message, "bad"); }
      return;
    }
    const categoryFolder = target.closest("[data-category-folder]");
    if (categoryFolder) {
      stop();
      const category = state.categories[Number(categoryFolder.dataset.categoryFolder)];
      try { await openPath(category?.[3]); } catch (error) { toast(error.message, "bad"); }
      return;
    }
    if (target.closest("[data-refresh]")) { stop(); await refreshLive({ full: false, renderAfter: true }); toast("Downloads refreshed", "good"); return; }
    if (target.closest("[data-save-settings]")) { stop(); await saveSettings(); return; }
    if (target.closest("[data-pick-default-folder]")) {
      stop();
      try {
        const value = await window.electronApp?.pickFolder?.();
        if (value && $("#default-download-folder")) $("#default-download-folder").value = value;
      } catch (error) { toast(error.message, "bad"); }
      return;
    }
    if (target.closest("[data-start-speed-test]")) { stop(); await runRealSpeedTest(); return; }
    if (target.closest("[data-check-update-now]")) { stop(); await checkUpdate(); return; }
    if (target.closest("[data-download-update], [data-skip-update]")) { stop(); await checkUpdate(); return; }

    const queueMove = target.closest("[data-queue-move]");
    if (queueMove) {
      stop();
      const queue = state.queues.find(item => item.id === queueMove.dataset.queue);
      if (!queue) return;
      const current = Number(state.tasks.find(task => task.id === queue.taskId)?.raw?.priority || 0);
      const next = current + (queueMove.dataset.queueMove === "up" ? 10 : -10);
      try { await api("POST", `/api/downloads/${encodeURIComponent(queue.taskId)}/priority`, { priority: next }); await refreshLive({ full: false, renderAfter: true }); }
      catch (error) { toast(error.message, "bad"); }
      return;
    }
    const queuePause = target.closest("[data-queue-pause]");
    if (queuePause) { stop(); try { await api("POST", `/api/downloads/${encodeURIComponent(queuePause.dataset.queuePause)}/pause`, {}); await refreshLive({ full: false, renderAfter: true }); } catch (error) { toast(error.message, "bad"); } return; }
    const queueStart = target.closest("[data-queue-start]");
    if (queueStart) { stop(); try { await api("POST", `/api/downloads/${encodeURIComponent(queueStart.dataset.queueStart)}/resume`, {}); await refreshLive({ full: false, renderAfter: true }); } catch (error) { toast(error.message, "bad"); } return; }
    const queueDelete = target.closest("[data-queue-delete]");
    if (queueDelete) { stop(); try { await api("POST", `/api/downloads/${encodeURIComponent(queueDelete.dataset.queueDelete)}/queue`, { queue_id: "default" }); await refreshLive({ full: true, renderAfter: true }); toast("Moved to the default queue", "good"); } catch (error) { toast(error.message, "bad"); } return; }
    if (target.closest("[data-save-queue-rules]")) {
      stop();
      const value = Number($("#queue-max-concurrent")?.value || $("#modal input[type=number]")?.value || state.settings.max_concurrent || 3);
      try { await api("POST", "/api/settings/concurrent", { value }); closeModal(); await refreshLive({ full: true, renderAfter: true }); toast("Queue rules saved", "good"); } catch (error) { toast(error.message, "bad"); }
      return;
    }

    const saveCategory = target.closest("[data-save-category]");
    if (saveCategory) {
      stop();
      const index = Number($("#modal")?.dataset.categoryIndex || -1);
      const original = state.categories[index]?.[7] || {};
      const inputs = $$("#modal input");
      const name = inputs[0]?.value.trim();
      const extensions = (inputs[1]?.value || "").split(",").map(value => value.trim().replace(/^\./, "")).filter(Boolean);
      const folder = inputs[2]?.value.trim();
      if (!name) { toast("Category name is required", "bad"); return; }
      try {
        await api("POST", "/api/categories", { ...original, id: original.id || name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""), name, extensions, folder });
        closeModal(); await refreshLive({ full: true, renderAfter: true }); toast("Category updated", "good");
      } catch (error) { toast(error.message, "bad"); }
      return;
    }

    if (target.closest("[data-paste-links], [data-scan-clipboard]")) {
      stop();
      try {
        state.grabInput = await navigator.clipboard.readText();
        toast(state.grabInput.trim() ? "Links pasted from clipboard" : "Clipboard is empty", state.grabInput.trim() ? "good" : "bad");
      } catch (error) { toast("Clipboard access is unavailable", "bad"); }
      return;
    }
    if (target.closest("[data-import-file]")) {
      stop();
      const input = document.createElement("input"); input.type = "file"; input.accept = ".txt,text/plain";
      input.addEventListener("change", async () => { const file = input.files?.[0]; if (file) { state.grabInput = await file.text(); toast("Link file imported", "good"); } });
      input.click();
      return;
    }
    if (target.closest("[data-grab-links]")) {
      stop();
      const urls = String(state.grabInput || "").split(/\s+/).filter(value => /^https?:\/\//i.test(value));
      if (!urls.length) { toast("Paste at least one web address first", "bad"); return; }
      try {
        const responses = await Promise.all(urls.map(url => api("POST", "/api/grab", { url })));
        state.links = responses.flatMap(response => (response.links || []).map((link, index) => {
          const url = typeof link === "string" ? link : link.url;
          const name = typeof link === "string" ? sourceHost(link) : link.filename || link.title || `Link ${index + 1}`;
          return [name, sourceHost(url), "1 file", link.size ? bytes(link.size) : "Unknown", "Auto Detect", "Ready", url];
        }));
        replica.render(); toast("Links validated and grouped", "good");
      } catch (error) { toast(error.message, "bad"); }
      return;
    }
    const addGrabbed = target.closest("[data-add-grabbed]");
    if (addGrabbed) {
      stop();
      const item = state.links[Number(addGrabbed.dataset.addGrabbed)];
      const url = item?.[6];
      if (!url) { toast("This package has no usable URL", "bad"); return; }
      try { await api("POST", "/api/batch/start", { urls: [url], target_dir: state.settings.default_dir || "" }); await refreshLive({ full: false }); replica.switchView("downloads"); toast("Link added to downloads", "good"); } catch (error) { toast(error.message, "bad"); }
      return;
    }

    const firmwareButton = target.closest("[data-firmware-download]");
    if (firmwareButton) {
      stop();
      try { await stageCatalogueItem(state.firmware[Number(firmwareButton.dataset.firmwareDownload)], "firmware"); toast("Firmware queued", "good"); } catch (error) { toast(error.message, "bad"); }
      return;
    }
    const osButton = target.closest("[data-os-download]");
    if (osButton) {
      stop();
      try { await stageCatalogueItem(state.os[Number(osButton.dataset.osDownload)], "os"); toast("Operating system queued", "good"); } catch (error) { toast(error.message, "bad"); }
      return;
    }

    if (target.closest("[data-install-extension], [data-open-extension]")) { stop(); openExternal(extensionUrl); return; }
    if (target.closest("[data-disconnect-extension]")) { stop(); toast("Extension access is controlled from the browser extension page", "good"); openExternal(extensionUrl); return; }
    if (target.closest("[data-submit-bug]")) {
      stop();
      const title = $("#bug-title")?.value.trim();
      const description = $("#bug-description")?.value.trim();
      if (!title || !description) { toast("Issue title and description are required", "bad"); return; }
      const category = $("#bug-category")?.value || "Lumi";
      const subject = encodeURIComponent(`[Lumi ${category}] ${title}`);
      const body = encodeURIComponent(`${description}\n\nLumi version: ${state.appInfo.version || "unknown"}`);
      openExternal(`mailto:support@thetechguyds.com?subject=${subject}&body=${body}`);
      toast("Bug report prepared in your email app", "good");
      return;
    }
    if (target.closest("[data-help-center], [data-community]")) { stop(); openExternal(supportUrl); return; }
    if (target.closest("[data-email-support]")) { stop(); openExternal("mailto:support@thetechguyds.com?subject=Lumi%20Support"); return; }
    if (target.closest("[data-website]")) { stop(); openExternal(toolsUrl); return; }
    if (target.closest(".privacy-bar .btn")) { stop(); openExternal(privacyUrl); return; }
  }

  function openExternal(url) {
    if (window.electronApp?.openExternal) return window.electronApp.openExternal(url);
    window.open(url, "_blank", "noopener");
  }

  function updateMaximizeButton(value = {}) {
    const button = $("[data-window-action=maximize]");
    if (!button) return;
    button.textContent = value.maximized ? "❐" : "□";
    button.setAttribute("aria-label", value.maximized ? "Restore" : "Maximize");
  }

  function patchCategoryButtons() {
    if (state.view !== "categories") return;
    $$("[data-category-edit]").forEach(button => {
      button.addEventListener("click", () => { const modal = $("#modal"); if (modal) modal.dataset.categoryIndex = button.dataset.categoryEdit; }, { once: true });
    });
    $$("[data-open-folder]").forEach((button, index) => {
      if (button.closest("tbody")) { button.removeAttribute("data-open-folder"); button.dataset.categoryFolder = String(index); }
    });
  }

  const originalRender = replica.render;
  replica.render = function renderIntegrated() {
    originalRender();
    patchCategoryButtons();
  };
  window.render = replica.render;

  const originalSwitchView = replica.switchView;
  replica.switchView = function switchViewIntegrated(view) {
    originalSwitchView(view);
    if (view === "firmware") void loadFirmware();
    if (view === "operating-systems") void loadOperatingSystems();
    if (view === "about") void loadDesktopInfo().then(() => replica.render());
  };
  window.switchView = replica.switchView;

  document.addEventListener("click", event => { void handleRealAction(event); }, true);

  document.addEventListener("DOMContentLoaded", async () => {
    if (previewRuntime()) return;
    await loadDesktopInfo();
    if (window.electronApp?.getWindowState) {
      try { updateMaximizeButton(await window.electronApp.getWindowState()); } catch (_) {}
      window.electronApp.onWindowState?.(updateMaximizeButton);
    }
    window.electronApp?.onConnectionCapacity?.(value => {
      if (value?.capacity_bps) { state.netstats.capacity_bps = Number(value.capacity_bps); updateStorageChrome(); }
    });
    window.electronApp?.onServerState?.(value => {
      if (value?.ready === false || value?.online === false) {
        state.productionOffline = true;
        state.productionError = value.error || "The local Lumi engine is unavailable.";
      }
    });
    clearInterval(state.livePollTimer);
    state.livePollTimer = setInterval(() => { void refreshLive({ full: false, renderAfter: ["overview", "downloads", "unfinished", "finished", "queues"].includes(state.view) }); }, 2200);
  });

  window.LumiProductionIntegration = {
    api,
    previewRuntime,
    refreshLive,
    runSpeedTest: runRealSpeedTest,
    loadFirmware,
    loadOperatingSystems,
  };
})();
