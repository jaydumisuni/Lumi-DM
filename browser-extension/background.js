/**
 * Lumi extension production service worker.
 *
 * browser-bridge.js preserves the mature old-Lumi interception, request capture,
 * repair, host-rule, takeover and browser-fallback engine. The media bridge adds
 * exact quality/size selection without creating a second extension.
 */
import "./notification-guard.js";
import "./browser-bridge.js";
import "./media-quality-bridge.js";
