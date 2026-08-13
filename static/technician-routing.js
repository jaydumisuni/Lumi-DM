"use strict";

(() => {
  let installed = false;

  function installTechnicianRouting() {
    if (installed) return;
    installed = true;
    document.addEventListener("click", event => {
      const firmware = event.target.closest('.nav-item[data-view="firmware"]');
      if (!firmware) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      const group = firmware.closest(".nav-group");
      const toggle = group?.querySelector(".nav-group-toggle");
      group?.classList.add("open");
      toggle?.setAttribute("aria-expanded", "true");
      if (typeof openFirmwareView === "function") void openFirmwareView();
    }, true);
  }

  window.LumiMainUI = window.LumiMainUI || {};
  Object.assign(window.LumiMainUI, { installTechnicianRouting });
})();
