"use strict";
(() => {
  if (document.querySelector('link[data-lumi-compact-desktop="1"]')) return;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = "/static/compact-desktop.css";
  link.dataset.lumiCompactDesktop = "1";
  document.head.appendChild(link);
})();
