"use strict";

(() => {
  let installed = false;
  let operatingSystemsLoader = null;

  function keepGroupOpen(item) {
    const group = item.closest(".nav-group");
    const toggle = group?.querySelector(".nav-group-toggle");
    group?.classList.add("open");
    toggle?.setAttribute("aria-expanded", "true");
  }

  function ensureOperatingSystemsOpen() {
    if (window.LumiOperatingSystemsOpen?.open) return Promise.resolve(window.LumiOperatingSystemsOpen);
    if (operatingSystemsLoader) return operatingSystemsLoader;
    operatingSystemsLoader = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "/static/operating-systems-open.js";
      script.async = false;
      script.onload = () => window.LumiOperatingSystemsOpen?.open
        ? resolve(window.LumiOperatingSystemsOpen)
        : reject(new Error("Operating Systems opener did not initialize"));
      script.onerror = () => reject(new Error("Operating Systems opener did not load"));
      document.head.appendChild(script);
    });
    return operatingSystemsLoader;
  }

  function installTechnicianRouting() {
    if (installed) return;
    installed = true;
    document.addEventListener("click", event => {
      const firmware = event.target.closest('.nav-item[data-view="firmware"]');
      if (firmware) {
        event.preventDefault();
        event.stopImmediatePropagation();
        keepGroupOpen(firmware);
        if (typeof openFirmwareView === "function") void openFirmwareView();
        return;
      }

      const operatingSystems = event.target.closest('.nav-item[data-view="operating_systems"]');
      if (!operatingSystems) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      keepGroupOpen(operatingSystems);
      void ensureOperatingSystemsOpen()
        .then(module => module.open())
        .catch(error => {
          console.error(error);
          try { if (typeof toast === "function") toast("Operating Systems did not open", error.message, "error"); }
          catch (_) {}
        });
    }, true);
  }

  window.LumiMainUI = window.LumiMainUI || {};
  Object.assign(window.LumiMainUI, { installTechnicianRouting });
})();
