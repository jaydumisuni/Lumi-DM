"use strict";

(() => {
  let installed = false;

  function keepGroupOpen(item) {
    const group = item.closest(".nav-group");
    const toggle = group?.querySelector(".nav-group-toggle");
    group?.classList.add("open");
    toggle?.setAttribute("aria-expanded", "true");
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
      if (window.LumiOperatingSystemsOpen?.open) void window.LumiOperatingSystemsOpen.open();
    }, true);
  }

  window.LumiMainUI = window.LumiMainUI || {};
  Object.assign(window.LumiMainUI, { installTechnicianRouting });
})();
