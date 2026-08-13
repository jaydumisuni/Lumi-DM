"use strict";
(() => {
  const modules = [
    "/static/main-ui-core.js",
    "/static/main-ui-views.js",
    "/static/main-ui-settings.js",
    "/static/main-ui-shell.js",
    "/static/main-ui-download.js",
    "/static/main-ui-fixes.js",
    "/static/operating-systems-open.js",
    "/static/interaction-contract.js",
  ];

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

  function keepTechnicianOpen(item) {
    const group = item.closest(".nav-group");
    const toggle = group?.querySelector(".nav-group-toggle");
    group?.classList.add("open");
    toggle?.setAttribute("aria-expanded", "true");
  }

  function installTechnicianNavigation() {
    document.addEventListener("click", event => {
      const firmware = event.target.closest('.nav-item[data-view="firmware"]');
      if (firmware) {
        event.preventDefault();
        event.stopImmediatePropagation();
        keepTechnicianOpen(firmware);
        if (typeof openFirmwareView === "function") void openFirmwareView();
        return;
      }

      const operatingSystems = event.target.closest('.nav-item[data-view="operating_systems"]');
      if (!operatingSystems) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      keepTechnicianOpen(operatingSystems);
      window.setTimeout(() => {
        if (window.LumiOperatingSystemsOpen?.open) {
          void window.LumiOperatingSystemsOpen.open();
        } else {
          console.error("Operating Systems opener is unavailable");
        }
      }, 0);
    }, true);
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
    installTechnicianNavigation();
    UI.installInteractionContract();
    UI.patchGearMenu();
    UI.patchNotificationSwitch();
    UI.installActualBrandLogos();
    UI.maybeShowExtensionNotice();
    setTimeout(() => {
      try {
        if (typeof renderCurrentView === "function") renderCurrentView();
        UI.repairInteractionContract();
      } catch (_) {}
    }, 0);
  }

  modules.reduce((promise, source) => promise.then(() => loadModule(source)), Promise.resolve())
    .then(install)
    .catch(error => {
      console.error(error);
      const status = document.getElementById("boot-status");
      if (status) status.textContent = `Lumi interface failed to load: ${error.message}`;
    });
})();
