"use strict";
(() => {
  const UI = window.LumiMainUI;
  if (!UI) throw new Error("Lumi primary UI is unavailable for roadmap corrections");

  function trace(event, value = {}) {
    try { window.electronApp?.traceStage0?.({ event, source: "roadmap-corrections", ...value }); } catch (_) {}
  }

  function installHitTestContract() {
    if (document.getElementById("lumi-roadmap-hit-test")) return;
    const style = document.createElement("style");
    style.id = "lumi-roadmap-hit-test";
    style.textContent = `
      .ttg-titlebar-actions,.ttg-titlebar-actions *,.ttg-titlebar-btn,
      .ttg-shell-menu,.ttg-shell-menu *,
      .ttg-shell-modal-backdrop,.ttg-shell-modal-backdrop * {
        -webkit-app-region:no-drag!important;pointer-events:auto!important;
      }
      .ttg-titlebar-actions{position:relative!important;z-index:10030!important}
      .ttg-titlebar-btn{position:relative!important;z-index:10031!important}
      .ttg-shell-menu{z-index:10035!important}.ttg-shell-modal-backdrop{z-index:10045!important}
      #view-overview:not(.active),#view-downloads:not(.active),#view-unfinished:not(.active),
      #view-finished:not(.active),#view-queues:not(.active),#view-categories:not(.active),
      #view-grabber:not(.active),#view-firmware:not(.active),#view-operating_systems:not(.active),
      #view-settings:not(.active),#view-diagnostics:not(.active){pointer-events:none}
      .lumi-card{position:relative}
      .lumi-card-contract-menu{position:absolute;z-index:40;right:14px;top:50px;min-width:150px;padding:6px;border:1px solid var(--lumi-line,rgba(116,135,166,.2));border-radius:9px;background:var(--lumi-panel,#08111d);box-shadow:0 16px 38px rgba(0,0,0,.28);display:grid;gap:3px}
      .lumi-card-contract-menu button{border:0;border-radius:7px;background:transparent;color:inherit;text-align:left;padding:8px 10px;cursor:pointer}
      .lumi-card-contract-menu button:hover{background:rgba(126,53,220,.12)}
      .lumi-card-contract-menu button.danger{color:var(--lumi-red,#ff5360)}
    `;
    document.head.appendChild(style);
  }

  function visibleControls() {
    return [...document.querySelectorAll("button,input,select,a,[role='button']")].filter(element => {
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0 && style.display !== "none" && style.visibility !== "hidden";
    });
  }

  UI.installInteractionContract = function installInteractionAudit() {
    installHitTestContract();
    if (document.documentElement.dataset.lumiRoadmapInteraction === "1") return;
    document.documentElement.dataset.lumiRoadmapInteraction = "1";
    document.addEventListener("click", event => {
      const target = event.target.closest("button,a,[role='button']");
      if (!target) return;
      trace("CLICK_RECEIVED", {
        action: target.dataset.windowAction || target.dataset.mainShellAction || target.dataset.action || target.id || target.textContent?.trim().slice(0, 60) || target.tagName,
      });
    }, true);
  };

  UI.repairInteractionContract = function auditInteractionContract() {
    const controls = visibleControls();
    const blocked = controls.filter(element => getComputedStyle(element).pointerEvents === "none");
    const result = { ok: blocked.length === 0, controls: controls.length, blocked: blocked.length };
    document.documentElement.dataset.lumiInteractionControls = String(result.controls);
    document.documentElement.dataset.lumiInteractionBlocked = String(result.blocked);
    document.documentElement.dataset.lumiInteractionContract = result.ok ? "ready" : "failed";
    window.LumiInteractionAudit = result;
    return result;
  };
  UI.maybeShowExtensionNotice = () => {};

  function lockConnectionSetting(root = document) {
    const select = root.querySelector?.('select[name="default_connections"]');
    if (!select || select.dataset.lumiCanonical32 === "1") return;
    select.dataset.lumiCanonical32 = "1";
    select.innerHTML = '<option value="32" selected>32 connections</option>';
    select.value = "32";
    const copy = select.closest(".lumi-setting-row")?.querySelector("small");
    if (copy) copy.textContent = "Lumi uses 32 HTTP/HTTPS range workers whenever the origin supports them; unsupported origins fall back truthfully.";
  }
  new MutationObserver(() => lockConnectionSetting()).observe(document.documentElement, { childList: true, subtree: true });
  lockConnectionSetting();

  function closeQueueMenus() {
    document.querySelectorAll(".lumi-card-contract-menu").forEach(menu => menu.remove());
    document.querySelectorAll('.lumi-card-menu[data-contract-ready="queue-menu"]')
      .forEach(button => button.setAttribute("aria-expanded", "false"));
  }

  function decorateQueueMenus(root = document) {
    const buttons = [];
    if (root.matches?.(".lumi-card .lumi-card-menu")) buttons.push(root);
    root.querySelectorAll?.(".lumi-card .lumi-card-menu").forEach(button => buttons.push(button));
    buttons.forEach(button => {
      if (button.dataset.action || button.dataset.contractReady === "queue-menu") return;
      const card = button.closest(".lumi-card");
      if (!card?.querySelector('[data-action="toggle-queue"]')) return;
      button.type = "button";
      button.dataset.contractReady = "queue-menu";
      button.setAttribute("aria-haspopup", "menu");
      button.setAttribute("aria-expanded", "false");
      button.setAttribute("aria-label", "Queue actions");
    });
  }

  function toggleQueueMenu(button) {
    const card = button.closest(".lumi-card");
    if (!card) return;
    const existing = card.querySelector(".lumi-card-contract-menu");
    const opening = !existing;
    closeQueueMenus();
    if (!opening) return;

    const toggle = card.querySelector('[data-action="toggle-queue"]');
    if (!toggle) return;
    const remove = card.querySelector('[data-action="delete-queue"]');
    const menu = document.createElement("div");
    menu.className = "lumi-card-contract-menu";
    menu.setAttribute("role", "menu");

    const addAction = (source, label, danger = false) => {
      if (!source) return;
      const action = document.createElement("button");
      action.type = "button";
      action.setAttribute("role", "menuitem");
      action.dataset.contractForward = source.dataset.action;
      action.dataset.action = source.dataset.action;
      action.dataset.id = source.dataset.id || "";
      if (source.dataset.active !== undefined) action.dataset.active = source.dataset.active;
      action.textContent = label;
      if (danger) action.classList.add("danger");
      menu.appendChild(action);
    };

    addAction(toggle, toggle.dataset.active === "true" ? "Pause queue" : "Resume queue");
    addAction(remove, "Delete queue", true);
    card.appendChild(menu);
    button.setAttribute("aria-expanded", "true");
  }

  const queueHost = document.getElementById("view-queues");
  if (queueHost) {
    new MutationObserver(records => {
      for (const record of records) {
        record.addedNodes.forEach(node => {
          if (node instanceof Element) decorateQueueMenus(node);
        });
      }
    }).observe(queueHost, { childList: true, subtree: true });
    decorateQueueMenus(queueHost);
  }
  document.addEventListener("click", event => {
    const queueMenu = event.target.closest('.lumi-card-menu[data-contract-ready="queue-menu"]');
    if (queueMenu) {
      event.preventDefault();
      toggleQueueMenu(queueMenu);
      return;
    }
    if (event.target.closest(".lumi-card-contract-menu [data-action]")) {
      closeQueueMenus();
      return;
    }
    if (!event.target.closest(".lumi-card-contract-menu")) closeQueueMenus();
  });
  document.addEventListener("keydown", event => { if (event.key === "Escape") closeQueueMenus(); });

  function providerSupports(provider, brand, exactProviders) {
    if (!provider) return false;
    if (exactProviders.has(provider.id)) return true;
    const brands = Array.isArray(provider.brands) ? provider.brands : [];
    if (brands.includes(brand)) return true;
    if (brand && !["Apple", "Google Pixel"].includes(brand) && brands.includes("Android")) return true;
    return ["Community mirrors", "Community knowledge"].includes(provider.group) && brand !== "Apple";
  }
  function deviceLabel(item) {
    return [...new Set([item.name, item.model, item.id, item.codename].filter(Boolean))].join(" · ");
  }

  function firmwareHtml() {
    const catalogue = v5State.catalogue || { brands: [], providers: [] };
    return `<div class="firmware-shell" data-lumi-firmware-v7="1">
      <section class="firmware-hero"><h2>Technician Firmware Finder</h2><p>Choose the device in dependency order. Lumi never guesses a firmware match and every result keeps provider/source provenance visible.</p><div class="firmware-warning"><span>⚠</span><span>${v5Esc(catalogue.warning || "Verify the exact model, region, bootloader and rollback requirements before flashing.")}</span></div></section>
      <form class="firmware-filters" id="firmware-search-form-v7">
        <label>Brand<select class="select" name="brand" id="lumi-firmware-brand" required><option value="">Select brand</option>${(catalogue.brands || []).map(value => `<option value="${v5Esc(value)}">${v5Esc(value)}</option>`).join("")}</select></label>
        <label>Model<input class="input" name="device" id="lumi-firmware-model" list="lumi-firmware-model-list" placeholder="Select brand first" autocomplete="off" disabled required><datalist id="lumi-firmware-model-list"></datalist></label>
        <label>Source<select class="select" name="provider" id="lumi-firmware-source" disabled><option value="all">Select model first</option></select></label>
        <label>Channel<select class="select" name="channel"><option value="all">Stable + beta</option><option value="stable">Stable</option><option value="beta">Beta / preview</option><option value="nightly">Nightly</option><option value="official">Official</option><option value="community">Community</option></select></label>
        <label class="firmware-query">Search within results<input class="input" name="query" type="search" placeholder="version, build, region or file type"></label>
        <label class="firmware-check"><input type="checkbox" name="include_community" checked>Include community sources</label>
        <div class="firmware-filter-actions"><button class="btn primary" type="submit">⌕ Find firmware</button><button class="btn" type="button" data-lumi-firmware-clear>Clear</button></div>
      </form><div id="firmware-results">${firmwareResultsHtml()}</div></div>`;
  }

  function correctedRenderFirmware() {
    const element = document.getElementById("view-firmware");
    if (!element) return;
    element.innerHTML = firmwareHtml();
    v5State.devices = [];
  }
  async function correctedOpenFirmwareView() {
    if (typeof switchView === "function") switchView("firmware");
    await ensureFirmwareCatalogue();
    correctedRenderFirmware();
  }
  window.openFirmwareView = correctedOpenFirmwareView;
  window.renderFirmware = correctedRenderFirmware;
  try { openFirmwareView = correctedOpenFirmwareView; } catch (_) {}
  try { renderFirmware = correctedRenderFirmware; } catch (_) {}

  async function loadModels(brand) {
    const input = document.getElementById("lumi-firmware-model");
    const list = document.getElementById("lumi-firmware-model-list");
    const source = document.getElementById("lumi-firmware-source");
    if (!input || !list || !source) return;
    input.value = "";
    input.disabled = !brand;
    input.placeholder = brand ? "Search model, model number or codename" : "Select brand first";
    source.disabled = true;
    source.innerHTML = '<option value="all">Select model first</option>';
    v5State.devices = [];
    if (!brand) { list.innerHTML = ""; return; }
    try {
      const params = new URLSearchParams({ brand, query: "" });
      const response = await v5Api("GET", `/api/v5/firmware/devices?${params}`);
      v5State.devices = response.devices || [];
      list.innerHTML = v5State.devices.map(item => `<option value="${v5Esc(item.id)}">${v5Esc(deviceLabel(item))}</option>`).join("");
    } catch (error) {
      list.innerHTML = "";
      v5Toast("Model catalogue unavailable", error.message, "error");
    }
  }

  function updateSources() {
    const brand = document.getElementById("lumi-firmware-brand")?.value || "";
    const model = document.getElementById("lumi-firmware-model")?.value.trim() || "";
    const source = document.getElementById("lumi-firmware-source");
    if (!source) return;
    if (!brand || !model) {
      source.disabled = true;
      source.innerHTML = '<option value="all">Select model first</option>';
      return;
    }
    const needle = model.toLowerCase();
    const matched = v5State.devices.filter(item => [item.id, item.name, item.model, item.codename].some(value => {
      const text = String(value || "").toLowerCase();
      return text === needle || text.includes(needle);
    }));
    const exactProviders = new Set(matched.map(item => item.provider).filter(Boolean));
    const providers = (v5State.catalogue?.providers || []).filter(provider => providerSupports(provider, brand, exactProviders));
    source.innerHTML = `<option value="all">All available sources</option>${groupProviders(providers)}`;
    source.disabled = false;
  }

  async function submitFirmware(event) {
    const form = event.target;
    if (form.id !== "firmware-search-form-v7") return;
    event.preventDefault();
    const data = Object.fromEntries(new FormData(form).entries());
    const brand = String(data.brand || "").trim();
    const device = String(data.device || "").trim();
    if (!brand || !device) return v5Toast("Choose a device", "Select Brand, then Model, before choosing a source.", "error");
    v5State.loading = true;
    document.getElementById("firmware-results").innerHTML = firmwareResultsHtml();
    try {
      const params = new URLSearchParams({
        provider: data.provider || "all", brand, device,
        query: data.query || "", channel: data.channel || "all",
        include_community: form.elements.include_community.checked ? "true" : "false",
      });
      const response = await v5Api("GET", `/api/v5/firmware/search?${params}`);
      v5State.results = response.results || [];
    } catch (error) {
      v5State.results = [];
      v5Toast("Firmware search failed", error.message, "error");
    } finally {
      v5State.loading = false;
      document.getElementById("firmware-results").innerHTML = firmwareResultsHtml();
    }
  }

  document.addEventListener("change", event => {
    if (event.target.id === "lumi-firmware-brand") void loadModels(event.target.value);
    if (event.target.id === "lumi-firmware-model") updateSources();
  });
  document.addEventListener("input", event => { if (event.target.id === "lumi-firmware-model") updateSources(); });
  document.addEventListener("submit", event => void submitFirmware(event), true);
  document.addEventListener("click", event => {
    if (!event.target.closest("[data-lumi-firmware-clear]")) return;
    event.preventDefault();
    v5State.results = [];
    correctedRenderFirmware();
  });

  installHitTestContract();
})();