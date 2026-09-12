# Lumi DM — Approved Current Product Contract

**Status: APPROVED CURRENT**
**Owner: THETECHGUY DIGITAL SOLUTIONS**
**Repository: `jaydumisuni/Lumi-DM`**

## 1. Authority

This file is the **single product authority for Lumi DM**.

For any implementation, review, feature addition, bug fix, UI change, Builder packaging change, test update, or AI handoff:

1. Read this file first.
2. Recover evidence from the current repository before reasoning.
3. Treat current source + tests as implementation evidence.
4. If source/tests conflict with this file, the implementation is wrong unless the owner explicitly approved a newer product decision.
5. Update this file in the same change whenever an owner-approved product decision changes.

No other Markdown file, branch note, pickup note, screenshot note, old chat, old commit, generated manifest, machine JSON, test name, or CI document may override this contract.

Historical states belong in Git history, not as competing current-state documents in the working tree.

## 2. Product boundary

Lumi DM is the THETECHGUY DIGITAL SOLUTIONS multi-source **download manager**.

It is not THETECHGUY Software Builder. Builder owns packaging/build/release mechanics; Lumi owns the download-manager product experience and runtime behavior.

Do not add Builder UI concepts such as project health, build targets, installer creation, signing controls, Builder dependency controls, project storage, or release-management dashboards to the Lumi application.

## 3. Approved desktop shell

The desktop manager uses the custom frameless THETECHGUY shell.

- Default manager geometry: **920 × 560 px**.
- Frameless Electron window; no platform-default title bar.
- The outer window owns the thin cyan/blue/violet perimeter treatment.
- Title-bar left side uses the Lumi app icon/name identity; the right-side order is notification bell, settings gear, separator, minimize, maximize/restore, close.
- Empty title-bar space is draggable; controls/menus/inputs are no-drag regions.
- Close hands off to the widget when Lumi remains resident rather than creating duplicate Lumi instances.
- Settings has one ordinary entry point through the gear.
- Advanced diagnostics is hidden from normal navigation and is reached through **Gear → Advanced diagnostics**.

The machine-readable shell file at `assets/ttg-app-shell-standard.json` is a derived implementation contract for Builder/tests. It must match this section and cannot override it.

## 4. Approved visual system

Lumi uses the owner-approved glass UI already present in the repository.

- Use the exact repository Lumi identity assets; never redraw or substitute the logo.
- Application background: the supplied THETECHGUY circuit-board artwork at `static/lumi-background.png`.
- Dark mode: smoked black/navy glass with visible purple/blue/cyan light depth.
- Light mode: frosted clear glass using the same structural language, not a separate flat-white design.
- Glass surfaces use controlled transparency, blur, thin luminous edges and restrained reflections; do not revert to opaque navy slabs or raw desktop transparency.
- Text and controls must remain readable in both modes. Functional copy must render crisp; global text shadows/glows must not be applied to ordinary UI words.
- Font/text-size control remains available for accessibility.
- The approved layout/functions must not be moved merely to restyle the glass.
- Main-app download progress uses **horizontal progress bars**.
- Widget download progress uses **circular progress rings** only.

## 5. Approved main navigation

Top-level navigation:

- Overview
- All Downloads
- Unfinished
- Finished
- Queues
- Categories
- LinkGrabber
- Technician

The **Technician** group is collapsible and contains **only** these two technician workspaces, in this order:

1. Mobile Firmware
2. Operating Systems

Queues, Categories, and LinkGrabber are general download-management tools and remain top-level. They must not be moved into Technician.

Settings and Diagnostics are not normal sidebar destinations.

`STORAGE LEFT` stays at the bottom of the sidebar and shows download-relevant capacity. It must not create a full-width footer.

## 6. Approved Overview

The Overview remains the download-manager dashboard.

Top summary cards:

- Total Downloads
- Downloading
- Completed
- Queued

Each summary card may show its status icon, count, short supporting label and restrained activity sparkline.

The Download Speed panel owns current/session speed information, recent speed history, download speed, upload speed and latency.

The Downloads by Status summary may use a donut/pie visualization for Completed, Downloading, Queued and Failed. Per-download rows in the main manager still use horizontal progress bars.

Recent Downloads shows the correct file/platform identity, filename, speed, downloaded/total size, percentage and pause/resume action.

Approved quick actions:

- New Download
- Add Link
- Open Folder
- Settings
- Manage Queues
- Clear Completed

`Clear Completed` must not be rewritten to `Categories`.

Do not add Builder information, diagnostics dashboards, project status/storage, release controls, widget layouts or a full-width version/footer strip to Overview.

## 7. Download engine and task model

Lumi uses one canonical persisted task model across UI, browser capture, widget, OS catalogue, firmware catalogue and delegated engines.

Approved engine behavior includes:

- HTTP/HTTPS and FTP download paths.
- Up to **32 connections** where the server/protocol supports segmented transfer.
- Exact-file completion checks and safe resume journals.
- Pause/resume/restart recovery.
- Queue priority and queue scheduling.
- Category routing and destination rules.
- Duplicate handling.
- Media/video delegated downloads.
- Torrent delegated downloads.
- LinkGrabber/browser capture.
- Secure replay of sensitive request headers through the encrypted local vault.
- Optional provider/backend failure must not make unrelated Lumi functions unusable.

A user-visible success state must represent the actual canonical Runtime task, not a duplicate UI-only record.

## 8. Browser extension and handoff

The Chromium/Brave extension is part of the approved Lumi workflow.

- Same-PC pairing/identity is automatic through Lumi's local trust path.
- Persistent bridge uses the local Lumi Runtime WebSocket path.
- Browser media discovery preserves exact variant/resource identity and deduplicates by actual resource URL.
- Capturing a download hands the canonical task to the existing widget; it does not open a third confirmation window.
- Extension/browser failure falls back safely without breaking direct Lumi downloads.

## 9. Floating widget

The widget is the only compact native companion surface.

Base dimensions before user scale:

- Compact: **240 × 66 px**.
- Expanded: **360 × 320 px**.

Approved states:

- idle connection monitor;
- new-download confirmation;
- compact active download;
- expanded Downloading / Downloaded / Queued lists;
- paused state;
- completed state.

New-download confirmation stays inside the existing widget and provides, where known/applicable:

- detected filename and editable filename;
- type/expected size/source;
- destination folder and Browse;
- storage/category/duplicate information;
- Download now;
- Download later / queue;
- Cancel.

Widget rules:

- Never create a third confirmation BrowserWindow.
- Capture must not force the full manager open.
- Active ring contains Pause or Play; percentage is separate beside the ring.
- Completed ring is full with the green checkmark and no `100%` text.
- Completed-ring action opens the file location.
- Long filenames scroll inside a fixed-width area; widget width does not grow.
- Multiple active downloads can be cycled in compact mode.
- The widget must respect the selected screen corner and Windows taskbar/system UI.
- The widget never owns a taskbar button; only the visible full Lumi manager may appear in the taskbar.

## 10. Operating Systems workspace

Operating Systems lives under Technician and uses the canonical Lumi task flow.

Families:

- Windows
- macOS
- Linux

Requirements:

- searchable/filterable results;
- version/build, edition, architecture, channel, size and source evidence;
- direct Download action when a valid artifact is available;
- no fabricated URLs;
- published checksums are automatically enforced after transfer when available.

Current provider behavior includes:

- Windows official retail-link resolution through the Builder/source-supported Fido path on Windows.
- macOS current/archive installer resolution with version/build bound to the same source row; seed builds remain pre-release.
- Ubuntu/Debian/Fedora direct official images where available.
- Kali direct images where published; Kali Live may legitimately stage the official torrent through Lumi's torrent engine when no direct Live ISO is published.

## 11. Mobile Firmware workspace

Mobile Firmware lives under Technician. Device identity breadth and firmware evidence are separate concepts.

Device identity may come from broad catalogues such as Google Play certified devices and LineageOS device metadata. Identity data alone must never be presented as verified firmware.

Approved firmware evidence classes:

- Apple: IPSW/OTA indexes with signing/source evidence.
- Google Pixel: Google factory/OTA sources.
- LineageOS: only direct HTTPS build artifacts with published SHA-256 from the current Lineage build API.
- GrapheneOS: official Pixel release sources.
- Samsung: native packaged-safe Samsung FUS interoperability; exact `SM-...` model and exact 3-character CSC required; Lumi owns resumable transfer and decrypt post-processing; sensitive FUS auth/decrypt material remains vaulted/redacted.
- Xiaomi/Redmi/POCO: Xiaomi Firmware Updater is explicitly a **community** index; a direct row is considered verified only when the exact GitHub release asset carries a valid SHA-256 digest.
- Other OEM/community sources may be offered as clearly labeled research/source links when Lumi does not have a verified direct artifact.

Never label community material as official. Never create fake direct URLs. When a published SHA-256 is present, Lumi must verify the completed file and fail the task on mismatch.

## 12. Settings, notifications and diagnostics

Approved settings include:

- download/default-folder behavior;
- connection count/control where implemented;
- completion notifications toggle;
- appearance: System / Dark / Light glass;
- text/font size;
- browser-extension management/status;
- widget corner, margin, scale, visibility and related widget preferences;
- update check controls.

The notification bell shows actionable pending/completed/warning/update items and routes to the relevant record/view.

Advanced diagnostics remains available through the gear and may expose bounded runtime health, sanitized logs, database backup and repair, missing-file detection, extension/authentication status and support evidence. It is not an everyday sidebar page.

## 13. Packaging, updates and release ownership

This repository contains Lumi application source plus Builder/release contracts. **THETECHGUY Software Builder owns packaging.**

Builder owns:

- dependency preparation;
- Python sidecar build;
- Electron packaging;
- Windows/Linux/mobile package generation as supported;
- THETECHGUY installer generation;
- signing;
- SHA-256 release evidence;
- GitHub Release publishing.

Lumi's in-app updater consumes published GitHub Releases. It does not treat ordinary Git branch commits as installed-app updates.

The repository must not commit Builder caches, generated dependency environments, signing keys, release credentials, runtime databases, screenshot/proof noise, or local review artifacts.

## 14. Current approved implementation state

The current repository line includes and has regression coverage for:

- approved 920×560 manager/glass shell;
- Dark and Light glass modes plus font-size control;
- manager/widget two-surface lifecycle;
- widget confirmation and browser handoff;
- 32-way HTTP engine and pause/resume/recovery behavior;
- queues, categories and LinkGrabber;
- browser extension media/capture bridge;
- OS catalogue/staging paths;
- broad firmware identity and verified-provider paths;
- Samsung native FUS protected staging/decrypt architecture;
- Xiaomi digest-backed community firmware path;
- automatic published SHA-256 enforcement;
- Builder-owned release contract and GitHub release publisher contract;
- diagnostics/security/maintenance paths.

External providers can be temporarily unreachable or rate-limited. That is a provider/network condition, not permission to fabricate results or weaken provenance checks.

## 15. Change rule for future work

When adding or changing a feature:

1. Start from current repository HEAD, not an old branch/pickup note.
2. Read this file.
3. Recover the owning code and tests before designing the change.
4. Preserve unrelated approved behavior.
5. Add/update tests for the changed contract.
6. If the owner changes product behavior, update this file in the same commit.
7. Do not create a new `PICKUP`, `FINAL`, `LOCKED`, `FREEZE`, `BASELINE`, or competing source-of-truth document.
8. Put temporary proof outside tracked product documentation or in ignored artifacts.
9. Use Git history for historical state.

The THETECHGUY engineering cycle may still use the step name **freeze** internally. That workflow term is not a Lumi product version, document status, or competing baseline.
