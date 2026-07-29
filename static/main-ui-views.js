"use strict";
(() => {
  const UI = window.LumiMainUI;
  const { ACTIVE, UNFINISHED, BRAND, h, number, rate, bytes, date, pct, label, tasks, queues, categories, iconSvg, stat, assetFor } = UI;
  function renderOverviewPrimary() {
    const element = document.getElementById("view-overview");
    if (!element) return;
    const list = tasks();
    const counts = state?.overview?.counts || {};
    const downloading = list.filter(task => ACTIVE.has(task.status)).length;
    const completed = number(counts.completed || list.filter(task => task.status === "completed").length);
    const queued = number(counts.queued || list.filter(task => task.status === "queued").length);
    const failed = number(counts.failed || list.filter(task => task.status === "failed").length);
    const total = list.length || completed + downloading + queued + failed;
    const speed = number(state?.overview?.total_speed_bytes_per_sec || 0);
    const upload = number(state?.overview?.upload_speed_bytes_per_sec || 0);
    const latency = number(state?.overview?.latency_ms || 12);
    const completedPct = total ? completed / total * 100 : 0;
    const downloadingPct = total ? downloading / total * 100 : 0;
    const queuedPct = total ? queued / total * 100 : 0;
    const recent = list.slice(0, 3);
    const bars = [42,58,73,47,68,54,81,65,59,78,62,72,86,63,69,77,55,82,66,74,88,61,70,79,57,72,64,77];
    element.innerHTML = `<div class="lumi-overview">
      <div class="lumi-overview-head"><h2>Overview</h2><p>Complete summary of your download activity</p></div>
      <div class="lumi-stat-grid">
        ${stat("purple", "Total Downloads", total, "All time downloads", "download", "#9c2cff")}
        ${stat("blue", "Downloading", downloading, "Active downloads", "download", "#1687ff")}
        ${stat("green", "Completed", completed, "Successfully completed", "check", "#19c64d")}
        ${stat("orange", "Queued", queued, "Waiting in queue", "clock", "#f27913")}
      </div>
      <div class="lumi-overview-row">
        <section class="lumi-panel"><div class="lumi-panel-head"><h3>Download Speed</h3><button class="btn">This session⌄</button></div><div class="lumi-speed-body"><div class="lumi-speed-value">${h(rate(speed))}</div><div class="lumi-speed-sub">Current speed</div><div class="lumi-bars">${bars.map(height => `<i style="height:${height}%"></i>`).join("")}</div><div class="lumi-speed-metrics"><div class="lumi-speed-metric">${iconSvg("download")}<div><b>${h(rate(speed))}</b><small>Download</small></div></div><div class="lumi-speed-metric"><svg viewBox="0 0 24 24"><path d="M12 21V8m-5 5 5-5 5 5"/></svg><div><b>${h(rate(upload))}</b><small>Upload</small></div></div><div class="lumi-speed-metric">${iconSvg("clock")}<div><b>${latency} ms</b><small>Latency</small></div></div></div></div></section>
        <section class="lumi-panel"><div class="lumi-panel-head"><h3>Downloads by Status</h3></div><div class="lumi-status-wrap"><div class="lumi-donut" style="--completed:${completedPct}%;--downloading:${completedPct + downloadingPct}%;--queued:${completedPct + downloadingPct + queuedPct}%"><div class="lumi-donut-center"><strong>${total}</strong><span>Total</span></div></div><div class="lumi-legend">${[["#14bf40","Completed",completed,completedPct],["#7514ed","Downloading",downloading,downloadingPct],["#ff760f","Queued",queued,queuedPct],["#566275","Failed",failed,total ? failed / total * 100 : 0]].map(item => `<div class="lumi-legend-row"><i style="background:${item[0]}"></i><span>${item[1]}</span><strong>${item[2]} (${item[3].toFixed(1)}%)</strong></div>`).join("")}</div></div></section>
      </div>
      <div class="lumi-overview-row">
        <section class="lumi-panel"><div class="lumi-panel-head"><h3>Recent Downloads</h3><button class="btn" data-action="view-all">View all</button></div><div class="lumi-recent">${recent.length ? recent.map(task => `<div class="lumi-recent-row download-row" data-task="${h(task.id)}"><div class="lumi-file"><img class="lumi-file-logo" src="${assetFor(task.filename || task.url, task.category_id)}" alt=""><div class="lumi-file-copy"><strong>${h(task.filename || task.url || "Download")}</strong><small>${h(rate(task.speed_bytes_per_sec || 0))} · ${h(bytes(task.downloaded_bytes || 0))}</small></div></div><strong class="lumi-recent-pct">${Math.round(pct(task))}%</strong>${rowAction(task)}</div>`).join("") : '<div class="lumi-empty">No downloads yet</div>'}</div></section>
        <section class="lumi-panel"><div class="lumi-panel-head"><h3>Quick Actions</h3></div><div class="lumi-quick-grid"><button class="lumi-quick" data-main-open-new>${iconSvg("plus")}<span>New Download</span></button><button class="lumi-quick" data-main-open-new>${iconSvg("link")}<span>Add Link</span></button><button class="lumi-quick" data-action="open-folder">${iconSvg("folder")}<span>Open Folder</span></button><button class="lumi-quick" data-main-view="settings">${iconSvg("gear")}<span>Settings</span></button><button class="lumi-quick" data-main-view="queues">${iconSvg("clock")}<span>Manage Queues</span></button><button class="lumi-quick danger" data-action="clear-done">${iconSvg("download")}<span>Clear Completed</span></button></div></section>
      </div>
    </div>`;
  }

  function statusCounts(list) {
    return {
      all: list.length,
      running: list.filter(item => ACTIVE.has(item.status)).length,
      queued: list.filter(item => item.status === "queued").length,
      paused: list.filter(item => item.status === "paused").length,
      failed: list.filter(item => item.status === "failed").length,
      completed: list.filter(item => item.status === "completed").length,
    };
  }

  function pageHead(title, subtitle, action = "") {
    return `<div class="lumi-page-head"><div><h2>${h(title)}</h2><p>${h(subtitle)}</p></div><div class="lumi-page-actions">${action}</div></div>`;
  }

  function filterButton(key, text) {
    return `<button class="lumi-filter ${state.statusFilter === key ? "active" : ""}" data-action="status-filter" data-status="${h(key)}">${h(text)}</button>`;
  }

  function rowAction(task) {
    let action = "inspect", symbol = "⋯", cls = "";
    if (["running", "resolving", "queued", "post_processing"].includes(task.status)) { action = "pause"; symbol = "Ⅱ"; }
    else if (["paused", "failed", "cancelled"].includes(task.status)) { action = task.status === "paused" ? "resume" : "retry"; symbol = "▶"; }
    else if (task.status === "completed") { action = "open"; symbol = "▣"; cls = " completed"; }
    return `<button class="lumi-row-action${cls}" type="button" data-main-task-action="${action}" data-task="${h(task.id)}" aria-label="${h(action)}">${symbol}</button>`;
  }

  function downloadRow(task, finished = false) {
    const filename = task.filename || task.url || task.id || "Download";
    const meta = [task.category_id || task.type || "download", task.queue_id || "default"].filter(Boolean).join(" · ");
    if (finished) {
      return `<article class="lumi-row download-row" data-task="${h(task.id)}"><div class="lumi-file"><img class="lumi-file-logo" src="${assetFor(filename, task.category_id)}" alt=""><div class="lumi-file-copy"><strong title="${h(filename)}">${h(filename)}</strong><small>${h(meta)} · Verified and ready</small></div></div><div class="lumi-cell"><strong>${bytes(task.total_bytes || task.downloaded_bytes)}</strong><small>Completed file</small></div><div class="lumi-cell"><strong>${h(date(task.finished_at || task.updated_at))}</strong><small>Completed</small></div><div class="lumi-cell"><strong title="${h(task.path || task.final_path || task.target_dir || "")}">${h(task.path || task.final_path || task.target_dir || "Download folder")}</strong><small>Location</small></div>${rowAction(task)}</article>`;
    }
    const progressValue = pct(task);
    const eta = number(task.speed_bytes_per_sec) > 0 && number(task.total_bytes) > number(task.downloaded_bytes) && typeof fmtDuration === "function" ? fmtDuration((number(task.total_bytes) - number(task.downloaded_bytes)) / number(task.speed_bytes_per_sec)) : "";
    return `<article class="lumi-row download-row" data-task="${h(task.id)}"><div class="lumi-file"><img class="lumi-file-logo" src="${assetFor(filename, task.category_id)}" alt=""><div class="lumi-file-copy"><strong title="${h(filename)}">${h(filename)}</strong><small>${h(meta)} · ${bytes(task.downloaded_bytes)} of ${bytes(task.total_bytes)}</small></div></div><div class="lumi-status ${h(task.status)}">${h(label(task.status))}</div><div class="lumi-cell"><strong>${bytes(task.total_bytes)}</strong><small>${bytes(task.downloaded_bytes)} received</small></div><div class="lumi-progress"><div class="lumi-track"><div class="lumi-fill ${h(task.status)}" style="width:${progressValue}%"></div></div><span>${Math.round(progressValue)}%</span></div><div class="lumi-cell"><strong>${number(task.speed_bytes_per_sec) ? rate(task.speed_bytes_per_sec) : "—"}</strong><small>${h(eta || task.mode || "")}</small></div>${rowAction(task)}</article>`;
  }

  function renderDownloadsPrimary(kind) {
    const id = kind === "all" ? "downloads" : kind;
    const element = document.getElementById(`view-${id}`);
    if (!element) return;
    let list = typeof searched === "function" ? searched(tasks()) : tasks();
    if (kind === "unfinished") list = list.filter(task => UNFINISHED.has(task.status));
    if (kind === "finished") list = list.filter(task => task.status === "completed");
    if (state.statusFilter !== "all") {
      if (state.statusFilter === "running") list = list.filter(task => ACTIVE.has(task.status));
      else list = list.filter(task => task.status === state.statusFilter);
    }
    const base = kind === "all" ? tasks() : kind === "unfinished" ? tasks().filter(task => UNFINISHED.has(task.status)) : tasks().filter(task => task.status === "completed");
    const counts = statusCounts(base);
    const title = kind === "all" ? "All Downloads" : kind === "unfinished" ? "Unfinished" : "Finished";
    const subtitle = kind === "all" ? "Every download in one organised view" : kind === "unfinished" ? "Active, paused and queued downloads" : "Successfully completed downloads";
    const action = kind === "finished" ? '<button class="lumi-secondary" data-action="open-folder">Open Downloads Folder</button><button class="lumi-danger" data-action="clear-done">Clear Completed</button>' : '<button class="lumi-primary" type="button" data-main-open-new>＋ New Download</button>';
    const filters = kind === "finished"
      ? `${filterButton("all", `All ${counts.all}`)}${filterButton("completed", `Completed ${counts.completed}`)}`
      : `${filterButton("all", kind === "unfinished" ? `All Unfinished ${counts.all}` : `All ${counts.all}`)}${filterButton("running", `Downloading ${counts.running}`)}${filterButton("queued", `Queued ${counts.queued}`)}${filterButton("paused", `Paused ${counts.paused}`)}${kind === "all" ? filterButton("completed", `Completed ${counts.completed}`) + filterButton("failed", `Failed ${counts.failed}`) : filterButton("failed", `Failed ${counts.failed}`)}`;
    const finished = kind === "finished";
    element.innerHTML = `<div class="lumi-page ${finished ? "lumi-finished" : ""}">${pageHead(title, subtitle, action)}<div class="lumi-filters">${filters}<span class="lumi-spacer"></span><button class="lumi-icon-button" data-action="refresh" title="Refresh">↻</button></div><section class="lumi-table"><div class="lumi-table-head">${finished ? "<span>Name</span><span>Size</span><span>Completed</span><span>Location</span><span>Action</span>" : "<span>Name</span><span>Status</span><span>Size</span><span>Progress</span><span>Speed</span><span>Action</span>"}</div>${list.length ? list.map(task => downloadRow(task, finished)).join("") : '<div class="lumi-empty"><div><strong>No matching downloads</strong><p>Change the filter or add a new download.</p></div></div>'}<div class="lumi-table-foot"><span>${list.length} item${list.length === 1 ? "" : "s"}</span><span>${finished ? `${bytes(list.reduce((sum,item) => sum + number(item.total_bytes || item.downloaded_bytes),0))} stored` : `${counts.running} downloading · ${counts.queued} queued · ${counts.completed} completed`}</span></div></section></div>`;
  }

  function renderQueuesPrimary() {
    const element = document.getElementById("view-queues");
    if (!element) return;
    const countMap = {};
    tasks().forEach(task => {
      const key = task.queue_id || "default";
      countMap[key] ||= { total: 0, running: 0, waiting: 0 };
      countMap[key].total += 1;
      if (ACTIVE.has(task.status)) countMap[key].running += 1;
      if (["queued", "paused", "needs_link"].includes(task.status)) countMap[key].waiting += 1;
    });
    element.innerHTML = `<div class="lumi-page">${pageHead("Queues", "Control download order, schedules and limits", '<button class="lumi-primary" data-action="open-queue-modal">＋ New Queue</button>')}<div class="lumi-card-grid">${queues().length ? queues().map(queue => {
      const c = countMap[queue.id] || { total: 0, running: 0, waiting: 0 };
      const active = queue.active !== false;
      return `<article class="lumi-card"><div class="lumi-card-head"><div class="lumi-card-icon"><img src="${BRAND.lumi}" alt=""></div><div class="lumi-card-title"><h3>${h(queue.name || queue.id)}</h3><p>${h(queue.description || queue.id || "Download queue")}</p></div><button class="lumi-card-menu" type="button">⋮</button></div><div class="lumi-metrics"><div class="lumi-metric"><strong>${c.running}</strong><small>Running</small></div><div class="lumi-metric"><strong>${c.waiting}</strong><small>Waiting</small></div><div class="lumi-metric"><strong>${queue.speed_limit_bps ? rate(queue.speed_limit_bps) : "Unlimited"}</strong><small>Speed limit</small></div></div><div class="lumi-card-bottom"><span class="lumi-state ${active ? "" : "paused"}">${active ? "Active" : "Paused"}</span><div class="lumi-card-actions"><button data-action="toggle-queue" data-id="${h(queue.id)}" data-active="${active}">${active ? "Ⅱ" : "▶"}</button>${queue.id !== "default" ? `<button data-action="delete-queue" data-id="${h(queue.id)}">×</button>` : ""}</div></div></article>`;
    }).join("") : '<div class="lumi-empty"><div><strong>No queues yet</strong><p>Create a queue to control order and limits.</p></div></div>'}</div></div>`;
  }

  function categoryAsset(category) {
    const text = `${category.name || ""} ${category.id || ""}`.toLowerCase();
    if (text.includes("compressed") || text.includes("archive")) return BRAND.archive;
    if (text.includes("operating") || text.includes("iso")) return BRAND.windows;
    if (text.includes("android")) return BRAND.android;
    return BRAND.lumi;
  }

  function renderCategoriesPrimary() {
    const element = document.getElementById("view-categories");
    if (!element) return;
    const stats = {};
    tasks().forEach(task => {
      const key = task.category_id || "other";
      stats[key] ||= { count: 0, bytes: 0 };
      stats[key].count += 1;
      stats[key].bytes += number(task.total_bytes || task.downloaded_bytes);
    });
    element.innerHTML = `<div class="lumi-page">${pageHead("Categories", "Organise downloads automatically by type", '<button class="lumi-primary" data-action="open-category-modal">＋ New Category</button>')}<div class="lumi-card-grid">${categories().length ? categories().map(category => {
      const s = stats[category.id] || { count: 0, bytes: 0 };
      return `<article class="lumi-card"><div class="lumi-card-head"><div class="lumi-card-icon"><img src="${categoryAsset(category)}" alt=""></div><div class="lumi-card-title"><h3>${h(category.name || category.id)}</h3><p>${h((category.extensions || []).length ? `${category.extensions.length} file rules` : "Automatic download category")}</p></div><button class="lumi-card-menu" ${category.id !== "other" ? `data-action="delete-category" data-id="${h(category.id)}"` : ""}>⋮</button></div><div class="lumi-category-stats"><div class="lumi-category-stat"><strong>${s.count}</strong><small>Downloads</small></div><div class="lumi-category-stat"><strong>${bytes(s.bytes)}</strong><small>Storage used</small></div></div><div class="lumi-folder"><small>Folder rule</small><code>${h(category.folder || category.name || "Other")}</code></div></article>`;
    }).join("") : '<div class="lumi-empty"><div><strong>No categories yet</strong><p>Create a category to organise completed files.</p></div></div>'}</div></div>`;
  }

  function grabResultRow(item, index) {
    const filename = item.filename || item.title || (typeof fileNameFromUrl === "function" ? fileNameFromUrl(item.url) : item.url) || `Link ${index + 1}`;
    let host = "Source";
    try { host = new URL(item.url).hostname; } catch (_) {}
    return `<article class="lumi-row"><div class="lumi-file"><input class="lumi-result-check" type="checkbox" data-grab-index="${index}" checked><img class="lumi-file-logo" src="${assetFor(filename, item.type || item.ext)}" alt=""><div class="lumi-file-copy"><strong>${h(filename)}</strong><small title="${h(item.url)}">${h(item.url)}</small></div></div><div class="lumi-cell"><strong>${h(item.host || host)}</strong><small>Source</small></div><div class="lumi-inline"><span class="lumi-checkmark"></span><strong style="color:#2bcb63;font-size:10px">Ready</strong></div><div class="lumi-cell"><strong>${item.size ? bytes(item.size) : "—"}</strong><small>${h(item.type || item.ext || "file")}</small></div><button class="lumi-row-action completed" data-main-queue-one="${index}" aria-label="Queue">↓</button></article>`;
  }

  function renderGrabberPrimary() {
    const element = document.getElementById("view-grabber");
    if (!element) return;
    const results = Array.isArray(state.grabResults) ? state.grabResults : [];
    element.innerHTML = `<div class="lumi-page">${pageHead("LinkGrabber", "Collect links, inspect them and start downloads", '<button class="lumi-primary" data-main-open-new>＋ Add Links</button>')}<section class="lumi-grabber-box"><form data-form="grabber"><label>Paste page URL<textarea class="lumi-textarea" name="url" required placeholder="https://example.com/downloads"></textarea></label><input type="hidden" name="mode" value="single"><input type="hidden" name="max_pages" value="10"><input type="hidden" name="include_videos" value="on"><input type="hidden" name="include_files" value="on"><div class="lumi-grabber-meta"><span>Supports HTTP, HTTPS and FTP pages</span><button class="lumi-primary" type="submit">Analyse Links</button></div></form></section><section class="lumi-table lumi-result"><div class="lumi-table-head"><span>Detected file</span><span>Source</span><span>Status</span><span>Size</span><span>Action</span></div>${results.length ? results.map(grabResultRow).join("") : '<div class="lumi-empty"><div><strong>No links analysed yet</strong><p>Paste a page URL above to inspect downloadable resources.</p></div></div>'}<div class="lumi-table-foot"><span>${results.length} link${results.length === 1 ? "" : "s"} detected</span>${results.length ? '<button class="lumi-primary" data-action="queue-grabbed">Queue selected</button>' : "<span>Ready for a page URL</span>"}</div></section></div>`;
  }

  Object.assign(UI, { renderOverviewPrimary, renderDownloadsPrimary, renderQueuesPrimary, renderCategoriesPrimary, renderGrabberPrimary });
})();
