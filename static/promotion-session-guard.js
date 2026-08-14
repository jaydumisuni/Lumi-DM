"use strict";

/* The technician workspace registers its optional promotion lookup during
   DOMContentLoaded. Wrap that lookup before DOMContentLoaded fires so it waits
   for Lumi's authenticated session instead of producing a harmless startup
   401. Endpoint authentication remains unchanged. */
(() => {
  if (typeof loadPromotion !== "function") return;
  const loadPromotionAuthenticated = loadPromotion;

  loadPromotion = async function loadPromotionAfterSession() {
    for (let attempt = 0; attempt < 200; attempt += 1) {
      try {
        if (typeof state !== "undefined" && state.auth) {
          return await loadPromotionAuthenticated();
        }
      } catch (_) {}
      await new Promise(resolve => window.setTimeout(resolve, 50));
    }
    return undefined;
  };
})();
