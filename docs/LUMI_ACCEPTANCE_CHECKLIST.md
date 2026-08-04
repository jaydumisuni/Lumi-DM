# Lumi DM canonical acceptance checklist

Status: active release gate

This checklist is the authority for Lumi DM implementation, proof, Builder handoff and owner acceptance. A source marker, passing compile, browser preview or development Electron launch does not prove a packaged application requirement.

## 1. Identity

- [ ] One approved source image exists at `Resouces/download manager logo.png`.
- [ ] `scripts/generate_lumi_icon_family.py` uses only that source image.
- [ ] Windows ICO, macOS ICNS, Linux PNG, Electron runtime, tray, taskbar, widget, notification, browser-extension and web favicon assets are generated from that source.
- [ ] The icon-family report records the source SHA-256 and generated SHA-256 values.
- [ ] A regression fails if another application-identity source is referenced.
- [ ] Owner visually approves the generated identity at 16, 24, 32, 48, 128, 256 and 512 pixels.

## 2. Browser extension

- [ ] `browser-extension/` is the only committed Chromium extension implementation.
- [ ] The packaged application prepares that exact directory; no second extension exists under `static/` or another path.
- [ ] The same-PC extension authenticates automatically against loopback Lumi and never asks for a pairing code.
- [ ] Pairing codes remain available only for external devices or another Lumi instance.
- [ ] Ordinary browser downloads pause only after Lumi persists a handoff.
- [ ] Browser ownership resumes automatically if Lumi becomes unavailable.
- [ ] Browser download data is erased only after Lumi accepts ownership or the user cancels.
- [ ] Force-next, bypass-next, host rules, context menus, link grabbing, authenticated-request repair, magnet/torrent capture and request-envelope capture remain functional.
- [ ] The media picker lists combined video/audio, video-only, audio-only and subtitle choices distinctly.
- [ ] Each format row shows quality, container, codecs, FPS/HDR where known and exact/estimated size where known.
- [ ] Selecting a format passes the exact `format_id` and media options into the Lumi handoff instead of silently using the largest/default format.
- [ ] Best available remains an explicit option, not a forced hidden choice.
- [ ] The extension icon, page badge and popup use the canonical generated Lumi identity.

## 3. Main application authority

- [ ] Lumi's persisted task store is the single source of truth for the main UI, widget and extension.
- [ ] The extension and widget never act as independent download managers.
- [ ] New-download, browser-capture and widget actions create or control the same Lumi task records.
- [ ] Duplicate-file choices appear only after a real destination collision.
- [ ] Remove-from-list and delete-downloaded-file actions are separate and proven.
- [ ] Default HTTP connections are 32 through one authoritative persistence path.
- [ ] Live speed uses only active Lumi download throughput.
- [ ] Capacity speed test is separate, rejects NaN/invalid results and distinguishes failure from 0 Mbps.

## 4. Approved UI

- [ ] The exact approved renderer files are readable source and contain no opaque payload bootstrap.
- [ ] Sidebar order and Technician submenu match the owner-approved design.
- [ ] Every approved tab, gear action, Lumi control, popup and settings surface is present.
- [ ] Every visible control performs a real action or is explicitly labelled unavailable.
- [ ] Dark glass and light glass states preserve the same functions.
- [ ] Visual evidence is captured at the approved viewport for every canonical state.
- [ ] Owner approves the exact commit represented by the captures.

## 5. Packaged Windows proof

- [ ] Builder starts from a clean workspace pinned to the exact reviewed SHA.
- [ ] Builder packages the literal approved renderer, canonical extension and generated icon family.
- [ ] Actual unpacked or installed EXE runs with `app.isPackaged === true`.
- [ ] The packaged `LUMIDM-server.exe` sidecar starts and serves the renderer.
- [ ] The packaged app prepares and runs the exact canonical extension.
- [ ] EXE, installer, taskbar, tray, window, widget, notification and extension icons are visually inspected.
- [ ] Closing the main window leaves only the tray process.
- [ ] Login startup is tray-only.
- [ ] Widget is hidden unless explicitly opened and never creates an independent taskbar entry.
- [ ] Public-internet download, 1-versus-32 connection proof, pause/resume, SHA-256, settings restart, extension takeover/fallback and media-format selection pass.
- [ ] Registered uninstall works.

## 6. Review and release

- [ ] Sergeant runs before CodeRabbit on the exact final head.
- [ ] Every valid finding becomes a permanent regression before correction is accepted.
- [ ] All required workflows are green on the same exact head.
- [ ] All review threads are resolved with evidence.
- [ ] Builder issue is updated with the final exact SHA only after source proof is green.
- [ ] Owner accepts the packaged verification candidate.
- [ ] Merge, signing and publication happen only after explicit owner authorization.
