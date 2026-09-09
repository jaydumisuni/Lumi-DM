"use strict";
(() => {
  // Browser-only source review has no Electron preload/titlebar, but it must
  // render the same compact manager geometry and materials as the native UI.
  // Electron keeps ownership of its own ttg-desktop class via ttg-shell.js.
  if (!window.electronApp?.isElectron) document.body?.classList.add("ttg-desktop", "lumi-source-review");
  if (document.querySelector('link[data-lumi-compact-desktop="1"]')) return;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = "/static/compact-desktop.css";
  link.dataset.lumiCompactDesktop = "1";
  document.head.appendChild(link);
})();
