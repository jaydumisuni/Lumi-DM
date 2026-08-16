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

  // Navigation is a shell invariant, so it must not wait for the dynamically
  // loaded presentation/correction modules. This script is parsed after the
  // sidebar markup exists; bind the Technician disclosure immediately and mark
  // it owned so main-ui-core's compatibility binder becomes a no-op.
  function installEarlyNavigationContract() {
    const group = document.querySelector(".nav-group");
    const toggle = group?.querySelector(".nav-group-toggle");
    if (!group || !toggle || group.dataset.bound === "true") return;
    group.classList.remove("open");
    toggle.setAttribute("aria-expanded", "false");
    toggle.addEventListener("click", event => {
      event.preventDefault();
      const open = !group.classList.contains("open");
      group.classList.toggle("open", open);
      toggle.setAttribute("aria-expanded", String(open));
    });
    group.querySelectorAll(".nav-submenu .nav-item").forEach(item => item.addEventListener("click", () => {
      group.classList.add("open");
      toggle.setAttribute("aria-expanded", "true");
    }));
    document.querySelectorAll(".nav-list > .nav-item").forEach(item => item.addEventListener("click", () => {
      group.classList.remove("open");
      toggle.setAttribute("aria-expanded", "false");
    }));
    group.dataset.bound = "true";
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