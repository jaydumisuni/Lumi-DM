"use strict";

/*
 * Lumi desktop interaction contract.
 *
 * This layer is intentionally small and loaded after the legacy renderer and the
 * primary UI modules. It does not redesign the approved UI. It gives the static
 * shell one authoritative navigation path, keeps the Technician group reliable,
 * removes false button affordances, and exposes a runtime audit for every visible
 * button so dead controls cannot silently ship again.
 */
(() => {
  const UI = window.LumiMainUI = window.LumiMainUI || {};
  const CORE_VIEWS = new Set([
    "overview", "downloads", "unfinished", "finished", "queues",
    "categories", "grabber", "settings", "diagnostics",
  ]);
  const TECHNICIAN_VIEWS = new Set(["firmware", "operating_systems"]);
  const DOWNLOAD_VIEWS = new Set(["downloads", "unfinished", "finished"]);
  const CONTRACT_ATTRIBUTES = [
    "data-action", "data-main-open-new", "data-main-view",
    "data-main-task-action", "data-main-queue-one", "data-main-settings-tab",
    "data-main-browse", "data-main-health-check", "data-main-shell-action",
    "data-shell-action", "data-window-action", "data-firmware-action",
    "data-os-action", "data-os-family", "data-source", "data-tab",
    "data-close-modal", "data-close-source", "data-lumi-theme",
    "data-notification-index", "data-contract-forward",
  ];
  const STATIC_BUTTON_IDS = new Set([
    "boot-retry", "remote-pair-submit", "sidebar-open", "sidebar-close",
    "new-download-btn", "inspector-close", "ttg-bell", "ttg-gear",
    "ttg-maximize", "lumi-widget-save", "lumi-modal-close",
    "lumi-open-tools", "lumi-open-support",
  ]);

  let installed = false;
  let observer = null;
  let repairScheduled = false;

  function technicianGroup() {
    return document.querySelector(".nav-group");
  }

  function setTechnicianOpen(open) {
    const group = technicianGroup();
    const toggle = group?.querySelector(".nav-group-toggle");
    if (!group || !toggle) return;
    group.classList.toggle("open", Boolean(open));
    toggle.setAttribute("aria-expanded", String(Boolean(open)));
  }

  function currentView() {
    try { return typeof state !== "undefined" ? state.view : ""; }
    catch (_) { return ""; }
  }

  function routeView(view) {
    if (!CORE_VIEWS.has(view) && !TECHNICIAN_VIEWS.has(view)) return false;
    try {
      if (DOWNLOAD_VIEWS.has(view) && typeof state !== "undefined" && state.view !== view) {
        state.statusFilter = "all";
      }
      if (typeof switchView === "function" && currentView() !== view) switchView(view);
      else if (typeof renderCurrentView === "function" && CORE_VIEWS.has(view)) renderCurrentView();
    } catch (error) {
      reportInteractionFailure(`View ${view} did not open`, error);
      return false;
    }
    setTechnicianOpen(TECHNICIAN_VIEWS.has(view));
    return true;
  }

  function handleStaticShellClick(event) {
    const technicianToggle = event.target.closest(".nav-group-toggle");
    if (technicianToggle) {
      event.preventDefault();
      event.stopImmediatePropagation();
      const group = technicianToggle.closest(".nav-group");
      setTechnicianOpen(!group?.classList.contains("open"));
      scheduleRepair();
      return;
    }

    const nav = event.target.closest(".nav-item[data-view]");
    if (nav) {
      const view = String(nav.dataset.view || "");
      if (!CORE_VIEWS.has(view) && !TECHNICIAN_VIEWS.has(view)) return;
      event.preventDefault();

      // Firmware and OS workspaces already own their content loaders. Keep their
      // target-phase listeners alive while still making the route itself reliable.
      if (TECHNICIAN_VIEWS.has(view)) {
        routeView(view);
        setTechnicianOpen(true);
        scheduleRepair();
        return;
      }

      // Core pages are fully routed here. Suppress legacy one-time listeners so
      // one physical click means one route/render operation.
      event.stopImmediatePropagation();
      routeView(view);
      scheduleRepair();
      return;
    }

    if (event.target.closest("#new-download-btn")) {
      event.preventDefault();
      event.stopImmediatePropagation();
      if (typeof openNewModal === "function") openNewModal();
      else reportInteractionFailure("New Download is unavailable");
      scheduleRepair();
      return;
    }

    if (event.target.closest("#sidebar-open")) {
      event.preventDefault();
      event.stopImmediatePropagation();
      document.getElementById("sidebar")?.classList.add("open");
      return;
    }

    if (event.target.closest("#sidebar-close")) {
      event.preventDefault();
      event.stopImmediatePropagation();
      if (typeof closeSidebar === "function") closeSidebar();
      else document.getElementById("sidebar")?.classList.remove("open");
      return;
    }

    const queueMenu = event.target.closest('.lumi-card-menu[data-contract-ready="queue-menu"]');
    if (queueMenu) {
      event.preventDefault();
      event.stopImmediatePropagation();
      toggleQueueMenu(queueMenu);
      return;
    }

    const forward = event.target.closest("[data-contract-forward]");
    if (forward) {
      event.preventDefault();
      event.stopImmediatePropagation();
      const card = forward.closest(".lumi-card");
      const selector = `[data-action="${cssEscape(forward.dataset.contractForward)}"]`;
      const target = card?.querySelector(selector);
      closeQueueMenus();
      target?.click();
    }
  }

  function cssEscape(value) {
    if (window.CSS?.escape) return window.CSS.escape(String(value || ""));
    return String(value || "").replace(/[^a-zA-Z0-9_-]/g, "\\$&");
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
    const active = toggle.dataset.active === "true";
    const menu = document.createElement("div");
    menu.className = "lumi-card-contract-menu";
    menu.setAttribute("role", "menu");
    menu.innerHTML = `
      <button type="button" role="menuitem" data-contract-forward="toggle-queue">${active ? "Pause queue" : "Resume queue"}</button>
      ${remove ? '<button type="button" role="menuitem" class="danger" data-contract-forward="delete-queue">Delete queue</button>' : ""}`;
    card.appendChild(menu);
    button.setAttribute("aria-expanded", "true");
  }

  function closeQueueMenus() {
    document.querySelectorAll(".lumi-card-contract-menu").forEach(menu => menu.remove());
    document.querySelectorAll('.lumi-card-menu[data-contract-ready="queue-menu"]')
      .forEach(button => button.setAttribute("aria-expanded", "false"));
  }

  function repairVisibleControls() {
    repairScheduled = false;

    // The approved Overview mockup shows "This session" as context, not as an
    // actionable selector. Do not leave it looking like a dead button.
    document.querySelectorAll("#view-overview .lumi-panel-head button.btn").forEach(button => {
      const label = String(button.textContent || "").replace(/\s+/g, " ").trim().toLowerCase();
      if (!label.startsWith("this session") || button.dataset.contractNormalized === "true") return;
      const text = document.createElement("span");
      text.className = `${button.className} lumi-static-label`;
      text.textContent = "This session";
      text.setAttribute("aria-label", "Current session");
      text.dataset.contractNormalized = "true";
      button.replaceWith(text);
    });

    // Queue cards already expose safe pause/resume/delete actions. Their ellipsis
    // now opens those actions instead of being a decorative dead button.
    document.querySelectorAll(".lumi-card .lumi-card-menu:not([data-action])").forEach(button => {
      const card = button.closest(".lumi-card");
      const queueToggle = card?.querySelector('[data-action="toggle-queue"]');
      if (queueToggle) {
        button.type = "button";
        button.dataset.contractReady = "queue-menu";
        button.setAttribute("aria-haspopup", "menu");
        button.setAttribute("aria-expanded", "false");
        button.setAttribute("aria-label", "Queue actions");
        return;
      }

      // Protected/default category cards cannot be deleted. Preserve the approved
      // ellipsis visual without advertising an action that does not exist.
      const visual = document.createElement("span");
      visual.className = button.className;
      visual.textContent = button.textContent || "⋮";
      visual.setAttribute("aria-hidden", "true");
      button.replaceWith(visual);
    });

    auditInteractionContract();
  }

  function scheduleRepair() {
    if (repairScheduled) return;
    repairScheduled = true;
    queueMicrotask(repairVisibleControls);
  }

  function isActuallyVisible(element) {
    if (element.hidden || element.closest("[hidden]")) return false;
    const style = window.getComputedStyle?.(element);
    if (style && (style.display === "none" || style.visibility === "hidden")) return false;
    return true;
  }

  function hasButtonContract(button) {
    if (button.disabled) return true;
    if (button.type === "submit" || button.getAttribute("type") === "submit") return Boolean(button.closest("form"));
    if (STATIC_BUTTON_IDS.has(button.id)) return true;
    if (button.classList.contains("nav-group-toggle")) return true;
    if (button.matches(".nav-item[data-view]")) return true;
    if (button.closest("#source-tabs") && button.dataset.source) return true;
    if (button.closest("#inspector-tabs") && button.dataset.tab) return true;
    return CONTRACT_ATTRIBUTES.some(attribute => button.hasAttribute(attribute));
  }

  function auditInteractionContract() {
    const failures = [];
    const buttons = [...document.querySelectorAll("button")].filter(isActuallyVisible);
    for (const button of buttons) {
      if (hasButtonContract(button)) continue;
      failures.push({
        type: "unbound-button",
        id: button.id || "",
        classes: button.className || "",
        label: String(button.textContent || "").replace(/\s+/g, " ").trim().slice(0, 120),
      });
    }

    for (const nav of document.querySelectorAll(".nav-item[data-view]")) {
      const view = String(nav.dataset.view || "");
      if (!CORE_VIEWS.has(view) && !TECHNICIAN_VIEWS.has(view)) {
        failures.push({ type: "unknown-view", view });
        continue;
      }
      if (!document.getElementById(`view-${view}`)) failures.push({ type: "missing-view-element", view });
    }

    const result = {
      ok: failures.length === 0,
      checkedButtons: buttons.length,
      currentView: currentView(),
      failures,
      timestamp: new Date().toISOString(),
    };
    window.LumiInteractionAudit = result;
    document.documentElement.dataset.lumiInteractionContract = result.ok ? "ready" : "failed";
    if (failures.length) console.error("Lumi interaction contract failures", failures);
    return result;
  }

  function reportInteractionFailure(title, error = null) {
    const detail = error?.message || String(error || "The requested control has no available handler.");
    console.error(title, error || "");
    try {
      if (typeof toast === "function") toast(title, detail, "error");
    } catch (_) {}
  }

  function injectContractStyles() {
    if (document.getElementById("lumi-interaction-contract-style")) return;
    const style = document.createElement("style");
    style.id = "lumi-interaction-contract-style";
    style.textContent = `
      .lumi-static-label{cursor:default!important;user-select:none}
      .lumi-card{position:relative}
      .lumi-card-contract-menu{position:absolute;z-index:40;right:14px;top:50px;min-width:150px;padding:6px;border:1px solid var(--lumi-line,rgba(116,135,166,.2));border-radius:9px;background:var(--lumi-panel,#08111d);box-shadow:0 16px 38px rgba(0,0,0,.28);display:grid;gap:3px}
      .lumi-card-contract-menu button{border:0;border-radius:7px;background:transparent;color:inherit;text-align:left;padding:8px 10px;cursor:pointer}
      .lumi-card-contract-menu button:hover{background:rgba(126,53,220,.12)}
      .lumi-card-contract-menu button.danger{color:var(--lumi-red,#ff5360)}
    `;
    document.head.appendChild(style);
  }

  function installInteractionContract() {
    if (installed) return;
    installed = true;
    injectContractStyles();
    document.addEventListener("click", handleStaticShellClick, true);
    document.addEventListener("click", event => {
      if (!event.target.closest(".lumi-card")) closeQueueMenus();
    });
    document.addEventListener("keydown", event => {
      if (event.key === "Escape") closeQueueMenus();
    });
    observer = new MutationObserver(scheduleRepair);
    observer.observe(document.body, { childList: true, subtree: true });
    scheduleRepair();
  }

  Object.assign(UI, {
    installInteractionContract,
    auditInteractionContract,
    repairInteractionContract: repairVisibleControls,
  });
})();
