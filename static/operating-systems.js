"use strict";

/* Lumi computer operating-system workspace. */
(() => {
  const osState = {
    catalogue: null,
    results: [],
    loading: false,
    family: sessionStorage.getItem("LUMI.osFamily") || "Windows",
  };

  try {
    viewMeta.operating_systems = [
      "Operating systems",
      "Official Windows, macOS and Linux installation files",
    ];
  } catch (_) {}

  async function openOperatingSystemsView() {
    osState.family = sessionStorage.getItem("LUMI.osFamily") || "Windows";
    await renderOsView();
  }

  async function loadCatalogue() {
    if (!osState.catalogue) osState.catalogue = await osApi("GET", "/api/v5/os/catalogue");
    return osState.catalogue;
  }

  async function renderOsView() {
    const view = document.getElementById("view-operating_systems");
    if (!view) return;
    view.dataset.osWorkspaceOwner = "delegated";
    let catalogue;
    try { catalogue = await loadCatalogue(); }
    catch (error) { catalogue = { families: ["Windows", "macOS", "Linux"], options: {}, warning: error.message }; }
    view.innerHTML = `<div class="approved-page approved-os-page os-catalogue-shell">
      <div class="approved-page-head"><div><h2>Operating Systems</h2><p>Official Windows, macOS and Linux installation files</p></div></div>
      <div class="approved-platform-tabs os-platform-tabs">${["Windows","macOS","Linux"].map(family => `<button type="button" class="${osState.family===family?"active":""}" data-os-family="${family}"><img src="${family==="Windows"?"/static/brand/windows.svg":family==="macOS"?"/static/brand/apple.svg":"/static/brand/linux.svg"}" alt=""><span>${family}</span></button>`).join("")}</div>
      <div id="os-filter-host">${osFilterHtml(catalogue, osState.family)}</div>
      <div id="os-results" class="approved-tech-results">${osResultsHtml()}</div>
    </div>`;
  }
  function osFilterHtml(catalogue, family) {
    const options = catalogue.options?.[family] || {};
    const distributions = family === "Linux" ? options.distributions || [] : [];
    return `<form class="approved-tech-filters approved-os-filters" id="os-catalogue-form">
      <input type="hidden" name="family" value="${osEsc(family)}">
      ${family === "Linux" ? `<label>Distribution<select class="select" name="distribution"><option value="">All</option>${distributions.map(value => `<option value="${osEsc(value)}">${osEsc(value)}</option>`).join("")}</select></label>` : ""}
      <label>Version<select class="select" name="version"><option value="">All Versions</option>${(options.versions || []).map(value => `<option value="${osEsc(value)}">${osEsc(value)}</option>`).join("")}</select></label>
      <label>Edition<select class="select" name="edition"><option value="">All Editions</option>${(options.editions || []).map(value => `<option value="${osEsc(value)}">${osEsc(value)}</option>`).join("")}</select></label>
      <label>Architecture<select class="select" name="architecture"><option value="">All</option>${(options.architectures || []).map(value => `<option value="${osEsc(value)}">${osEsc(value)}</option>`).join("")}</select></label>
      <label>Channel<select class="select" name="channel"><option value="">All Channels</option>${(options.channels || []).filter(value=>value!=="all").map(value => `<option value="${osEsc(value)}">${osEsc(titleCase(value))}</option>`).join("")}</select></label>
      ${family === "Windows" ? `<label>Language<select class="select" name="language"><option value="">English</option>${(options.languages || []).map(value => `<option value="${osEsc(value)}">${osEsc(value)}</option>`).join("")}</select></label>` : ""}
      <label class="approved-tech-search">Search<input class="input" name="query" type="search" placeholder="version, build, edition or file name"></label>
      <button class="approved-btn primary" type="submit">⌕ Search</button><button class="approved-btn" type="button" data-os-action="clear">Clear filters</button>
    </form>`;
  }
  async function handleClick(event) {
    if (!event.target.closest("#view-operating_systems")) return;
    const familyButton = event.target.closest("[data-os-family]");
    if (familyButton) {
      event.preventDefault();
      event.stopPropagation();
      osState.family = familyButton.dataset.osFamily;
      sessionStorage.setItem("LUMI.osFamily", osState.family);
      osState.results = [];
      await renderOsView();
      return;
    }
    const actionButton = event.target.closest("[data-os-action]");
    if (!actionButton) return;
    event.preventDefault();
    event.stopPropagation();
    const action = actionButton.dataset.osAction;
    if (action === "clear") {
      osState.results = [];
      await renderOsView();
      return;
    }
    const item = osState.results[Number(actionButton.dataset.index)];
    if (!item) return;
    if (action === "download" && item?.direct && item?.url) return void stageOperatingSystem(item, actionButton);
  }

  async function handleSubmit(event) {
    if (event.target.id !== "os-catalogue-form") return;
    event.preventDefault();
    event.stopPropagation();
    const data = Object.fromEntries(new FormData(event.target).entries());
    osState.loading = true;
    updateResults();
    try {
      const response = await osApi("GET", `/api/v5/os/search?${new URLSearchParams(data)}`);
      osState.results = (response.results || []).filter(item => item?.direct && item?.url);
    } catch (error) {
      osState.results = [];
      osToast("Operating-system search failed", error.message, "error");
    } finally {
      osState.loading = false;
      updateResults();
    }
  }

  function updateResults() {
    const host = document.getElementById("os-results");
    if (host) host.innerHTML = osResultsHtml();
  }

  function osResultsHtml() {
    if (osState.loading) return `<section class="approved-dense-table approved-os-table"><div class="approved-empty"><strong>Checking official operating-system sources…</strong></div></section>`;
    return `<section class="approved-dense-table approved-os-table"><div class="approved-table-head"><span>Version</span><span>Edition</span><span>Architecture</span><span>Channel</span><span>Size</span><span>Build / Release</span><span>Actions</span></div><div class="approved-table-body">${osState.results.length ? osState.results.map(osCard).join("") : `<div class="approved-empty"><strong>No operating-system results yet</strong><span>Choose Windows, macOS or Linux, then search official sources.</span></div>`}</div><div class="approved-table-foot"><span>${osState.results.length} result${osState.results.length === 1 ? "" : "s"}</span><span>Verify edition, architecture and checksum before installation.</span></div></section>`;
  }

  function osCard(item) {
    if (!(item?.direct && item?.url)) return "";
    const index = osState.results.indexOf(item);
    const version = item.version || item.title || "—";
    const edition = item.file_type || item.metadata?.edition || item.metadata?.distribution || "Recommended";
    const arch = item.metadata?.architecture || item.device || "—";
    const channel = item.channel || "Stable";
    const release = item.build || item.release_date || item.metadata?.build || "—";
    const action = `<button class="approved-btn primary" type="button" data-os-action="download" data-index="${index}">Download</button>`;
    return `<div class="approved-table-row approved-os-row"><div class="approved-file-cell"><img src="${osState.family === "Windows" ? "/static/brand/windows.svg" : osState.family === "macOS" ? "/static/brand/apple.svg" : "/static/brand/linux.svg"}" alt=""><span><strong>${osEsc(version)}</strong><small>${osEsc(item.source_name || osState.family)}</small></span></div><span>${osEsc(edition)}</span><span>${osEsc(arch)}</span><span>${osEsc(titleCase(channel))}</span><span>${item.size ? osFmtBytes(item.size) : "—"}</span><span>${osEsc(release)}</span><span class="approved-actions">${action}</span></div>`;
  }

  async function stageOperatingSystem(item, button) {
    const family = item.metadata?.os_family || item.brand || osState.family;
    const details = [family, item.version, item.file_type, item.metadata?.architecture || item.device].filter(Boolean).join(" · ");
    if (!window.confirm(`Download this operating-system image with Lumi?\n\n${item.title}\n${details}\nSource: ${item.source_name}\n\nVerify the checksum and target architecture before installation.`)) return;
    const defaultDir = (typeof state !== "undefined" && state.settings?.default_dir) || "";
    const targetDir = window.prompt("Save operating-system image to:", defaultDir || "") ?? null;
    if (targetDir === null) return;
    button.disabled = true;
    try {
      const task = await osApi("POST", "/api/v5/os/stage", {
        url: item.url,
        filename: item.filename || "",
        target_dir: targetDir,
        family,
        distribution: item.metadata?.distribution || "",
        version: item.version,
        edition: item.file_type,
        architecture: item.metadata?.architecture || item.device,
        channel: item.channel,
        provider: item.provider,
        source_name: item.source_name,
        source_url: item.source_url,
        sha256: item.sha256,
      });
      await osApi("POST", `/api/downloads/${encodeURIComponent(task.id)}/confirm`, {
        filename: task.filename,
        target_dir: targetDir,
        connections: 0,
      });
      if (typeof refreshFoundation === "function") await refreshFoundation();
      osToast("Operating system queued", item.filename || item.title, "success");
      if (typeof switchView === "function") switchView("downloads");
    } catch (error) {
      osToast("Operating system not queued", error.message, "error");
    } finally {
      button.disabled = false;
    }
  }

  async function osApi(method, path, body = null) {
    if (typeof v5Api === "function") return v5Api(method, path, body);
    const response = await fetch(path, {
      method,
      headers: body ? { "Content-Type": "application/json" } : {},
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || `${method} ${path} failed`);
    return data;
  }

  function osToast(title, message, type) {
    if (typeof v5Toast === "function") v5Toast(title, message, type);
    else window.alert(`${title}\n${message}`);
  }

  function safeHost(url) { try { return new URL(url).hostname; } catch { return ""; } }
  function titleCase(value) { return String(value || "").replace(/_/g, " ").replace(/\b\w/g, character => character.toUpperCase()); }
  function osFmtBytes(value) { const size = Number(value || 0); if (size >= 1073741824) return `${(size / 1073741824).toFixed(2)} GB`; if (size >= 1048576) return `${(size / 1048576).toFixed(1)} MB`; return `${Math.round(size / 1024)} KB`; }
  function osEsc(value) { return String(value ?? "").replace(/[&<>'"]/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[character])); }

  document.addEventListener("click", handleClick, true);
  document.addEventListener("submit", handleSubmit, true);
  window.LumiOperatingSystems = Object.freeze({ open: openOperatingSystemsView });
})();
