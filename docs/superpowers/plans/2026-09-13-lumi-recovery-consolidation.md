# Lumi Recovery Consolidation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore Lumi as one coherent, reliable download manager across Brave capture, large-file recovery, widget/manager lifecycle, speed telemetry, firmware/OS catalogues, and the approved Lumi visual system.

**Architecture:** Preserve the canonical Runtime, task identity, resume journals, 32-connection HTTP policy, local-trust extension identity, and existing firmware providers. Consolidate duplicate UI/window owners instead of adding another layer, surface existing recovery capabilities, and prove every browser/native boundary in real Brave/Electron.

**Tech Stack:** Python/Flask, Electron, vanilla JavaScript/CSS, Chromium/Brave MV3, Playwright, pytest, Node.js.

**Spec:** `docs/superpowers/specs/2026-09-13-lumi-recovery-consolidation-design.md`

## Global Constraints

- Restore `static/lumi-background.png`; keep obsolete `static/background.png` removed.
- No Runtime rewrite or new download engine.
- No third browser-download confirmation BrowserWindow.
- Normal downloads remain normal; queues are optional.
- Renew Link preserves task ID, partial bytes, destination and resume journal.
- Media quality/size labels use real evidence only.
- Shield stays curated/non-aggressive with the 1.5s user-activation grace window.
- No fabricated firmware links or false official labels.
- Widget geometry: Small 270x74, Normal 300x82, Large 360x98, Expanded 420x360.
- Inactivity handoff: Off, 30s, 45s, 1m, 2m, 5m; default 45s.
- Freeze one KRATOS SHA, then move that exact SHA to ATHENA.

## Ownership Map

- `browser-extension/background.js` + bundled mirror: browser capture, context menus, Shield, repair handoff.
- `browser-extension/capture-utils.js`: finalized filename selection.
- `browser-extension/content-v2.js`: media quality/size presentation.
- `browser-extension/popup.*`: Runtime/Shield/Quick Test/Start/Open surface.
- `core/v2/wave2_repair.py`, `http_replay.py`, `http_transfer.py`: same-task recovery.
- `electron/window-contract.js`, `main.js`, `roadmap-surfaces.js`, `widget.html`: native two-surface lifecycle.
- `core/v4/speed_history.py`, `core/v2/server_app.py`, `static/main-ui-views.js`: speed history.
- `static/technician-workspaces.js`, `core/v5/firmware.py`: firmware authority.
- `static/operating-systems.js`, `core/v5/os_catalog.py`: OS authority.

---

### Task 1: Restore approved Lumi background authority

**Files:** restore `static/lumi-background.png`; keep `static/background.png` deleted; modify `static/lumi-glass-material.css`, `static/technician-workspaces.css`, `static/lumi-approved-ui.css`, `static/sw.js`; create `tests/test_lumi_background_authority.py`.

**Produces:** only `/static/lumi-background.png` is live.

- [ ] Write RED test:
```python
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
def test_background_authority():
    assert (ROOT/'static/lumi-background.png').is_file()
    assert not (ROOT/'static/background.png').exists()
    css='
'.join(p.read_text(errors='ignore') for p in (ROOT/'static').glob('*.css'))
    assert '/static/background.png' not in css
    assert '/static/lumi-background.png' in css
    assert "'/static/lumi-background.png'" in (ROOT/'static/sw.js').read_text()
```
- [ ] Run `python -m pytest -q tests/test_lumi_background_authority.py`; expect RED.
- [ ] Restore with `git show 90d6049^:static/lumi-background.png > static/lumi-background.png` if that commit ancestry contains the asset, otherwise use the nearest prior committed blob `8256b66748ee05676929d0cb41d218c25f621754` through Git object recovery. Remove only `/static/background.png` references; restore Lumi background references and service-worker cache entry.
- [ ] Run background + readability tests; expect PASS.
- [ ] Commit `fix: restore approved Lumi background authority`.

---

### Task 2: Finalize browser filenames before staging

**Files:** `browser-extension/capture-utils.js`, `browser-extension/background.js`, bundled mirrors, `tests/capture_utils_contract.js`, `tests/playwright_brave_current_acceptance.js`.

**Produces:** `settleDownloadItem(item, timeoutMs=1200)` and `bestDownloadFilename(item)`; same browser download ID maps to one Runtime task.

- [ ] Add RED test for UUID/generic name losing to final URL:
```js
assert.strictEqual(utils.bestDownloadFilename({filename:'0d5e11ee-4cff-4f31-903d-d57467451e57',url:'https://samfw.com/files/SAMFW.COM_SM-F731N_KOO_F731NTBS6GZH5_faq.zip'}),'SAMFW.COM_SM-F731N_KOO_F731NTBS6GZH5_faq.zip');
```
- [ ] Add Brave fixture where `downloads.onCreated` sees a temporary name and `downloads.search` later exposes the final human filename; verify current code stages too early.
- [ ] Implement bounded settling:
```js
async function settleDownloadItem(item, timeoutMs=1200){
  const started=Date.now(); let current=item;
  while(Date.now()-started<timeoutMs){
    const name=LumiCaptureUtils.bestDownloadFilename(current);
    if(name&&/\.[A-Za-z0-9]{1,12}$/.test(name)) return {...current,filename:name};
    await sleep(100);
    const rows=await downloadCall('search',{id:item.id}).catch(()=>[]);
    if(rows[0]) current=rows[0];
  }
  return {...current,filename:LumiCaptureUtils.bestDownloadFilename(current)||current.filename||'Browser download'};
}
```
- [ ] Use it before `stageCapture`; an `onChanged` filename update may improve the already-pending task but must never create a second task.
- [ ] Run real Brave IPSW/SamFW filename acceptance; exact browser and Runtime names must match.
- [ ] Mirror owned extension files byte-for-byte and commit `fix: preserve finalized browser download filenames`.

---

### Task 3: Add browser right-click Lumi actions

**Files:** extension manifest/background + mirrors; create `tests/test_extension_context_menu_contract.py`, `tests/playwright_brave_context_menu_contract.js`.

**Produces menu IDs:** `lumi-download-link`, `lumi-download-media`, `lumi-grab-page`.

- [ ] RED test asserts `contextMenus` permission, all three IDs, and `chrome.contextMenus.onClicked.addListener`.
- [ ] Add manifest permission and idempotent installer:
```js
function installContextMenus(){
 chrome.contextMenus.removeAll(()=>{
  chrome.contextMenus.create({id:'lumi-download-link',title:'Download with Lumi',contexts:['link']});
  chrome.contextMenus.create({id:'lumi-download-media',title:'Download media with Lumi',contexts:['video','audio']});
  chrome.contextMenus.create({id:'lumi-grab-page',title:'Grab links with Lumi',contexts:['page']});
 });
}
```
- [ ] Link uses existing capture flow on `info.linkUrl`; media uses `info.srcUrl`/content media candidates; page action hands URL to existing LinkGrabber/open-main flow.
- [ ] Real Brave proof verifies all menu registrations and handler outcomes without large external downloads.
- [ ] Mirror and commit `feat: add Lumi browser context menu actions`.

---

### Task 4: Surface Renew download link and bind fresh browser requests

**Files:** extension background + mirror; `static/app.js`, `static/main-ui-views.js`; only if proof requires, `core/v2/wave2_repair.py`, `core/v2/http_replay.py`; create `tests/test_renew_download_link_contract.py`, `tests/playwright_renew_download_link.js`.

**Existing interfaces:** `POST /api/downloads/<id>/repair-wait`, `GET /api/browser/repair-pending`, `POST /api/browser/repair-capture`.

- [ ] RED contract asserts visible copy `Renew download link` and extension calls both repair-pending and repair-capture endpoints.
- [ ] Rename user-facing `Repair Download Link` to `Renew download link`; surface it prominently for `request_refresh_required` and eligible paused/failed browser-origin tasks.
- [ ] Before normal staging, extension checks repair-pending and, for the matching user retry action, submits the fresh request envelope to repair-capture.
```js
async function tryRepairPending(payload){
 const token=await ensureToken();
 const state=await rawRequest('/api/browser/repair-pending',{},token).catch(()=>({pending:null}));
 if(!state.pending) return null;
 return rawRequest('/api/browser/repair-capture',{method:'POST',body:JSON.stringify(payload.request_envelope||payload)},token);
}
```
- [ ] Synthetic Range acceptance: partial transfer -> interruption -> resume -> 403/410 -> repair wait -> fresh signed URL -> same task ID resumes from non-zero offset -> final hash matches. Mismatch must fail safely.
- [ ] Commit `feat: surface same-task download link renewal`.

---

### Task 5: Make media quality and size evidence truthful

**Files:** extension `content-v2.js` + mirror; optionally `core/v7/media_contract.py`; create `tests/test_media_size_contract.py`; extend live media matrix.

- [ ] RED test requires `filesize_approx`, `Estimated`, `Size unavailable`.
- [ ] Implement:
```js
function formatSizeEvidence(item){
 const exact=Number(item.filesize||0); if(exact>0)return {text:formatBytes(exact),exact:true};
 const approx=Number(item.filesize_approx||0); if(approx>0)return {text:`Estimated ${formatBytes(approx)}`,exact:false};
 return {text:'Size unavailable',exact:false};
}
```
- [ ] Never download a media body merely to learn size. Bounded HEAD/Range may be used only when safe and needed.
- [ ] Real Brave user-profile matrix must pass YouTube, Dailymotion and Bilibili with visible quality rows and truthful size labels.
- [ ] Commit `fix: show truthful media quality and size evidence`.

---

### Task 6: Simplify extension popup

**Files:** popup HTML/CSS/JS + mirrors; create `tests/test_extension_popup_copy.py`; run existing popup controls/Quick Test proofs.

- [ ] RED test asserts `One Lumi application` and `Pairing codes remain` are absent, while Shield, Quick Test and Open/Start Lumi remain.
- [ ] Remove architecture explainer card completely.
- [ ] Preserve one-card Quick Test: idle -> animated `Testing internet speed...` -> result in same card; no provider/backend wording.
- [ ] Run live popup controls + real Quick Test.
- [ ] Commit `fix: simplify Lumi extension popup`.

---
### Task 7: Unify manager/widget lifecycle and tray behavior

**Files:** `electron/window-contract.js`, `electron/main.js`, `electron/roadmap-surfaces.js`, `electron/tray-click-controller.js`, `electron/widget.html`; tests `test_window_widget_lifecycle_contract.py`, `tray_widget_helpers.js`, `playwright_lifecycle_readability_acceptance.js`, `playwright_widget_handoff_lifecycle.js`.

**Produces:** one lifecycle policy where reasons such as browser-pending/completion can override normal manager/widget exclusivity.

- [ ] RED contract rejects blind `changeWidget(!mainIsOpen())` ownership and requires pending/completion override.
- [ ] Replace competing visibility handlers with one reason-based policy:
```text
browser-pending or completion -> widget visible even if manager visible
else manager visible -> widget hidden
else widget preference enabled -> widget visible
```
- [ ] Keep inactivity timeout settings/picker suspension intact.
- [ ] Make filename area fixed-width and readable. Apply marquee only when measured text overflows; preserve full filename in title/expanded form.
```css
.filename-viewport{overflow:hidden;min-width:0}.filename-viewport.is-long .filename-text{display:inline-block;white-space:nowrap;animation:lumi-filename-marquee 10s linear infinite alternate}
```
- [ ] Reposition expand/close controls fully inside their visual surface and preserve no-halo shadow contract.
- [ ] Run helper and real Electron lifecycle tests.
- [ ] Physically double-click the visible KRATOS tray icon; prove manager opens/restores and widget does not flash first.
- [ ] Commit `fix: unify Lumi manager widget lifecycle`.

---

### Task 8: Standardize readability and implement real Download Speed history

**Files:** create `core/v4/speed_history.py`; modify `core/v2/server_app.py`, `core/v4/api.py`, `static/main-ui-views.js`, `static/interaction-contract.js`, `static/approved-mockup-ui.js`, relevant approved CSS; tests `test_speed_history.py`, `test_visual_readability_speed_contract.py`, `playwright_speed_history_panel.js`.

**Produces:** `SpeedHistory.record(rx_bps, tx_bps, latency_ms, now=None)` and `SpeedHistory.snapshot(window)` for `minute`, `five_minutes`, `session`.

- [ ] RED pure test:
```python
from core.v4.speed_history import SpeedHistory
def test_windows():
    h=SpeedHistory(max_seconds=1800)
    h.record(100,20,11,now=0);h.record(200,30,12,now=30);h.record(300,40,13,now=90)
    assert [s['rx_bps'] for s in h.snapshot('minute')['samples']]==[200,300]
    assert len(h.snapshot('session')['samples'])==3
```
- [ ] Implement bounded in-memory deque history. Session resets with process restart; do not persist history.
- [ ] Extend `/api/netstats` to return current rx/tx/latency/capacity plus history snapshots. Keep `/api/v4/overview` as active Lumi task-throughput authority.
- [ ] Download Speed selector options are exactly `Last minute`, `Last 5 minutes`, `This session`; graph changes range, headline remains current aggregate Lumi download speed.
- [ ] Keep Quick Test capacity visually distinct from active traffic.
- [ ] Apply global desktop copy standard: readable semibold/bold heading + supporting text generally 10–12px minimum in 920×560 views, respecting font-size setting. Cover Help, update, Settings, empty states, firmware guidance.
- [ ] Main-app Quick Test remains one centered running/result card.
- [ ] Run deterministic speed panel Playwright and readability tests.
- [ ] Commit `feat: add readable live download speed history`.

---

### Task 9: Consolidate firmware UI to one live owner

**Files:** `static/index.html`, `static/technician-workspaces.js`, retire/trim `static/roadmap-corrections.js`, `static/technician-workspaces.css`; modify `core/v5/firmware.py`, `core/v5/api.py` only for proven provider/identity defects; tests `test_firmware_device_catalog_breadth.py`, `test_downloadable_catalog_contract.py`, `test_samsung_ui_contract.py`, create `playwright_firmware_live_owner.js`.

**Produces:** one live flow Platform -> Brand -> Model -> Source -> Channel/qualifiers -> Results.

- [ ] RED owner test proves current correct `lumi-firmware-*` controller is not loaded and obsolete IDs still exist.
- [ ] Consolidate `loadModels`, `updateSources`, `submitFirmware` into the one `technician-workspaces.js` authority loaded by `index.html`; remove competing listener generation rather than loading both.
- [ ] Implement searchable/scrollable model chooser fed by `/api/v5/firmware/devices`, searching `name`, `id`, `model`, `codename`, aliases. Labels include friendly model + model number/codename when available.
- [ ] Do not hardcode fake availability. Acceptance looks for Pixel 6/oriole, Galaxy S20/SM-G980F, Mate 9/MHA variants only when returned by identity sources.
- [ ] Do not filter source-only evidence away. Render `Download` only for direct URL or supported native resolver; render `Open source` for research/evidence rows.
- [ ] Keep Apple IPSW/OTA, Pixel official, Samsung FUS, digest-backed Xiaomi, Lineage SHA-256, Graphene truth rules unchanged.
- [ ] Physical 920×560 acceptance proves model search, selection, scrolling, direct action and source-only action.
- [ ] Commit `fix: consolidate live firmware catalogue workflow`.

---

### Task 10: Prove Operating Systems catalogue actions

**Files:** modify only on proven failure: `static/operating-systems.js`, `core/v5/os_catalog.py`; create `tests/playwright_os_catalog_acceptance.js`.

- [ ] Build acceptance for Windows, Ubuntu, Debian, Fedora, Kali and macOS. Each reachable provider yields a truthful direct/source/torrent action; unreachable providers yield explicit unavailable state, never a dead Download button.
- [ ] Run current OS tests and new acceptance before changing production.
- [ ] Fix only proven defects; preserve Kali torrent fallback and macOS source truth where direct images are not published.
- [ ] Re-run and commit `fix: prove truthful operating system catalogue actions` only if production changed; otherwise commit the acceptance test with the nearest related task or leave it as verification evidence.

---

### Task 11: Full integration gate and KRATOS freeze

**Files:** no planned production changes; clean generated artifacts and verify mirrors.

- [ ] Remove `_metadata`, temporary reload/proof pages, runtime DBs, caches and screenshot noise from product source directories.
- [ ] Browser gates:
```bash
node tests/capture_utils_contract.js
node tests/loaded_playwright_extension_popup_controls.js
node tests/loaded_playwright_extension_popup_guard.js
node tests/loaded_playwright_extension_quicktest_live.js
node tests/playwright_brave_current_acceptance.js
node tests/playwright_brave_live_media_matrix.js
node tests/playwright_brave_context_menu_contract.js
node tests/playwright_renew_download_link.js
```
- [ ] Native gates:
```bash
node tests/tray_widget_helpers.js
node tests/playwright_user_interaction_regression.js
node tests/playwright_lifecycle_readability_acceptance.js
node tests/playwright_widget_handoff_lifecycle.js
node tests/playwright_speed_history_panel.js
node tests/playwright_firmware_live_owner.js
node tests/playwright_os_catalog_acceptance.js
```
- [ ] Python full gate:
```bash
/home/kratos/.cache/lumi-extension-shield-venv-20260912/bin/python -m pytest -q
```
Reconcile only tests that encode explicitly superseded approved authority; never weaken product behavior for stale tests.
- [ ] Compare SHA-256 parity for source/bundled manifest, background, content, popup HTML/CSS/JS, capture-utils, shield rules and icon family.
- [ ] Run `git diff --check`, inspect `git status --short` and final diff; map every spec section to proof evidence.
- [ ] Freeze one reviewed KRATOS implementation commit and record `git rev-parse HEAD` as handoff authority.

---

### Task 12: Move exact frozen SHA to ATHENA and re-prove

**Files:** no implementation by default.

- [ ] Inspect ATHENA repo state first; do not discard unrelated uncommitted work.
- [ ] Fetch/pull and checkout the exact frozen KRATOS SHA. `git rev-parse HEAD` must match exactly.
- [ ] ATHENA smoke: Electron manager/widget, fixed-ID extension, Runtime/Shield/Quick Test popup, one filename-preserving normal capture, one media page with variants, firmware and OS views responsive.
- [ ] Do not edit source on ATHENA during handoff. Any defect returns to KRATOS for a new correction commit and repeats the exact-SHA transfer.
- [ ] Publication starts only after ATHENA proof is green.
