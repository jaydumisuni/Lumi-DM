"use strict";
(() => {
  function installDesktopActions() {
    document.addEventListener("click", event => {
      const operatingSystems = event.target.closest('.nav-item[data-view="operating_systems"]');
      if (operatingSystems) {
        event.preventDefault();
        event.stopImmediatePropagation();
        const group = operatingSystems.closest(".nav-group");
        const toggle = group?.querySelector(".nav-group-toggle");
        group?.classList.add("open");
        toggle?.setAttribute("aria-expanded", "true");
        try {
          if (typeof switchView === "function") switchView("operating_systems");
        } catch (_) {}

        const view = document.getElementById("view-operating_systems");
        if (!view) return;
        const trigger = document.createElement("button");
        trigger.type = "button";
        trigger.hidden = true;
        trigger.dataset.osFamily = sessionStorage.getItem("LUMI.osFamily") || "Windows";
        view.appendChild(trigger);
        window.setTimeout(() => {
          try {
            if (trigger.isConnected) trigger.click();
          } finally {
            trigger.remove();
          }
        }, 0);
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
