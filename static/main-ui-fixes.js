"use strict";
(() => {
  function installDesktopActions() {
    document.addEventListener("click", event => {
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
