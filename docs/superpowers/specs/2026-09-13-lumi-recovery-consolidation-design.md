# Lumi Recovery Consolidation Design

**Date:** 2026-09-13
**Authority:** KRATOS `feature/lumi-extension-shield-video-grab`
**Scope:** Consolidate existing Lumi browser capture, download recovery, widget lifecycle, readability/speed telemetry, firmware/OS catalogue, and background ownership without replacing the canonical Runtime or download engine.

## 1. Goals

Lumi must behave as one coherent download manager across direct browser downloads, media capture, large-file recovery, firmware/OS catalogues, the full manager, and the floating widget. The correction must preserve the canonical Runtime, task identity, resume journals, 32-connection policy where applicable, optional queues, local-trust extension identity, and verified firmware provenance.

This recovery specifically closes these observed defects:

- Browser captures can lose finalized filenames and stage generic or UUID-like names.
- Browser right-click integration is absent.
- Repair/Renew Download Link exists in the backend but is buried and not integrated with the browser capture flow.
- Media quality/size presentation is inconsistent across real sites.
- The extension contains unnecessary local-architecture copy (`One Lumi application`).
- Main manager and widget have competing visibility owners.
- Widget text/filename presentation is too difficult to read.
- Overview Download Speed is visually present but not a complete selectable session-history surface.
- Firmware UI contains multiple generations of ownership; the correct dependency-order correction exists but is not loaded by the live app.
- Application-wide supporting text remains too small/inconsistent.
- Background ownership was corrected incorrectly: the approved Lumi background was removed together with the obsolete TECHGUY background.

## 2. Non-goals

- No Runtime rewrite.
- No replacement of the existing HTTP/resume engine.
- No fabricated firmware links or unverified firmware labelled as official.
- No new third confirmation BrowserWindow.
- No aggressive ad blocker.
- No forced queues for normal downloads.
- No DRM/paywall bypass.

## 3. Background authority correction

`static/lumi-background.png` is the approved Lumi background and must be restored from repository authority. `static/background.png` is the older TECHGUY background and must remain removed.

Implementation rules:

- Restore `static/lumi-background.png` byte-for-byte from the approved repository version unless later evidence identifies a newer approved Lumi asset.
- Restore active Lumi material references to `/static/lumi-background.png`.
- Remove `/static/background.png` references from old workspace/boot CSS.
- Do not substitute a blank background.
- Keep the service-worker cache entry for `/static/lumi-background.png`.
- Final visual proof must show the approved Lumi background and no old TECHGUY image underneath it.

## 4. Browser capture and finalized filename authority

The browser extension owns browser-download observation; Runtime owns persisted tasks. A browser download must not be staged with a generic or temporary filename when Chromium later exposes a better final name.

Filename precedence:

1. Finalized `chrome.downloads` filename with a meaningful extension/name.
2. Final URL path filename when the browser value is generic, UUID-like, or extensionless.
3. Content-Disposition/request evidence when available.
4. Original URL filename.
5. Generic fallback only when no stronger evidence exists.

The extension must listen for filename updates after `downloads.onCreated` and may use a short bounded settling period. It must update the existing pending task rather than create a replacement task. SamFW/IPSW cases are required acceptance fixtures.

## 5. Browser right-click integration

Add Chromium context-menu integration through one extension owner. Required commands:

- **Download with Lumi** for links/files.
- **Download media with Lumi** when the page/media context is applicable.
- **Grab links with Lumi** for the current page.

The commands reuse existing capture/LinkGrabber/Runtime flows; they do not create parallel download engines. The extension requests only the minimum additional permission needed for context menus.

## 6. Renew / Repair Download Link

The existing backend path (`repair-wait`, browser repair capture, request envelope replacement) becomes a first-class user flow named **Renew download link**.

Behavior:

- Appears prominently on tasks that fail with `request_refresh_required` and may also be manually invoked on paused/failed browser-origin tasks. The action is visible from the task row/context actions and inspector/warning surface; it is not diagnostics-only.
- Keeps the same task ID, downloaded bytes, partial file, resume journal, destination and queue choice.
- Puts Lumi into a bounded wait state for the replacement browser request.
- User repeats the source-site download action; the extension recognizes the pending repair and supplies the fresh request envelope to the existing task.
- Runtime validates size/ETag/range identity where evidence exists.
- A mismatch fails safely rather than appending wrong bytes.
- POST/generated URLs use the existing replay validation rules.

Acceptance uses a synthetic Range-capable large-file server that intentionally disconnects and later returns 401/403/410. No multi-GB public download is required to prove recovery.

## 7. Media grab quality and size truth

Keep the current resolver/browser-discovery composition, but make the visible result truthful.

For each variant, display:

- quality/resolution/FPS where known;
- container/codec where known;
- audio-only/video-only/merge requirement where applicable;
- exact size when published;
- estimated size when the resolver provides an estimate, labelled as estimated;
- `Size unavailable` only when the source genuinely exposes no reliable size evidence.

Size evidence may come from resolver metadata, manifest metadata, Content-Length, or bounded HEAD/Range probing that does not download the asset.

Actual Brave user-profile acceptance must include YouTube, Dailymotion and Bilibili. MovieBox-type pages are tested only for ordinary exposed downloadable resources; protected/DRM content remains unavailable.

## 8. Extension surface cleanup and Shield

Remove the entire extension card:

`One Lumi application — This extension is a local Lumi surface...`

The popup keeps only user-relevant controls: Runtime state, browser-download capture, Lumi Shield, Quick Test, and Start/Open Lumi.

Lumi Shield remains deliberately light:

- curated nuisance request domains;
- unsolicited nuisance popup blocking;
- user-initiated popup grace window;
- per-site disable;
- no broad cosmetic/block-everything policy that breaks sites.

Quick Test uses one card: animated running state (`Testing internet speed…`) followed by the result in the same card. No provider/backend implementation wording is shown.

## 9. Widget and manager lifecycle: one owner

Window visibility must have one authoritative owner. Older `manager visible => widget hidden` logic must not override browser-pending/completion rules.

Rules:

- Normally the manager and widget are mutually exclusive.
- **New browser download confirmation is an explicit exception:** the expanded widget appears even if the manager is visible.
- Completion expansion may likewise appear according to the already approved completion behavior.
- When the pending/completion surface is dismissed/resolved, normal exclusivity resumes.
- Closing/minimizing manager hands off to compact widget.
- Background inactivity timeout remains user-configurable: Off, 30s, 45s, 1m, 2m, 5m; default 45s.
- File/folder choosers suspend inactivity timing.
- Linux tray double-click is detected from two rapid clicks and opens/restores the manager; one click shows widget after the double-click grace delay.

Widget visual rules:

- Long filenames scroll/marquee inside a fixed-width region; widget width never grows because of filename length.
- Typography is increased to readable levels.
- Recovery geometry supersedes the older tiny-widget baseline: Small **270×74**, Normal **300×82**, Large **360×98**, Expanded **420×360** before platform clamping.
- Expand/close controls sit fully inside their intended surface/background.
- Manager and widget native/CSS shadows are trimmed so no unintended halo remains.
- Folder actions use the approved folder-outline icon.

## 10. Main-app typography and card standard

The application-wide copy standard is the visible pattern: **readable semi-bold/bold title + readable supporting sentence**. It applies to Help Center, updates, Settings descriptions, empty states, firmware guidance, diagnostics/support cards, and similar secondary surfaces.

Tiny 6–9px descriptive copy is prohibited in primary 920×560 desktop views. Supporting copy should generally render at 10–12px or higher depending on context and selected font-size setting. Existing global font-size settings remain authoritative.

Delete/remove/import/save confirmations use Lumi glass cards, not browser-native `confirm()`/`prompt()` where the application already has an owned surface. Explicit **Select all / Deselect all** remains visible for download selection, and file-location actions keep the approved folder-outline icon.

The main-app Quick Test uses the same single-card interaction model as the extension: centered card, visible animated running state, then the result replaces the running state in that same card.

## 11. Download Speed panel

`Download Speed` becomes a functional telemetry panel owned by real sampled data.

- Headline: current aggregate Lumi download throughput.
- Supporting metrics: current download, upload and latency where available.
- History selector: **Last minute / Last 5 minutes / This session**.
- The chart/bars change with the selected range.
- `This session` means the current Lumi process/session, not fabricated historical traffic.
- Capacity from Quick Test remains distinct from live transfer throughput.
- Idle state remains `0 B/s` rather than pretending capacity is active traffic.

The netstats sampler/runtime provides bounded recent samples and session aggregation; UI only renders supplied telemetry.

## 12. Firmware catalogue consolidation

There must be one live firmware UI owner. The current duplicate generations are consolidated rather than layered. The dependency-order behavior currently present in `static/roadmap-corrections.js` is incorporated into the live authority and the obsolete control generation is removed/retired.

Dependency order:

**Platform → Brand → Model → Source → Channel/qualifiers → Results**

Model selection requirements:

- Searchable and scrollable.
- Shows friendly name plus model/model number/codename where known.
- Must make common devices practical to locate, including examples such as Pixel 6, Galaxy S20 and Mate 9 when present in the identity catalogue.
- Broad identity sources are allowed for identity only; identity is never automatically firmware evidence.

Result actions:

- **Download** only for direct verified/resolvable artifacts.
- **Open source** for evidence/research-only providers.
- Never show a dead Download action for source-only rows.

Provider truth stays as approved:

- Apple: IPSW/OTA direct indexed artifacts.
- Google Pixel: official factory/OTA sources.
- Samsung: native FUS exact model + CSC resolver.
- Xiaomi/Redmi/POCO: digest-backed Xiaomi Firmware Updater community artifacts.
- LineageOS: current direct build artifacts with SHA-256.
- GrapheneOS: supported Pixel release sources.
- Other OEM/community sources: clearly labelled source/research rows unless Lumi has verified direct artifacts.

## 13. Operating Systems workspace

Operating Systems remains separate from Mobile Firmware. Acceptance must prove visible/searchable/downloadable paths for supported Windows, Ubuntu, Debian, Fedora, Kali and macOS sources according to current provider truth. Missing direct media must produce a truthful source/torrent path rather than a dead Download button.

## 14. Testing and proof

### Browser / extension
- Real Brave fixed extension ID and user profile.
- Finalized SamFW/IPSW-style filenames.
- Right-click menu commands.
- Renew-link same-task recovery after synthetic disconnect/403/410.
- YouTube/Dailymotion/Bilibili variant and size presentation.
- Shield nuisance request + popup behavior.
- Quick Test visible running → result transition.
- `One Lumi application` card absent.

### Main manager / widget
- Exact 920×560 manager.
- Long filename scrolling at compact/expanded widget sizes.
- New browser capture expands widget while manager remains visible.
- Resolution restores normal manager/widget exclusivity.
- Completion surface behavior preserved.
- Physical tray double-click on KRATOS.
- Configurable inactivity timeout and Off behavior.
- No unintended edge halo.
- Lumi background visible; old TECHGUY background absent.

### Speed telemetry
- Real live current speed from active task.
- History selector changes sample range.
- Session aggregation resets with process/session.
- Quick Test capacity remains separate.

### Firmware / OS
- Search/model interaction physically works at 920×560.
- Pixel 6, Galaxy S20, Mate 9 identity lookup where source catalogues supply them.
- Apple direct IPSW result.
- Pixel official direct result.
- Samsung FUS resolver result.
- Honest source-only rows for unsupported direct OEM cases.
- Windows/Linux/macOS OS catalogue paths.

### Reliability
- Synthetic large Range transfer interruption → resume.
- Expired URL → Renew download link → same task resumes from partial bytes.
- Identity mismatch is rejected.

## 15. Freeze criteria

Do not freeze/push to ATHENA until:

1. Focused regressions are green.
2. Full Python/Node/Playwright suites required by the repository run cleanly or any stale test is explicitly reconciled with current approved authority.
3. Real Brave user-profile smoke is green.
4. Real Electron lifecycle/firmware/OS proofs are green.
5. Source and bundled Chromium extension copies are byte-equivalent for owned files.
6. Temporary proof files, `_metadata`, caches and runtime artifacts are absent from source.
7. `git diff --check` is clean.
8. Final diff is reviewed for unrelated drift.
9. One KRATOS commit/SHA is frozen, then ATHENA receives that exact SHA and is re-proven before publication.
