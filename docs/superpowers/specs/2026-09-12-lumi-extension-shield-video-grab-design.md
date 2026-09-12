# Lumi Browser Extension: Video Grab, Shield, Quick Test, and File Capture Proof

## Status

Approved design with the September 12 correction to video-trigger visibility. This spec changes the browser extension only; it must preserve the existing Lumi Runtime, widget handoff, LinkGrabber, fixed extension identity, local trust, and download engine contracts.

## Existing authority

The implementation starts from the verified extension architecture already in the repository:

- Manifest V3 fixed-ID extension.
- Automatic local trust to the single local Lumi Runtime.
- Persistent WebSocket bridge.
- Browser-first media observations plus Lumi resolver fallback.
- HLS/DASH inspection and uncapped distinct media-quality variants.
- Canonical browser capture -> Runtime -> existing widget handoff.
- Existing `chrome.downloads.onCreated` capture for normal browser downloads.
- DRM/session-protected media fails closed.
- localhost / 127.0.0.1 Runtime traffic must never be filtered by Shield.

No parallel download engine, no new native window, and no second media resolver are allowed.

## 1. Video Grab control

### Purpose

Keep the current browser-first media discovery and quality panel, but make the player control minimal and non-obstructive.

### Visibility lifecycle

1. Do **not** show the video-grab control just because a `<video>` element exists.
2. Lumi first performs or receives media discovery. The control becomes eligible only when at least one downloadable media quality/variant is actually available.
3. When qualities first become available, show the full Lumi control at normal readability for approximately **5 seconds**.
4. After 5 seconds, collapse/fade it into a small Lumi mark that remains visible enough to discover but occupies almost no player area.
5. Moving the pointer anywhere over the video must **not** restore the full control.
6. The control expands to its full glass pill only when the pointer is directly over the Lumi mark/control itself, or the control has keyboard focus.
7. When the pointer/focus leaves, it returns to the faded compact mark without another 5-second full-display period.
8. Clicking the mark/pill opens the existing quality panel; the panel retains all distinct resolutions, FPS, containers, audio-only/video-only variants, subtitle counts, and resolver results. There is no artificial quality cap.

### Readiness probe

- Media presence starts a bounded, debounced readiness probe; it does **not** create the UI immediately.
- The probe sends the same browser snapshot to the existing `lumi-media-discover` path already used by the panel. No second resolver is introduced.
- Cache the result by page URL plus observable media identity so DOM mutation storms do not repeatedly invoke the resolver.
- Only `variants_found` with at least one variant creates/reveals the mark. `unsupported_protected`, `session_unavailable`, `resolver_timeout`, and `no_downloadable_media` leave the mark absent.
- Clicking the mark opens the already-resolved variants immediately. Explicit `Scan again` may refresh them.
- SPA navigation, a changed current media source, or disappearance of the player invalidates the cached readiness result and may trigger a new debounced probe.

### Placement

- Anchor against the largest visible video player.
- Prefer an upper corner with at least 8 px inset.
- Never occupy the player bottom-control strip.
- Reposition on resize, scroll, fullscreen/layout mutation, and SPA navigation.
- If no verified downloadable variant remains, remove the mark.

### Accessibility

- Real `<button>` semantics.
- Keyboard focus reveals the full control.
- Visible focus ring.
- Accessible label communicates that Lumi has downloadable qualities.
- Reduced-motion users get opacity/state changes without unnecessary animation.

## 2. Lumi Shield

### Scope

Shield is a balanced convenience blocker, not a full AdGuard/EasyList clone. It must minimize breakage and remain immediately bypassable per site.

### Network layer

- Use Manifest V3 `declarativeNetRequest`.
- Ship a small curated static ruleset for known ad-serving, pop-under, and nuisance tracking hosts that directly cause unwanted ad navigations.
- Do not use broad cosmetic selectors such as elements whose class merely contains `ad`.
- Do not filter `127.0.0.1`, `localhost`, Lumi Runtime routes, WebSocket bridge traffic, or extension resources.
- Shield may be disabled per site. Per-site allow state is stored in `chrome.storage`.

### Popup/new-tab guard

- Distinguish likely unsolicited popup/pop-under tabs from user-initiated navigation using a short interaction grace window tied to trusted user clicks/keyboard actions.
- Close only tabs/windows that meet the unsolicited-navigation policy.
- Never close a tab created from a recent explicit user activation.
- Never close Lumi-owned localhost pages or extension pages.
- Record lightweight counters only; no browsing history upload.

### Controls

The extension popup shows:

- `Lumi Shield` master state.
- `Shield on this site` toggle for the active site.
- Current blocked-request / blocked-popup count for the tab or session where available.
- Clear wording that disabling Shield affects the current site immediately.

## 3. Quick Speed Test

### Behavior

- Add one-tap `Quick Test` to the extension popup.
- Reuse Lumi Runtime's existing local `/api/speedtest` endpoint and its Cloudflare 5 MB probe.
- No Fast.com branding and no new third-party speed-test dependency.
- Display connecting/testing state, then Mbps result and latency when provided.
- Failure must say Lumi is unavailable or the test failed; it must not hang indefinitely.
- This quick test does not replace Lumi's full connection-capacity test in the desktop application.

## 4. Browser toolbar branding

- Reuse the repository's approved/generated Lumi PNG identity.
- Manifest V3 must define extension-level `icons` for 16/48/128 and `action.default_icon` for 16/48/128.
- Keep aspect ratio and original artwork; do not redraw or generate a replacement icon.
- Popup and in-player control continue using the same product identity.

## 5. Normal-file browser download capture

The existing `chrome.downloads.onCreated` path remains the authority. New work may improve classification/metadata, but must not introduce a second capture engine.

### Required file classes

Prove interception/handoff for representative direct downloads including:

- ZIP
- RAR or another archive class if the site provides it
- PDF
- DOC/DOCX
- at least one additional ordinary downloadable artifact such as EXE/MSI/APK/ISO

The extension must either hand the download to the canonical Lumi Runtime/widget flow or explicitly leave it to the browser according to the existing user preference/policy. It must never silently lose a browser download.

## 6. Live-site proof matrix

### Media discovery sites

Use the actual bundled extension in Brave on KRATOS against:

1. YouTube
2. Dailymotion
3. Bilibili.tv
4. movie-box.co
5. narto-drama.com

For each site record:

- whether a media player was detected;
- whether downloadable qualities became available;
- count of distinct exposed qualities/variants;
- representative resolution/FPS/container/audio-only/video-only distinctions;
- whether the Lumi mark stayed hidden until qualities were ready;
- whether it showed fully for ~5 seconds and then faded;
- whether only direct hover/focus on the mark restored the full pill;
- whether overlay placement interfered with playback controls;
- whether selecting a quality reached the one canonical Runtime/widget;
- DRM/protected/session-bound failures explicitly reported as unsupported rather than treated as success.

Actual completed-download proof may use open/public media. Discovery/quality proof on the five sites does not require bypassing DRM, authentication, paywalls, or site access controls.

### Ordinary download sites

Use the actual bundled extension against:

1. **SamFW** — prove the browser-download capture path on an available firmware/download artifact without bypassing account, anti-bot, or access controls.
2. **GitHub Releases** — representative release asset such as ZIP/EXE where available.
3. **SourceForge** — representative archive/installer/ISO asset where available.
4. **File-Examples.com** (or an equivalent public sample-file site if unavailable) — representative PDF and DOC/DOCX, plus ZIP/RAR when offered.

For each capture record:

- source URL/site;
- detected filename and extension/content type;
- whether normal browser download interception fired;
- whether the item reached the canonical Runtime/widget;
- whether cancel/decline leaves the browser path functional;
- no duplicate task was created.

If a chosen site is unavailable or blocks automated browsing, replace only that proof target with another public site offering the same file class and record the substitution.

## 7. Regression boundary

The following are release-blocking regressions:

- extension ID changes;
- manual pairing returns;
- local trust or persistent WebSocket bridge breaks;
- browser capture stops working;
- LinkGrabber import breaks;
- quality variants are truncated/deduplicated incorrectly;
- media selection creates more than one canonical Runtime task;
- widget handoff changes from the existing one-widget lifecycle;
- normal browser downloads are lost or duplicated;
- 32-connection handoff is changed;
- Shield blocks localhost/127.0.0.1 or Lumi WebSocket traffic;
- Shield closes explicit user-clicked tabs;
- DRM/protected media is presented as downloadable when it is not.

## 8. Test strategy

Use TDD and prove in layers:

1. Static manifest/branding/permission contracts.
2. Deterministic content-script fixture for quality-ready -> 5-second full -> faded mark -> mark-only hover/focus reveal.
3. Deterministic Shield rules and per-site bypass tests.
4. Deterministic popup-guard tests for trusted user click vs unsolicited popup.
5. Quick-test popup contract against a fixture Runtime endpoint.
6. Existing extension bridge/media/download-capture regression suites.
7. Real Brave bundled-extension proof on KRATOS for the media and file-site matrices above.
8. Final source/diff review and full extension/runtime regression before merge/push.

## 9. Permissions and privacy

Add only the permissions required by the approved design. Expected additions are `declarativeNetRequest` and any minimal permission needed to enable/disable rules or observe navigation. Do not request browsing-history permission. Store Shield preferences locally. No browsing history, detected media list, or speed-test results are uploaded by the extension except the existing local communication to Lumi Runtime.

## 10. Acceptance

The feature is acceptable only when all deterministic tests pass and the real bundled extension proof shows:

- qualities-ready gating and corrected 5-second video-control behavior;
- no player-control obstruction;
- balanced Shield with working per-site bypass;
- Quick Test through Lumi Runtime;
- correct toolbar Lumi icon;
- media quality selection still reaches the one canonical Runtime/widget;
- SamFW plus three additional public download sites demonstrate ordinary file capture across the required classes;
- all listed regression boundaries remain green.
