"use strict";

/* The technician workspace registers its optional promotion lookup during
   DOMContentLoaded. Wrap both the session bootstrap and promotion lookup so the
   promotion waits for the real authenticated-session boundary, including a
   delayed remote-pair flow, instead of relying on a fixed polling window. */
(() => {
  if (typeof loadPromotion !== "function" || typeof establishSession !== "function") return;

  const loadPromotionAuthenticated = loadPromotion;
  const establishSessionPrimary = establishSession;
  let sessionReadyResolved = false;
  let resolveSessionReady;
  const sessionReady = new Promise(resolve => { resolveSessionReady = resolve; });

  function hasAuthenticatedSession() {
    try {
      return typeof state !== "undefined" && Boolean(state.auth);
    } catch (_) {
      return false;
    }
  }

  function completeSessionReady() {
    if (sessionReadyResolved) return;
    sessionReadyResolved = true;
    resolveSessionReady(hasAuthenticatedSession());
  }

  establishSession = async function establishSessionWithPromotionReady(...args) {
    try {
      const result = await establishSessionPrimary.apply(this, args);
      completeSessionReady();
      return result;
    } catch (error) {
      completeSessionReady();
      throw error;
    }
  };

  loadPromotion = async function loadPromotionAfterSession() {
    if (!hasAuthenticatedSession()) {
      const authenticated = await sessionReady;
      if (!authenticated) return undefined;
    }
    return loadPromotionAuthenticated();
  };
})();
