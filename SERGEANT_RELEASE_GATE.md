# Lumi Sergeant 10-for-2 release gate

This branch is not eligible for merge until all ten lanes pass two independent review passes.

## Ten lanes

1. Approved shell, sidebar order, branding and storage widget.
2. Overview data, quick actions and download state summaries.
3. All Downloads, Unfinished and Finished task actions.
4. Queues, categories and persisted queue rules.
5. LinkGrabber validation and batch handoff.
6. Mobile Firmware and Operating Systems catalogue handoff.
7. Settings persistence, speed test, updates, support and about controls.
8. Electron lifecycle, tray-only startup, widget isolation and canonical Lumi identity.
9. Browser extension package, pairing, authenticated capture and safe browser fallback.
10. Real HTTP engine speed, 32-connection default, integrity, pause/resume and recovery.

## Two independent passes

### Pass A — code and functional proof

- JavaScript syntax and IPC contract checks.
- Real Flask API settings persistence.
- Real deterministic HTTP range download through Lumi's production engine.
- One connection versus 32 connections under controlled per-connection throttling.
- SHA-256 equality after single, segmented and resumed transfers.
- Chrome/Edge package preparation and authenticated pairing contract.

### Pass B — visual and lifecycle proof

- Compare all approved screens against the frozen mockups.
- Confirm no new sidebar items, altered functions or detached widget window.
- Confirm taskbar appears only for the full app.
- Confirm close and login startup remain tray-only.
- Confirm the canonical Lumi logo is used for the app, tray and widget.

## Merge rule

Merge and Builder packaging are blocked until GitHub Actions, CodeRabbit and this Sergeant gate are green with no unresolved findings.
