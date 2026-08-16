"use strict";
(() => {
  const modules = [
    "/static/stage0-trace.js",
    "/static/main-ui-core.js",
    "/static/main-ui-views.js",
    "/static/main-ui-settings.js",
    "/static/main-ui-shell.js",
    "/static/main-ui-download.js",
    "/static/main-ui-fixes.js",
    "/static/interaction-contract.js",
    "/static/roadmap-corrections.js",
    "/static/toast-contract.js",
  ];

  // Technician disclosure is a shell invariant, so it cannot depend on the
  // identity or lifetime of a renderer-created button. Own it once at document
  // level and resolve the current group from each click; renderer replacement
  // therefore cannot silently discard the handler.
  function installEarlyNavigationContract() {
    const group = document.querySelector(".nav-group");
    if (!group || document.documentElement.dataset.lumiNavigationReady === "1") return;
    group.classList.remove("open");
    group.querySelector(".nav-group-toggle")?.setAttribute("aria-expanded", "false");
    // Prevent main-ui-core's compatibility binder from becoming a second owner.
    group.dataset.bound = "true";

    document.addEventListener("click", event => {
      const technicianToggle = event.target.closest?.(".nav-group-toggle");
      if (technicianToggle) {
        event.preventDefault();
        const currentGroup = technicianToggle.closest(".nav-group");
        if (!currentGroup) return;
        const open = technicianToggle.getAttribute("aria-expanded") !== "true";
        currentGroup.classList.toggle("open", open);
        technicianToggle.setAttribute("aria-expanded", String(open));
        return;
      }

      const technicianItem = event.target.closest?.(".nav-group .nav-submenu .nav-item[data-view]");
      if (technicianItem) {
        const currentGroup = technicianItem.closest(".nav-group");
        currentGroup?.classList.add("open");
        currentGroup?.querySelector(".nav-group-toggle")?.setAttribute("aria-expanded", "true");
        // app.js owns view activation; the OS module owns its async catalogue
        // rendering. Bridge those existing owners explicitly after the click has
        // activated the view instead of adding OS rendering to generic app.js.
        if (technicianItem.dataset.view === "operating_systems") {
          void window.LumiOperatingSystems?.open?.();
        }
        return;
      }

      const topLevel = event.target.closest?.(".nav-list > .nav-item[data-view]");
      if (!topLevel) return;
      const currentGroup = document.querySelector(".nav-group");
      currentGroup?.classList.remove("open");
      currentGroup?.querySelector(".nav-group-toggle")?.setAttribute("aria-expanded", "false");
    });

    document.documentElement.dataset.lumiNavigationReady = "1";
  }

  function loadModule(source) {
    return new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = source;
      script.async = false;
      script.onload = resolve;
      script.onerror = () => reject(new Error(`Lumi UI module not loaded: ${source}`));
      document.head.appendChild(script);
    });
  }

  function install() {
    const UI = window.LumiMainUI;
    if (!UI) throw new Error("Lumi primary UI did not initialize");
    UI.bindTechnicianGroup();
    UI.installViewMetadata();
    UI.installDownloadContract();
    UI.installDesktopActions();
    window.renderOverview = UI.renderOverviewPrimary;
    window.renderDownloads = UI.renderDownloadsPrimary;
    window.renderQueues = UI.renderQueuesPrimary;
    window.renderCategories = UI.renderCategoriesPrimary;
    window.renderGrabber = UI.renderGrabberPrimary;
    window.renderSettings = UI.renderSettingsPrimary;
    try { renderOverview = UI.renderOverviewPrimary; } catch (_) {}
    try { renderDownloads = UI.renderDownloadsPrimary; } catch (_) {}
    try { renderQueues = UI.renderQueuesPrimary; } catch (_) {}
    try { renderCategories = UI.renderCategoriesPrimary; } catch (_) {}
    try { renderGrabber = UI.renderGrabberPrimary; } catch (_) {}
    try { renderSettings = UI.renderSettingsPrimary; } catch (_) {}
    UI.bindPrimaryActions();
    UI.installInteractionContract();
    UI.patchGearMenu();
    UI.patchNotificationSwitch();
    UI.installActualBrandLogos();
    UI.maybeShowExtensionNotice();
    setTimeout(() => {
      try {
        if (typeof renderCurrentView === "function") renderCurrentView();
        UI.repairInteractionContract();
      } catch (error) {
        console.error("Lumi interaction contract initialization failed", error);
      }
    }, 0);
  }

  installEarlyNavigationContract();
  modules.reduce((promise, source) => promise.then(() => loadModule(source)), Promise.resolve())
    .then(install)
    .catch(error => {
      console.error(error);
      const status = document.getElementById("boot-status");
      if (status) status.textContent = `Lumi interface failed to load: ${error.message}`;
    });
})();