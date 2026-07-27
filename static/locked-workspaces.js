"use strict";
(() => {
  const VIEWS = new Set(["downloads", "unfinished", "finished", "queues", "categories", "grabber"]);
  const LOCAL = Object.freeze({
    Windows: "/static/brand/windows.svg",
    Apple: "/static/brand/apple.svg",
    Android: "/static/brand/android.svg",
    Ubuntu: "/static/brand/ubuntu.svg",
    Linux: "/static/brand/linux.svg",
    Archive: "/static/brand/archive.svg",
    Lumi: "/static/favicon-96.png",
  });

  const CSS = `
  .lwx-page{display:grid;gap:16px;min-width:0;color:#f2f5fb}.lwx-page *{box-sizing:border-box}.lwx-head{display:flex;align-items:flex-start;justify-content:space-between;gap:18px}.lwx-head h2{margin:0;font-size:20px;line-height:1.2}.lwx-head p{margin:5px 0 0;color:#8792a8;font-size:11px}.lwx-head-actions{display:flex;gap:9px;align-items:center}.lwx-primary,.lwx-secondary,.lwx-danger,.lwx-icon-btn{border:1px solid rgba(116,135,166,.25);border-radius:9px;background:rgba(8,15,26,.94);color:#eef2f9;min-height:36px;padding:0 15px;font-weight:700;cursor:pointer}.lwx-primary{background:linear-gradient(100deg,#7b16d6,#4f0ba0);border-color:#a53dff;box-shadow:0 8px 20px rgba(99,18,172,.18)}.lwx-danger{color:#ff4c59;border-color:rgba(255,76,89,.28);background:rgba(64,10,18,.45)}.lwx-icon-btn{width:38px;padding:0;display:grid;place-items:center}.lwx-filters{display:flex;align-items:center;gap:8px;flex-wrap:wrap}.lwx-filter{border:1px solid rgba(111,130,160,.2);border-radius:999px;background:#0a1220;color:#9ca8ba;padding:8px 13px;font-size:11px;font-weight:700;cursor:pointer}.lwx-filter.active{background:linear-gradient(100deg,#6713b6,#43077f);border-color:#8d2ce2;color:#fff}.lwx-spacer{flex:1}.lwx-table{overflow:hidden;border:1px solid rgba(116,135,166,.2);border-radius:13px;background:linear-gradient(145deg,rgba(9,16,28,.97),rgba(5,11,20,.98));box-shadow:inset 0 1px 0 rgba(255,255,255,.025)}.lwx-table-head,.lwx-row{display:grid;grid-template-columns:minmax(310px,1.45fr) 145px 115px minmax(220px,.9fr) 118px 62px;align-items:center;gap:14px;padding:0 17px}.lwx-table-head{height:47px;background:rgba(3,8,15,.78);color:#8792a8;font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.03em}.lwx-row{min-height:74px;border-top:1px solid rgba(255,255,255,.055)}.lwx-row:hover{background:rgba(62,26,102,.08)}.lwx-file{display:flex;align-items:center;gap:12px;min-width:0}.lwx-logo{width:42px;height:42px;object-fit:contain;border-radius:8px;padding:5px;background:rgba(8,18,32,.9);border:1px solid rgba(110,130,160,.18)}.lwx-file-copy{min-width:0}.lwx-file-copy strong{display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-size:12px}.lwx-file-copy small{display:block;margin-top:5px;color:#8491a6;font-size:10px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.lwx-status{font-size:11px;font-weight:800}.lwx-status.running,.lwx-status.resolving,.lwx-status.verifying,.lwx-status.post_processing{color:#2a9fff}.lwx-status.queued{color:#f58a19}.lwx-status.completed{color:#26c85e}.lwx-status.failed,.lwx-status.cancelled{color:#ff5360}.lwx-status.paused,.lwx-status.needs_link{color:#e2ba5c}.lwx-size strong,.lwx-speed strong{display:block;font-size:11px}.lwx-size small,.lwx-speed small{display:block;margin-top:4px;color:#7f8ba0;font-size:9px}.lwx-progress{display:grid;grid-template-columns:minmax(90px,1fr) 38px;align-items:center;gap:10px}.lwx-track{height:8px;border-radius:999px;background:#151e2c;overflow:hidden}.lwx-fill{height:100%;border-radius:inherit;background:linear-gradient(90deg,#8b1ee4,#2a91ff)}.lwx-fill.completed{background:linear-gradient(90deg,#11913b,#24ce62)}.lwx-fill.failed{background:#ff5360}.lwx-progress span{font-size:10px;color:#d9e0ed}.lwx-row-action{width:36px;height:36px;border-radius:50%;border:2px solid #8e22df;background:#080f1b;color:#fff;display:grid;place-items:center;cursor:pointer;font-size:12px;font-weight:900}.lwx-row-action.completed{border-radius:8px;border:1px solid rgba(105,125,154,.28)}.lwx-table-foot{height:46px;padding:0 17px;border-top:1px solid rgba(255,255,255,.055);display:flex;align-items:center;justify-content:space-between;color:#8792a8;font-size:10px}.lwx-empty{min-height:240px;display:grid;place-items:center;text-align:center;color:#8a96aa}.lwx-finished .lwx-table-head,.lwx-finished .lwx-row{grid-template-columns:minmax(360px,1.55fr) 130px 160px minmax(250px,1fr) 62px}.lwx-card-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:15px}.lwx-card{border:1px solid rgba(116,135,166,.2);border-radius:13px;background:linear-gradient(145deg,rgba(9,16,28,.97),rgba(5,11,20,.98));padding:18px;min-height:245px;box-shadow:inset 0 1px 0 rgba(255,255,255,.025)}.lwx-card-head{display:flex;align-items:flex-start;gap:13px}.lwx-card-icon{width:46px;height:46px;border-radius:10px;display:grid;place-items:center;background:linear-gradient(145deg,#6f12bc,#3a0a70);flex:none}.lwx-card-icon img{width:29px;height:29px;object-fit:contain}.lwx-card-title{min-width:0;flex:1}.lwx-card-title h3{margin:1px 0 4px;font-size:14px}.lwx-card-title p{margin:0;color:#8491a6;font-size:10px;line-height:1.4}.lwx-card-menu{border:0;background:transparent;color:#9eabc0;font-size:20px;cursor:pointer}.lwx-metrics{display:grid;grid-template-columns:repeat(3,1fr);gap:7px;margin-top:22px}.lwx-metric{min-height:62px;border:1px solid rgba(92,110,139,.16);border-radius:9px;background:rgba(4,10,18,.55);display:grid;place-items:center;align-content:center}.lwx-metric strong{font-size:16px}.lwx-metric small{margin-top:5px;color:#7f8ba0;font-size:9px}.lwx-card-bottom{display:flex;align-items:center;justify-content:space-between;margin-top:20px;padding-top:18px;border-top:1px solid rgba(255,255,255,.055)}.lwx-state{padding:6px 11px;border-radius:999px;background:rgba(20,94,51,.35);color:#56df8a;font-size:10px;font-weight:800}.lwx-state.paused{background:rgba(93,56,15,.38);color:#f2b55c}.lwx-card-actions{display:flex;gap:8px}.lwx-card-actions button{width:36px;height:36px;border:1px solid rgba(96,116,145,.22);border-radius:8px;background:#07101c;color:#eaf0f8;cursor:pointer}.lwx-category .lwx-card{min-height:238px}.lwx-category-stats{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:25px}.lwx-category-stat strong{display:block;font-size:25px}.lwx-category-stat small{display:block;margin-top:5px;color:#7f8ba0;font-size:9px}.lwx-folder{margin-top:19px;padding-top:17px;border-top:1px solid rgba(255,255,255,.055)}.lwx-folder small{display:block;color:#7f8ba0;font-size:9px;text-transform:uppercase;font-weight:800}.lwx-folder code{display:block;margin-top:8px;color:#b8c3d4;font-size:10px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.lwx-grabber-box{border:1px solid rgba(116,135,166,.2);border-radius:13px;background:linear-gradient(145deg,rgba(9,16,28,.97),rgba(5,11,20,.98));padding:18px}.lwx-grabber-box label{display:block;color:#8792a8;font-size:10px;font-weight:800;text-transform:uppercase}.lwx-textarea{width:100%;min-height:92px;margin-top:10px;border:1px solid rgba(89,109,140,.28);border-radius:10px;background:#040b14;color:#edf2f9;padding:13px 15px;resize:vertical;font:11px/1.55 Consolas,monospace}.lwx-grabber-meta{display:flex;align-items:center;justify-content:space-between;margin-top:11px;color:#7f8ba0;font-size:10px}.lwx-result .lwx-table-head,.lwx-result .lwx-row{grid-template-columns:minmax(380px,1.55fr) 190px 130px 110px 62px}.lwx-result-check{width:15px;height:15px;accent-color:#8d1de5}.lwx-inline{display:flex;align-items:center;gap:8px}.lwx-checkmark{width:9px;height:9px;border-radius:50%;background:#29cb62;box-shadow:0 0 8px rgba(41,203,98,.28)}
  @media(max-width:1220px){.lwx-card-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.lwx-table-head,.lwx-row{grid-template-columns:minmax(260px,1.3fr) 125px 100px minmax(170px,.8fr) 100px 52px}.lwx-finished .lwx-table-head,.lwx-finished .lwx-row{grid-template-columns:minmax(300px,1.4fr) 110px 140px minmax(210px,1fr) 52px}}
  `;

  function injectCss() {
    if (document.getElementById("lwx-style")) return;
    const style = document.createElement("style");
    style.id = "lwx-style";
    style.textContent = CSS;
    document.head.appendChild(style);
  }

  const h = value => typeof esc === "function" ? esc(value) : String(value ?? "").replace(/[&<>\"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const n = value => Number(value || 0);
  const rate = value => typeof fmtRate === "function" ? fmtRate(n(value)) : `${(n(value) / 1048576).toFixed(1)} MB/s`;
  const bytes = value => typeof fmtBytes === "function" ? fmtBytes(n(value)) : `${(n(value) / 1048576).toFixed(1)} MB`;
  const pct = task => Math.max(0, Math.min(100, typeof progress === "function" ? Number(progress(task)) : (n(task.downloaded_bytes) / Math.max(1, n(task.total_bytes)) * 100)));
  const label = status => typeof statusLabel === "function" ? statusLabel(status) : String(status || "").replaceAll("_", " ");
  const date = value => typeof fmtDate === "function" && value ? fmtDate(value) : (value ? String(value) : "—");
  const tasks = () => Array.isArray(state?.tasks) ? state.tasks : [];
  const queues = () => Array.isArray(state?.queues) ? state.queues : [];
  const categories = () => Array.isArray(state?.categories) ? state.categories : [];
  const isActive = status => ["running","resolving","verifying","post_processing","pausing"].includes(status);
  const isUnfinished = status => ["staged","queued","resolving","running","pausing","paused","needs_link","verifying","post_processing","failed","cancelling"].includes(status);

  function assetFor(value, category = "") {
    const text = `${value || ""} ${category || ""}`.toLowerCase();
    if (text.includes("ventoy") || /\.(zip|rar|7z|tar|gz|xz)(\s|$)/.test(text)) return LOCAL.Archive;
    if (text.includes("ubuntu")) return LOCAL.Ubuntu;
    if (text.includes("macos") || text.includes("dmg") || text.includes("iphone") || text.includes("ipad") || text.includes("apple") || text.includes("ipsw")) return LOCAL.Apple;
    if (text.includes("android") || text.includes("apk")) return LOCAL.Android;
    if (text.includes("windows") || text.includes("win10") || text.includes("win11") || text.includes(".exe") || text.includes(".msi")) return LOCAL.Windows;
    if (text.includes("linux") || text.includes("debian") || text.includes("fedora") || text.includes("mint")) return LOCAL.Linux;
    return LOCAL.Lumi;
  }

  function statusCounts(list) {
    return {
      all: list.length,
      running: list.filter(item => isActive(item.status)).length,
      queued: list.filter(item => item.status === "queued").length,
      paused: list.filter(item => item.status === "paused").length,
      failed: list.filter(item => item.status === "failed").length,
      completed: list.filter(item => item.status === "completed").length,
    };
  }

  function header(title, subtitle, action = "") {
    return `<div class="lwx-head"><div><h2>${h(title)}</h2><p>${h(subtitle)}</p></div><div class="lwx-head-actions">${action}</div></div>`;
  }

  function filterButton(key, text) {
    return `<button class="lwx-filter ${state.statusFilter === key ? "active" : ""}" data-action="status-filter" data-status="${h(key)}">${h(text)}</button>`;
  }

  function rowAction(task) {
    let action = "inspect", symbol = "⋯", cls = "";
    if (["running","resolving","queued","post_processing"].includes(task.status)) { action = "pause"; symbol = "Ⅱ"; }
    else if (["paused","failed","cancelled"].includes(task.status)) { action = task.status === "paused" ? "resume" : "retry"; symbol = "▶"; }
    else if (task.status === "completed") { action = "open"; symbol = "▣"; cls = " completed"; }
    return `<button class="lwx-row-action${cls}" type="button" data-lwx-task-action="${action}" data-task="${h(task.id)}" aria-label="${h(action)}">${symbol}</button>`;
  }

  function downloadRow(task, finished = false) {
    const progressValue = pct(task);
    const filename = task.filename || task.url || task.id || "Download";
    const meta = [task.category_id || task.type || "download", task.queue_id || "default"].filter(Boolean).join(" · ");
    if (finished) {
      return `<article class="lwx-row download-row" data-task="${h(task.id)}"><div class="lwx-file"><img class="lwx-logo" src="${assetFor(filename, task.category_id)}" alt=""><div class="lwx-file-copy"><strong title="${h(filename)}">${h(filename)}</strong><small>${h(meta)} · Verified and ready</small></div></div><div class="lwx-size"><strong>${bytes(task.total_bytes || task.downloaded_bytes)}</strong><small>Completed file</small></div><div class="lwx-size"><strong>${h(date(task.finished_at || task.updated_at))}</strong><small>Completed</small></div><div class="lwx-size"><strong title="${h(task.path || task.final_path || task.target_dir || "")}">${h(task.path || task.final_path || task.target_dir || "Download folder")}</strong><small>Location</small></div>${rowAction(task)}</article>`;
    }
    const eta = n(task.speed_bytes_per_sec) > 0 && n(task.total_bytes) > n(task.downloaded_bytes) && typeof fmtDuration === "function" ? fmtDuration((n(task.total_bytes) - n(task.downloaded_bytes)) / n(task.speed_bytes_per_sec)) : "";
    return `<article class="lwx-row download-row" data-task="${h(task.id)}"><div class="lwx-file"><img class="lwx-logo" src="${assetFor(filename, task.category_id)}" alt=""><div class="lwx-file-copy"><strong title="${h(filename)}">${h(filename)}</strong><small>${h(meta)} · ${bytes(task.downloaded_bytes)} of ${bytes(task.total_bytes)}</small></div></div><div class="lwx-status ${h(task.status)}">${h(label(task.status))}</div><div class="lwx-size"><strong>${bytes(task.total_bytes)}</strong><small>${bytes(task.downloaded_bytes)} received</small></div><div class="lwx-progress"><div class="lwx-track"><div class="lwx-fill ${h(task.status)}" style="width:${progressValue}%"></div></div><span>${Math.round(progressValue)}%</span></div><div class="lwx-speed"><strong>${n(task.speed_bytes_per_sec) ? rate(task.speed_bytes_per_sec) : "—"}</strong><small>${h(eta || task.mode || "")}</small></div>${rowAction(task)}</article>`;
  }

  function renderLockedDownloads(kind) {
    injectCss();
    const id = kind === "all" ? "downloads" : kind;
    const element = document.getElementById(`view-${id}`);
    if (!element) return;
    let list = typeof searched === "function" ? searched(tasks()) : tasks();
    if (kind === "unfinished") list = list.filter(task => isUnfinished(task.status));
    if (kind === "finished") list = list.filter(task => task.status === "completed");
    if (state.statusFilter !== "all") {
      if (state.statusFilter === "running") list = list.filter(task => isActive(task.status));
      else list = list.filter(task => task.status === state.statusFilter);
    }
    const base = kind === "all" ? (typeof searched === "function" ? searched(tasks()) : tasks()) : kind === "unfinished" ? tasks().filter(task => isUnfinished(task.status)) : tasks().filter(task => task.status === "completed");
    const counts = statusCounts(base);
    const title = kind === "all" ? "All Downloads" : kind === "unfinished" ? "Unfinished" : "Finished";
    const subtitle = kind === "all" ? "Every download in one organised view" : kind === "unfinished" ? "Active, paused and queued downloads" : "Successfully completed downloads";
    const action = kind === "finished" ? `<button class="lwx-secondary" data-lwx-open-folder>Open Downloads Folder</button><button class="lwx-danger" data-action="clear-done">Clear Completed</button>` : `<button class="lwx-primary" type="button" data-lwx-open-new>＋ New Download</button>`;
    const filters = kind === "finished"
      ? `${filterButton("all", `All ${counts.all}`)}${filterButton("completed", `Completed ${counts.completed}`)}`
      : `${filterButton("all", kind === "unfinished" ? `All Unfinished ${counts.all}` : `All ${counts.all}`)}${filterButton("running", `Downloading ${counts.running}`)}${filterButton("queued", `Queued ${counts.queued}`)}${filterButton("paused", `Paused ${counts.paused}`)}${kind === "all" ? filterButton("completed", `Completed ${counts.completed}`) + filterButton("failed", `Failed ${counts.failed}`) : filterButton("failed", `Failed ${counts.failed}`)}`;
    const finished = kind === "finished";
    element.innerHTML = `<div class="lwx-page ${finished ? "lwx-finished" : ""}">${header(title, subtitle, action)}<div class="lwx-filters">${filters}<span class="lwx-spacer"></span><button class="lwx-icon-btn" data-action="refresh" title="Refresh">↻</button></div><section class="lwx-table"><div class="lwx-table-head">${finished ? "<span>Name</span><span>Size</span><span>Completed</span><span>Location</span><span>Action</span>" : "<span>Name</span><span>Status</span><span>Size</span><span>Progress</span><span>Speed</span><span>Action</span>"}</div>${list.length ? list.map(task => downloadRow(task, finished)).join("") : `<div class="lwx-empty"><div><strong>No matching downloads</strong><p>Change the filter or add a new download.</p></div></div>`}<div class="lwx-table-foot"><span>${list.length} item${list.length === 1 ? "" : "s"}</span><span>${kind === "finished" ? `${bytes(list.reduce((sum,item) => sum + n(item.total_bytes || item.downloaded_bytes),0))} stored` : `${counts.running} downloading · ${counts.queued} queued · ${counts.completed} completed`}</span></div></section></div>`;
  }

  function renderLockedQueues() {
    injectCss();
    const element = document.getElementById("view-queues");
    if (!element) return;
    const countMap = {};
    tasks().forEach(task => {
      const key = task.queue_id || "default";
      countMap[key] ||= { total: 0, running: 0, waiting: 0 };
      countMap[key].total += 1;
      if (isActive(task.status)) countMap[key].running += 1;
      if (["queued","paused","needs_link"].includes(task.status)) countMap[key].waiting += 1;
    });
    element.innerHTML = `<div class="lwx-page">${header("Queues", "Control download order, schedules and limits", `<button class="lwx-primary" data-action="open-queue-modal">＋ New Queue</button>`)}<div class="lwx-card-grid">${queues().length ? queues().map(queue => {
      const c = countMap[queue.id] || { total: 0, running: 0, waiting: 0 };
      const active = queue.active !== false;
      return `<article class="lwx-card"><div class="lwx-card-head"><div class="lwx-card-icon"><img src="${LOCAL.Lumi}" alt=""></div><div class="lwx-card-title"><h3>${h(queue.name || queue.id)}</h3><p>${h(queue.description || queue.id || "Download queue")}</p></div><button class="lwx-card-menu" type="button" aria-label="Queue menu">⋮</button></div><div class="lwx-metrics"><div class="lwx-metric"><strong>${c.running}</strong><small>Running</small></div><div class="lwx-metric"><strong>${c.waiting}</strong><small>Waiting</small></div><div class="lwx-metric"><strong>${queue.speed_limit_bps ? rate(queue.speed_limit_bps) : "Unlimited"}</strong><small>Speed limit</small></div></div><div class="lwx-card-bottom"><span class="lwx-state ${active ? "" : "paused"}">${active ? "Active" : "Paused"}</span><div class="lwx-card-actions"><button data-action="toggle-queue" data-id="${h(queue.id)}" data-active="${active}">${active ? "Ⅱ" : "▶"}</button>${queue.id !== "default" ? `<button data-action="delete-queue" data-id="${h(queue.id)}">×</button>` : ""}</div></div></article>`;
    }).join("") : `<div class="lwx-empty"><div><strong>No queues yet</strong><p>Create a queue to control order and limits.</p></div></div>`}</div></div>`;
  }

  function categoryAsset(category) {
    const name = `${category.name || ""} ${category.id || ""}`.toLowerCase();
    if (name.includes("compressed") || name.includes("archive")) return LOCAL.Archive;
    if (name.includes("operating") || name.includes("iso")) return LOCAL.Windows;
    if (name.includes("image")) return LOCAL.Lumi;
    return LOCAL.Lumi;
  }

  function renderLockedCategories() {
    injectCss();
    const element = document.getElementById("view-categories");
    if (!element) return;
    const stats = {};
    tasks().forEach(task => {
      const key = task.category_id || "other";
      stats[key] ||= { count: 0, bytes: 0 };
      stats[key].count += 1;
      stats[key].bytes += n(task.total_bytes || task.downloaded_bytes);
    });
    element.innerHTML = `<div class="lwx-page lwx-category">${header("Categories", "Organise downloads automatically by type", `<button class="lwx-primary" data-action="open-category-modal">＋ New Category</button>`)}<div class="lwx-card-grid">${categories().length ? categories().map(category => {
      const s = stats[category.id] || { count: 0, bytes: 0 };
      return `<article class="lwx-card"><div class="lwx-card-head"><div class="lwx-card-icon"><img src="${categoryAsset(category)}" alt=""></div><div class="lwx-card-title"><h3>${h(category.name || category.id)}</h3><p>${h((category.extensions || []).length ? `${category.extensions.length} file rules` : "Automatic download category")}</p></div><button class="lwx-card-menu" ${category.id !== "other" ? `data-action="delete-category" data-id="${h(category.id)}"` : ""}>⋮</button></div><div class="lwx-category-stats"><div class="lwx-category-stat"><strong>${s.count}</strong><small>Downloads</small></div><div class="lwx-category-stat"><strong>${bytes(s.bytes)}</strong><small>Storage used</small></div></div><div class="lwx-folder"><small>Folder rule</small><code>${h(category.folder || category.name || "Other")}</code></div></article>`;
    }).join("") : `<div class="lwx-empty"><div><strong>No categories yet</strong><p>Create a category to organise completed files.</p></div></div>`}</div></div>`;
  }

  function grabResultRow(item, index) {
    const filename = item.filename || item.title || (typeof fileNameFromUrl === "function" ? fileNameFromUrl(item.url) : item.url) || `Link ${index + 1}`;
    return `<article class="lwx-row"><div class="lwx-file"><input class="lwx-result-check" type="checkbox" data-grab-index="${index}" checked><img class="lwx-logo" src="${assetFor(filename, item.type || item.ext)}" alt=""><div class="lwx-file-copy"><strong>${h(filename)}</strong><small title="${h(item.url)}">${h(item.url)}</small></div></div><div class="lwx-size"><strong>${h(item.host || (() => { try { return new URL(item.url).hostname; } catch { return "Source"; } })())}</strong><small>Source</small></div><div class="lwx-inline"><span class="lwx-checkmark"></span><strong style="color:#2bcb63;font-size:11px">Ready</strong></div><div class="lwx-size"><strong>${item.size ? bytes(item.size) : "—"}</strong><small>${h(item.type || item.ext || "file")}</small></div><button class="lwx-row-action completed" data-lwx-queue-one="${index}" aria-label="Queue">↓</button></article>`;
  }

  function renderLockedGrabber() {
    injectCss();
    const element = document.getElementById("view-grabber");
    if (!element) return;
    element.innerHTML = `<div class="lwx-page">${header("LinkGrabber", "Collect links, inspect them and start downloads", `<button class="lwx-primary" data-lwx-open-new>＋ Add Links</button>`)}<section class="lwx-grabber-box"><form data-form="grabber"><label>Paste page URL<textarea class="lwx-textarea" name="url" required placeholder="https://example.com/downloads"></textarea></label><input type="hidden" name="mode" value="single"><input type="hidden" name="max_pages" value="10"><input type="hidden" name="include_videos" value="on"><input type="hidden" name="include_files" value="on"><div class="lwx-grabber-meta"><span>Supports HTTP, HTTPS and FTP pages</span><button class="lwx-primary" type="submit">Analyse Links</button></div></form></section><section class="lwx-table lwx-result"><div class="lwx-table-head"><span>Detected file</span><span>Source</span><span>Status</span><span>Size</span><span>Action</span></div>${state.grabResults.length ? state.grabResults.map(grabResultRow).join("") : `<div class="lwx-empty"><div><strong>No links analysed yet</strong><p>Paste a page URL above to inspect its downloadable resources.</p></div></div>`}<div class="lwx-table-foot"><span>${state.grabResults.length} link${state.grabResults.length === 1 ? "" : "s"} detected</span>${state.grabResults.length ? `<button class="lwx-primary" data-action="queue-grabbed">Queue selected</button>` : "<span>Ready for a page URL</span>"}</div></section></div>`;
  }

  function install() {
    injectCss();
    try {
      viewMeta.downloads = ["All Downloads", "Every download in one organised view"];
      viewMeta.unfinished = ["Unfinished", "Active, paused and queued downloads"];
      viewMeta.finished = ["Finished", "Successfully completed downloads"];
      viewMeta.queues = ["Queues", "Control download order, schedules and limits"];
      viewMeta.categories = ["Categories", "Organise downloads automatically by type"];
      viewMeta.grabber = ["LinkGrabber", "Collect links, inspect them and start downloads"];
    } catch (_) {}
    window.renderDownloads = renderLockedDownloads;
    window.renderQueues = renderLockedQueues;
    window.renderCategories = renderLockedCategories;
    window.renderGrabber = renderLockedGrabber;
    try { renderDownloads = renderLockedDownloads; } catch (_) {}
    try { renderQueues = renderLockedQueues; } catch (_) {}
    try { renderCategories = renderLockedCategories; } catch (_) {}
    try { renderGrabber = renderLockedGrabber; } catch (_) {}
    document.addEventListener("click", event => {
      const newButton = event.target.closest("[data-lwx-open-new]");
      if (newButton) { event.preventDefault(); if (typeof openNewModal === "function") openNewModal(); return; }
      const folderButton = event.target.closest("[data-lwx-open-folder]");
      if (folderButton) {
        event.preventDefault();
        const path = state?.settings?.default_dir || "";
        const opener = window.electronApp?.openPath || window.electronApp?.openFolder || window.electronApp?.showItemInFolder;
        if (opener && path) void opener.call(window.electronApp, path);
        else if (typeof toast === "function") toast("Download folder", path || "Set a default download folder in Settings.", path ? "success" : "warning");
        return;
      }
      const taskButton = event.target.closest("[data-lwx-task-action]");
      if (taskButton) { event.preventDefault(); if (typeof handleTaskAction === "function") void handleTaskAction(taskButton.dataset.lwxTaskAction, taskButton.dataset.task); return; }
      const one = event.target.closest("[data-lwx-queue-one]");
      if (one) {
        event.preventDefault();
        document.querySelectorAll("[data-grab-index]").forEach(box => box.checked = Number(box.dataset.grabIndex) === Number(one.dataset.lwxQueueOne));
        if (typeof queueGrabbed === "function") void queueGrabbed();
      }
    }, true);
    if (VIEWS.has(state?.view)) renderCurrentView();
  }

  if (document.readyState === "loading") window.addEventListener("DOMContentLoaded", install, { once: true });
  else install();
})();
