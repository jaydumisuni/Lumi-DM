# Lumi Extension Shield + Video Grab Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the approved Lumi browser-extension video-ready mark lifecycle, balanced Shield, Quick Test, native toolbar identity, and ordinary-download proof without changing the canonical Lumi Runtime/widget/download-engine contracts.

**Architecture:** Keep `browser-extension/` as the editable source and mirror the bundled files into `static/browser-extension/chromium/`. Media readiness remains browser-first and calls the existing `lumi-media-discover` path before creating any control; Shield remains extension-local using MV3 declarativeNetRequest plus a conservative user-activation popup guard; all media/file handoffs continue through the existing background service worker and canonical Runtime RPC.

**Tech Stack:** Manifest V3, Chromium/Brave extension APIs, vanilla JavaScript/HTML/CSS, Python pytest source contracts, Node Playwright deterministic fixtures and real Brave proof.

**Spec:** `docs/superpowers/specs/2026-09-12-lumi-extension-shield-video-grab-design.md`

## Global Constraints

- The video mark stays absent until `variants_found` contains at least one downloadable variant.
- First readiness shows the full control for approximately 5 seconds; afterward it collapses to a barely-visible mark.
- Pointer movement over the player never restores the pill; only direct mark hover or keyboard focus restores it.
- Distinct qualities/variants remain uncapped.
- No second media resolver, second browser-capture engine, new native window, or parallel download engine.
- Fixed extension ID, automatic local trust, persistent WebSocket bridge, LinkGrabber, widget handoff, and `connections: 32` remain unchanged.
- Shield never filters `127.0.0.1`, `localhost`, Lumi Runtime/WebSocket traffic, or extension resources.
- Shield popup/new-tab guard never closes recent explicit user-clicked navigation.
- DRM/session-protected media remains fail-closed.
- Toolbar artwork reuses the approved Lumi identity assets; no redraw or replacement artwork.
- Live proof matrix: YouTube, Dailymotion, Bilibili.tv, movie-box.co, narto-drama.com; ordinary files: SamFW, GitHub Releases, SourceForge, File-Examples.com or equivalent substitution with the same file class.

---

### Task 1: Quality-ready media mark and cached pre-resolution

**Files:**
- Modify: `browser-extension/content-v2.js`
- Mirror: `static/browser-extension/chromium/content-v2.js`
- Create: `tests/playwright_extension_video_mark_lifecycle.js`
- Create: `tests/test_extension_video_mark_contract.py`

**Interfaces:**
- Consumes: existing `collectSnapshot()`, `send({type: "lumi-media-discover"})`, `renderVariants()`, `stageVariant()`.
- Produces: a debounced readiness probe keyed by page URL + observable media identity; `state.media` is populated before host creation; the existing panel opens from cached variants immediately.

- [ ] **Step 1: Write failing source contract** proving the host is not created by `pageHasMedia()` alone, readiness uses `lumi-media-discover`, cache invalidation keys include page/media identity, and no quality slice/cap is introduced.

```python
def test_video_mark_requires_resolved_variants():
    source = (ROOT / "browser-extension" / "content-v2.js").read_text()
    assert 'type: "lumi-media-discover"' in source
    assert "variants_found" in source
    assert "scheduleReadinessProbe" in source
    assert "readinessCache" in source
    assert "slice(0," not in source[source.index("function renderVariants"):source.index("async function stageVariant")]
```

- [ ] **Step 2: Run the source contract and confirm RED** with missing readiness-probe symbols.

Run: `python -m pytest -q tests/test_extension_video_mark_contract.py`

- [ ] **Step 3: Write deterministic Playwright fixture** with a fake extension runtime message responder returning no variants first, then 14 variants. Assert no host before ready; full pill appears after ready; fake clock advances ~5 s; compact mark remains; player hover does not expand; mark hover/focus expands; blur/leave collapses; clicking opens all 14 rows without re-resolving.

Run: `NODE_PATH=/home/kratos/node_modules node tests/playwright_extension_video_mark_lifecycle.js`
Expected before production edit: FAIL because current content script creates the host from media presence immediately.

- [ ] **Step 4: Implement minimal readiness state machine** in `content-v2.js`: `readinessCache`, identity-key builder, 350 ms debounce, one in-flight probe per key, bounded failure states, 5-second `full-intro` timer, compact mark state, direct trigger hover/focus listeners, cache invalidation on URL/currentSrc/player disappearance, and cached-panel open.

- [ ] **Step 5: Verify GREEN** for source + Playwright lifecycle tests and copy the exact file to the bundled static extension.

- [ ] **Step 6: Re-run existing variant identity test with a live Runtime** and assert 14 variants remain distinct and direct `<video src>` remains one candidate.

---

### Task 2: Balanced Lumi Shield network rules and per-site bypass

**Files:**
- Modify: `browser-extension/manifest.json`
- Create: `browser-extension/shield-rules.json`
- Modify: `browser-extension/background.js`
- Mirror the same files under `static/browser-extension/chromium/`
- Create: `tests/test_extension_shield_manifest.py`
- Create: `tests/playwright_extension_shield.js`

**Interfaces:**
- Consumes: `chrome.storage.local`, `chrome.tabs`, existing background service worker.
- Produces: `lumi-shield-state`, `lumi-shield-set-master`, `lumi-shield-set-site`, `lumi-shield-user-activation`, and local blocked counters.

- [ ] **Step 1: Write RED manifest/rules contracts** asserting `declarativeNetRequest` permission, one enabled static ruleset, no history permission, localhost exclusions, and only curated nuisance/ad hosts.

- [ ] **Step 2: Write RED deterministic Shield test** that loads the real extension and fixture pages: master on blocks a curated nuisance URL; current-site bypass adds a higher-priority allow session rule; localhost Runtime URLs remain allowed.

- [ ] **Step 3: Implement `shield-rules.json`** with a small host-only block list and explicit localhost exclusions; add DNR manifest declaration.

- [ ] **Step 4: Implement per-site state** using storage key `lumiShield` plus `lumiShieldSiteAllow`; rebuild session allow rules on worker start and after toggles; keep counters local only.

- [ ] **Step 5: Verify GREEN** and mirror source/bundle files byte-for-byte.

---

### Task 3: Conservative unsolicited popup/new-tab guard

**Files:**
- Modify: `browser-extension/content-v2.js`
- Modify: `browser-extension/background.js`
- Mirror both files
- Create: `tests/playwright_extension_popup_guard.js`

**Interfaces:**
- Consumes: trusted `pointerdown`/`keydown` events from the content script and `chrome.tabs.onCreated/onUpdated`.
- Produces: per-tab activation timestamps and blocked-popup count; no browsing-history storage.

- [ ] **Step 1: Write RED fixture** where a trusted click opens a new tab and must survive, while a script-created cross-origin nuisance tab outside the short grace window is closed; localhost/extension URLs must always survive.

- [ ] **Step 2: Implement content-script activation messages** only when `event.isTrusted` is true; do not treat pointer movement as activation.

- [ ] **Step 3: Implement background guard** with a short bounded activation grace window, opener-tab correlation, safe-scheme/localhost exemptions, conservative close policy for configured nuisance destinations only, and local counters.

- [ ] **Step 4: Verify GREEN** and confirm explicit navigation is never closed.

---

### Task 4: Popup Shield controls, Quick Test, and approved toolbar PNG identity

**Files:**
- Modify: `browser-extension/popup.html`
- Modify: `browser-extension/popup.css`
- Modify: `browser-extension/popup.js`
- Modify: `browser-extension/manifest.json`
- Add/reuse: `browser-extension/icons/icon16.png`, `icon48.png`, `icon128.png`
- Mirror popup/manifest/icons to `static/browser-extension/chromium/`
- Create: `tests/test_extension_popup_branding_contract.py`
- Create: `tests/playwright_extension_popup_controls.js`

**Interfaces:**
- Consumes: background Shield messages and existing authenticated `lumiRequest` path.
- Produces: `lumi-quick-test` message returning `/api/speedtest` data; popup toggles and status/count display.

- [ ] **Step 1: Write RED static branding contract** asserting manifest `icons` and `action.default_icon` define 16/48/128 PNGs and hashes match approved generated Lumi identity outputs.

- [ ] **Step 2: Write RED popup fixture** proving master Shield toggle, site toggle, counters, Quick Test loading/result/error state, and no pairing UI regression.

- [ ] **Step 3: Reuse approved PNG identity** by running the repository identity generator only after its canonical-source hash verifies; copy the resulting three PNGs into the bundled static extension unchanged.

- [ ] **Step 4: Add `lumi-quick-test` background message** using `lumiRequest("/api/speedtest")`; return Mbps/bytes and optional latency fields without introducing a third-party speed test.

- [ ] **Step 5: Implement popup controls** with immediate site bypass and bounded Quick Test UI; preserve existing Capture browser downloads, Choose quality, LinkGrabber, Open Lumi, and Automatic local trust surfaces.

- [ ] **Step 6: Verify GREEN** for static + popup Playwright tests.

---

### Task 5: Ordinary browser-download capture classification and no-loss proof

**Files:**
- Modify only if tests require: `browser-extension/background.js`
- Mirror if modified
- Create: `tests/playwright_extension_file_capture.js`
- Extend: `tests/test_browser_extension_single_authority.py`

**Interfaces:**
- Consumes: existing `chrome.downloads.onCreated -> captureDownload -> stageCapture -> browser.capture` flow.
- Produces: proof metadata/classification only; browser resumes on decline/error/timeout, canonical Lumi handoff pauses/cancels only after persistence.

- [ ] **Step 1: Write deterministic RED/coverage fixture** for `.zip`, `.rar`, `.pdf`, `.docx`, `.exe` downloads. Assert each onCreated event stages exactly one canonical handoff with `connections: 32` and correct filename/source metadata.

- [ ] **Step 2: Prove decline/error behavior**: browser download resumes; no silent loss; no duplicate Runtime task.

- [ ] **Step 3: Make only minimal classification/metadata changes required by the fixture**; do not add another download listener or capture engine.

- [ ] **Step 4: Verify existing LinkGrabber and single-authority tests remain GREEN.**

---

### Task 6: Full regression, real bundled Brave proof, freeze and sync

**Files:**
- Create: `tests/playwright_extension_live_matrix.js` or a proof runner that records structured JSON without embedding site-specific secrets.
- Create proof artifacts outside Git under the existing artifacts/proof location.
- Update tests only for genuinely superseded behavior encoded by the approved spec.

**Interfaces:**
- Consumes: the actual bundled extension from `static/browser-extension/chromium`, real local Runtime/bridge, existing widget handoff.
- Produces: deterministic regression evidence plus real-site matrix evidence.

- [ ] **Step 1: Run static/Python extension contracts.**

Run:
`python -m pytest -q tests/test_browser_extension_single_authority.py tests/test_browser_extension_linkgrabber_contract.py tests/test_extension_video_mark_contract.py tests/test_extension_shield_manifest.py tests/test_extension_popup_branding_contract.py`

- [ ] **Step 2: Run deterministic Playwright suite** for video lifecycle, Shield, popup guard, popup controls, file capture, existing variant identity, existing correction flow, widget handoff, notification guard.

- [ ] **Step 3: Start the actual Lumi Runtime and load the bundled extension in Brave on KRATOS.** Verify bridge connected and fixed extension ID before live-site navigation.

- [ ] **Step 4: Media matrix**: YouTube, Dailymotion, Bilibili.tv, movie-box.co, narto-drama.com. Record player detected, readiness terminal state, variant count/representative qualities, hidden-until-ready, ~5-second intro, mark-only hover/focus, placement, canonical handoff, and explicit DRM/session failure where applicable. Never bypass authentication/paywall/DRM.

- [ ] **Step 5: File matrix**: SamFW, GitHub Releases, SourceForge, File-Examples.com/equivalent. Record filename/type, interception, canonical Runtime/widget handoff, browser decline fallback, and duplicate count for ZIP/RAR/PDF/DOCX plus one EXE/MSI/APK/ISO class.

- [ ] **Step 6: Run complete extension/runtime regression boundary** including fixed ID/local trust/WebSocket/LinkGrabber/32-connection/widget lifecycle and `git diff --check`.

- [ ] **Step 7: Review diff against the frozen spec**: no history permission, no second resolver/capture engine/window, no quality cap, localhost excluded from Shield, explicit user tabs preserved.

- [ ] **Step 8: Commit verified implementation, push branch, verify remote SHA.**

- [ ] **Step 9: ATHENA catch-up only after KRATOS is frozen**: fetch the verified branch/commit, preserve any unrelated ATHENA local work, fast-forward/update Lumi to the exact remote SHA, then run the deterministic extension smoke/regression on ATHENA and verify `git rev-parse HEAD` matches KRATOS.
