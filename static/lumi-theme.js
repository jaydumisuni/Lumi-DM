"use strict";

/* Lumi appearance controller.
   Dark is the approved/default product UI. Clear Glass is the approved light UI.
   This module changes appearance only; Lumi's existing application/Electron code
   continues to own downloads, queues, updater, diagnostics, browser capture and
   window controls. */
(() => {
  const THEME_KEY = "Lumi.shell.theme";
  const LEGACY_KEY = "TTG.shell.theme";
  const DARK = "dark";
  const GLASS = "glass";
  const allowed = new Set([DARK, GLASS]);

  function readTheme() {
    const current = localStorage.getItem(THEME_KEY);
    if (allowed.has(current)) return current;
    const legacy = localStorage.getItem(LEGACY_KEY);
    if (legacy === "light" || legacy === GLASS) return GLASS;
    if (legacy === DARK) return DARK;
    return DARK;
  }

  function applyTheme(value) {
    const selected = allowed.has(value) ? value : DARK;
    document.documentElement.dataset.ttgTheme = selected;
    document.documentElement.dataset.lumiTheme = selected;
    document.documentElement.dataset.ttgThemeChoice = selected;
    document.documentElement.dataset.lumiThemeChoice = selected;

    document.querySelectorAll("button[data-lumi-theme]").forEach(button => {
      const active = button.dataset.lumiTheme === selected;
      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", String(active));
    });

    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = selected === GLASS ? "#eef4fb" : "#0b0e13";
  }

  function setTheme(value) {
    if (!allowed.has(value)) return;
    localStorage.setItem(THEME_KEY, value);
    applyTheme(value);
  }

  /* Apply before DOMContentLoaded to avoid a light-theme flash on startup. */
  applyTheme(readTheme());

  document.addEventListener("click", event => {
    // Theme owns only its explicit segmented buttons. The selected theme is also
    // reflected on <html data-lumi-theme>, so an unscoped closest() would match
    // the document root for every click and consume unrelated app interactions.
    const button = event.target.closest("button[data-lumi-theme]");
    if (!button) return;
    event.preventDefault();
    event.stopPropagation();
    setTheme(button.dataset.lumiTheme);
  }, true);

  /* main-ui-shell builds the final gear menu asynchronously. Keep active state
     synchronized whenever that menu is rebuilt. */
  window.addEventListener("DOMContentLoaded", () => {
    applyTheme(readTheme());
    const gear = document.getElementById("ttg-gear-menu");
    if (!gear) return;
    new MutationObserver(() => applyTheme(readTheme())).observe(gear, {
      childList: true,
      subtree: true,
    });
  }, { once: true });

  window.LumiTheme = Object.freeze({
    get: readTheme,
    set: setTheme,
    apply: applyTheme,
    DARK,
    GLASS,
  });
})();