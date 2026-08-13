"use strict";

(() => {
  let cachedCatalogue = null;
  let family = sessionStorage.getItem("LUMI.osFamily") || "Windows";

  function claimRoute() {
    try {
      if (typeof switchView === "function") switchView("operating_systems");
    } catch (_) {}
  }

  async function apiGet(path) {
    if (typeof v5Api === "function") return v5Api("GET", path);
    const response = await fetch(path);
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || `GET ${path} failed`);
    return data;
  }

  async function open() {
    const view = document.getElementById("view-operating_systems");
    if (!view) return;
    claimRoute();

    let catalogue;
    try {
      cachedCatalogue ||= await apiGet("/api/v5/os/catalogue");
      catalogue = cachedCatalogue;
    } catch (error) {
      catalogue = {
        families: ["Windows", "macOS", "Linux"],
        options: {},
        warning: error.message,
      };
    }

    view.innerHTML = `
      <div class="firmware-shell os-catalogue-shell">
        <section class="firmware-hero os-hero">
          <div class="os-hero-copy">
            <small>Technician catalogue</small>
            <h2>Computer Operating Systems</h2>
            <p>Choose Windows, macOS or Linux, then narrow the version, edition, language, architecture and channel. Official files remain first. Helpers and indexes are clearly labelled before download.</p>
          </div>
          <div class="firmware-warning"><span>⚠</span><span>${esc(catalogue.warning || "Verify the edition, architecture and checksum before installation.")}</span></div>
        </section>
        <div class="os-platform-grid">
          ${["Windows", "macOS", "Linux"].map(value => `
            <button class="os-platform-card ${family === value ? "active" : ""}" type="button" data-os-family="${value}">
              <span class="os-platform-icon">${value === "Windows" ? "⊞" : value === "macOS" ? "◉" : "◆"}</span>
              <strong>${value}</strong>
              <small>${value === "Windows" ? "Microsoft retail ISO files" : value === "macOS" ? "Installers and restore images" : "Official distribution images"}</small>
            </button>`).join("")}
        </div>
        <div id="os-filter-host">${filterHtml(catalogue, family)}</div>
        <div id="os-results"><div class="empty"><div class="empty-icon">◫</div><strong>Select Windows, macOS or Linux</strong>Choose a version, edition and architecture, then search.</div></div>
      </div>`;
  }

  function filterHtml(catalogue, value) {
    const options = catalogue.options?.[value] || {};
    const distributions = value === "Linux" ? options.distributions || [] : [];
    return `<form class="firmware-filters os-filters" id="os-catalogue-form">
      <input type="hidden" name="family" value="${esc(value)}">
      ${value === "Linux" ? `<label>Distribution<select class="select" name="distribution">${distributions.map(item => `<option value="${esc(item)}">${esc(item)}</option>`).join("")}</select></label>` : ""}
      <label>Version<select class="select" name="version"><option value="">Latest / current</option>${(options.versions || []).map(item => `<option value="${esc(item)}">${esc(item)}</option>`).join("")}</select></label>
      <label>Edition / image<select class="select" name="edition"><option value="">Recommended</option>${(options.editions || []).map(item => `<option value="${esc(item)}">${esc(item)}</option>`).join("")}</select></label>
      <label>Architecture<select class="select" name="architecture">${(options.architectures || []).map(item => `<option value="${esc(item)}">${esc(item)}</option>`).join("")}</select></label>
      <label>Channel<select class="select" name="channel">${(options.channels || ["all"]).map(item => `<option value="${esc(item)}">${esc(title(item))}</option>`).join("")}</select></label>
      ${value === "Windows" ? `<label>Language<select class="select" name="language">${(options.languages || []).map(item => `<option value="${esc(item)}">${esc(item)}</option>`).join("")}</select></label>` : ""}
      <label class="os-wide">Search within results<input class="input" name="query" type="search" placeholder="version, build, edition or file name"></label>
      <div class="firmware-filter-actions"><button class="btn primary" type="submit">⌕ Find operating systems</button><button class="btn" type="button" data-os-action="clear">Clear</button></div>
    </form>`;
  }

  function title(value) {
    return String(value || "").replace(/_/g, " ").replace(/\b\w/g, character => character.toUpperCase());
  }

  function esc(value) {
    return String(value ?? "").replace(/[&<>'"]/g, character => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;",
    })[character]);
  }

  claimRoute();
  window.LumiOperatingSystemsOpen = Object.freeze({ open });
})();
