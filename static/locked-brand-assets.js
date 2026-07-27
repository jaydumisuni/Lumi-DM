"use strict";
(() => {
  const LOCAL = Object.freeze({
    Windows: "/static/brand/windows.svg",
    macOS: "/static/brand/apple.svg",
    Apple: "/static/brand/apple.svg",
    Android: "/static/brand/android.svg",
    Ubuntu: "/static/brand/ubuntu.svg",
    Linux: "/static/brand/linux.svg",
  });

  function brandFromText(value) {
    const text = String(value || "").toLowerCase();
    if (text.includes("windows") || /\bwin(?:10|11)\b/.test(text)) return "Windows";
    if (text.includes("ubuntu")) return "Ubuntu";
    if (text.includes("linux") || text.includes("debian") || text.includes("fedora") || text.includes("mint") || text.includes("arch")) return "Linux";
    if (text.includes("macos") || text.includes("iphone") || text.includes("ipad") || text.includes("apple") || text.includes("ipsw")) return "Apple";
    if (text.includes("android") || text.includes("apk") || text.includes("aab")) return "Android";
    return "";
  }

  function useAsset(image, source) {
    if (!image || !source || image.getAttribute("src") === source) return;
    image.setAttribute("src", source);
  }

  function applyBundledAssets(root = document) {
    root.querySelectorAll("[data-os-family]").forEach(card => {
      useAsset(card.querySelector(".os-platform-icon img"), LOCAL[card.dataset.osFamily]);
    });

    root.querySelectorAll(".firmware-card").forEach(card => {
      useAsset(card.querySelector(".firmware-source-icon img"), LOCAL[brandFromText(card.textContent)]);
    });

    root.querySelectorAll("#view-firmware .empty-icon img").forEach(image => useAsset(image, LOCAL.Android));
    root.querySelectorAll("#view-operating_systems .empty-icon img").forEach(image => useAsset(image, LOCAL.Windows));
    root.querySelectorAll(".locked-recent-row").forEach(row => {
      useAsset(row.querySelector(".locked-recent-name img"), LOCAL[brandFromText(row.textContent)]);
    });
  }

  function install() {
    applyBundledAssets();
    let pending = false;
    new MutationObserver(() => {
      if (pending) return;
      pending = true;
      requestAnimationFrame(() => {
        pending = false;
        applyBundledAssets();
      });
    }).observe(document.body, { childList: true, subtree: true });
  }

  if (document.readyState === "loading") window.addEventListener("DOMContentLoaded", () => setTimeout(install, 0));
  else setTimeout(install, 0);
})();