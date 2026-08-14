"use strict";

/*
 * Operating Systems navigation compatibility adapter.
 *
 * operating-systems.js remains the sole owner of OS state, catalogue rendering,
 * search, resolution and download actions. In the composed desktop lifecycle,
 * its one-time navigation callback is not reliable after the primary UI layers
 * bind. This adapter does not duplicate any OS behavior: after the OS route is
 * active, it invokes the native view-level clear action, whose existing handler
 * calls the native renderOsView() path.
 */
(() => {
  function renderThroughNativeHandler() {
    const view = document.getElementById("view-operating_systems");
    if (!view || view.querySelector(".os-catalogue-shell")) return;

    const trigger = document.createElement("button");
    trigger.type = "button";
    trigger.hidden = true;
    trigger.dataset.osAction = "clear";
    view.appendChild(trigger);
    trigger.click();
    trigger.remove();
  }

  document.addEventListener("click", event => {
    if (!event.target.closest('.nav-item[data-view="operating_systems"]')) return;
    window.setTimeout(renderThroughNativeHandler, 0);
  });
})();
