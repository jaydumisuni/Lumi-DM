"use strict";

/*
 * Operating Systems navigation bridge.
 *
 * The native operating-systems.js module owns catalogue state, rendering and
 * all OS actions. This bridge only guarantees that its existing view-level
 * handler is invoked after the OS route becomes active. It does not duplicate
 * OS state or transfer behavior.
 */
(() => {
  function ensureNativeOsRenderer() {
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
    const item = event.target.closest('.nav-item[data-view="operating_systems"]');
    if (!item) return;
    window.setTimeout(ensureNativeOsRenderer, 0);
  });
})();
