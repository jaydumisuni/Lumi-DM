"use strict";
(() => {
  let osLoader = null;

  function loadOperatingSystemsRenderer() {
    if (window.LumiOperatingSystemsOpen?.open) return Promise.resolve(window.LumiOperatingSystemsOpen);
    if (osLoader) return osLoader;
    osLoader = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "/static/operating-systems-open.js";
      script.async = false;
      script.onload = () => {
        if (window.LumiOperatingSystemsOpen?.open) resolve(window.LumiOperatingSystemsOpen);
        else reject(new Error("Operating Systems renderer did not initialize"));
      };
      script.onerror = () => reject(new Error("Operating Systems renderer could not be loaded"));
      document.head.appendChild(script);
    }).catch(error => {
      osLoader = null;
      throw error;
    });
    return osLoader;
  }

  function openOperatingSystems(operatingSystems) {
    const group = operatingSystems.closest(".nav-group");
    const toggle = group?.querySelector(".nav-group-toggle");
    group?.classList.add("open");
    toggle?.setAttribute("aria-expanded", "true");
    void loadOperatingSystemsRenderer()
      .then(renderer => renderer.open())
      .catch(error => {
        if (typeof toast === "function") toast("Operating Systems unavailable", error.message || String(error), "error");
      });
  }

  function installDesktopActions() {
    document.addEventListener("click", event => {
      const operatingSystems = event.target.closest('.nav-item[data-view="operating_systems"]');
      if (operatingSystems) {
        event.preventDefault();
        event.stopImmediatePropagation();
        openOperatingSystems(operatingSystems);
        return;
      }

      const openFolder = event.target.closest('[data-action="open-folder"]');
      if (!openFolder) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      const target = String(state?.settings?.default_dir || "").trim();
      if (!target) {
        if (typeof toast === "function") toast("Download folder not set", "Choose a default folder in Settings → Storage.", "warning");
        return;
      }
      void Promise.resolve(window.electronApp?.openPath?.(target)).catch(error => {
        if (typeof toast === "function") toast("Folder not opened", error.message || String(error), "error");
      });
    }, true);
  }

  window.LumiMainUI = window.LumiMainUI || {};
  Object.assign(window.LumiMainUI, { installDesktopActions });
})();
