"use strict";
(() => {
  const UI = window.LumiMainUI = window.LumiMainUI || {};
  let osLoader = null;

  function loadOperatingSystemsRenderer() {
    if (window.LumiOperatingSystemsOpen?.open) return Promise.resolve(window.LumiOperatingSystemsOpen);
    if (osLoader) return osLoader;
    osLoader = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "/static/operating-systems-open.js";
      script.async = false;
      script.onload = () => {
        if (window.LumiOperatingSystemsOpen?.open) resolve(window.LumiOperatingSystemsOpen);
        else reject(new Error("Operating Systems renderer did not initialize"));
      };
      script.onerror = () => reject(new Error("Operating Systems renderer could not be loaded"));
      document.head.appendChild(script);
    }).catch(error => {
      osLoader = null;
      throw error;
    });
    return osLoader;
  }

  function openOperatingSystems(operatingSystems) {
    const group = operatingSystems?.closest?.(".nav-group");
    const toggle = group?.querySelector(".nav-group-toggle");
    group?.classList.add("open");
    toggle?.setAttribute("aria-expanded", "true");
    return loadOperatingSystemsRenderer()
      .then(renderer => renderer.open())
      .catch(error => {
        if (typeof toast === "function") toast("Operating Systems unavailable", error.message || String(error), "error");
      });
  }

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

  function installActualBrandLogos() {
    const brand = UI.BRAND || {};

    function setImage(host, source, alt = "") {
      if (!host || !source) return;
      const current = host.firstElementChild;
      if (
        host.childElementCount === 1
        && current?.tagName === "IMG"
        && current.getAttribute("src") === source
        && current.getAttribute("alt") === alt
      ) return;
      const image = document.createElement("img");
      image.src = source;
      image.alt = alt;
      host.replaceChildren(image);
    }

    function apply() {
      document.querySelectorAll("[data-os-family]").forEach(button => {
        const family = button.dataset.osFamily;
        const host = button.querySelector(".os-platform-icon");
        const source = family === "Windows" ? brand.windows : family === "macOS" ? brand.apple : brand.linux;
        setImage(host, source, family || "");
      });

      document.querySelectorAll("#view-firmware .firmware-card").forEach(card => {
        const text = card.textContent.toLowerCase();
        const host = card.querySelector(".firmware-source-icon");
        const source = text.includes("apple") || text.includes("iphone") || text.includes("ipad")
          ? brand.apple
          : text.includes("android") || text.includes("samsung") || text.includes("xiaomi") || text.includes("oppo") || text.includes("vivo")
            ? brand.android
            : brand.lumi;
        setImage(host, source, "");
      });
    }

    apply();
    const observer = new MutationObserver(apply);
    [document.getElementById("view-operating_systems"), document.getElementById("view-firmware")]
      .filter(Boolean)
      .forEach(view => observer.observe(view, { childList: true, subtree: true }));
  }

  Object.assign(UI, { installDesktopActions, installActualBrandLogos, openOperatingSystems });
})();
