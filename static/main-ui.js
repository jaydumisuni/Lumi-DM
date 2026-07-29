"use strict";
(() => {
  const UI = window.LumiMainUI;
  function install() {
    UI.bindTechnicianGroup();
    UI.installViewMetadata();
    window.renderOverview = UI.renderOverviewPrimary;
    window.renderDownloads = UI.renderDownloadsPrimary;
    window.renderQueues = UI.renderQueuesPrimary;
    window.renderCategories = UI.renderCategoriesPrimary;
    window.renderGrabber = UI.renderGrabberPrimary;
    window.renderSettings = UI.renderSettingsPrimary;
    try { renderOverview = UI.renderOverviewPrimary; } catch (_) {}
    try { renderDownloads = UI.renderDownloadsPrimary; } catch (_) {}
    try { renderQueues = UI.renderQueuesPrimary; } catch (_) {}
    try { renderCategories = UI.renderCategoriesPrimary; } catch (_) {}
    try { renderGrabber = UI.renderGrabberPrimary; } catch (_) {}
    try { renderSettings = UI.renderSettingsPrimary; } catch (_) {}
    UI.bindPrimaryActions();
    UI.patchGearMenu();
    UI.patchNotificationSwitch();
    UI.installActualBrandLogos();
    UI.maybeShowExtensionNotice();
    setTimeout(() => { try { if (typeof renderCurrentView === "function") renderCurrentView(); } catch (_) {} }, 0);
  }
  if (document.readyState === "loading") window.addEventListener("DOMContentLoaded", install, { once: true });
  else install();
})();
