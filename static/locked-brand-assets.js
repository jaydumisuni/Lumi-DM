"use strict";
(() => {
  const LOCAL = Object.freeze({
    Windows: "/static/brand/windows.svg",
    macOS: "/static/brand/apple.svg",
    Apple: "/static/brand/apple.svg",
    Android: "/static/brand/android.svg",
    Ubuntu: "/static/brand/ubuntu.svg",
  });

  function brandFromText(value) {
    const text = String(value || "").toLowerCase();
    if (text.includes("windows") || /\bwin(?:10|11)\b/.test(text)) return "Windows";
    if (text.includes("ubuntu")) return "Ubuntu";
    if (text.includes("macos") || text.includes("iphone") || text.includes("ipad") || text.includes("apple") || text.includes("ipsw")) return "Apple";
    if (text.includes("android") || text.includes("apk") || text.includes("aab")) return "Android";
    return "";
  }

  function applyBundledAssets(root = document) {
    root.querySelectorAll("[data-os-family]").forEach(card => {
      const family = card.dataset.osFamily;
      const image = card.querySelector(".os-platform-icon img");
      if (image && LOCAL[family]) image.src = LOCAL[family];
    });

    root.querySelectorAll(".firmware-card").forEach(card => {
      const brand = brandFromText(card.textContent);
      const image = card.querySelector(".firmware-source-icon img");
      if (image && LOCAL[brand]) image.src = LOCAL[brand];
    });

    root.querySelectorAll("#view-firmware .empty-icon img").forEach(image => { image.src = LOCAL.Android; });
    root.querySelectorAll("#view-operating_systems .empty-icon img").forEach(image => { image.src = LOCAL.Windows; });
    root.querySelectorAll(".locked-recent-row").forEach(row => {
      const brand = brandFromText(row.textContent);
      const image = row.querySelector(".locked-recent-name img");
      if (image && LOCAL[brand]) image.src = LOCAL[brand];
    });
  }

  function install() {
    applyBundledAssets();
    new MutationObserver(() => applyBundledAssets()).observe(document.body, { childList: true, subtree: true });
  }

  if (document.readyState === "loading") window.addEventListener("DOMContentLoaded", () => setTimeout(install, 0));
  else setTimeout(install, 0);
})();