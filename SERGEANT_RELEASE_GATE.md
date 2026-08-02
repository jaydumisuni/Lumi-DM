# Lumi Sergeant 20-for-2 release gate

This branch is not eligible for merge until all twenty lanes pass two independent review passes. The workflow publishes the exact required aggregate check name **Sergeant 20-for-2**.

## Review order and learning rule

Sergeant is the primary reviewer and must always run first.

1. Run the complete **Sergeant 20-for-2** gate on the exact candidate head.
2. Correct every Sergeant failure and rerun until the aggregate check is green.
3. Only then request CodeRabbit on that same green head.
4. Validate every CodeRabbit finding against the source and evidence.
5. Convert every valid new finding into a permanent Sergeant assertion, regression test, or documented lane before resolving it.
6. Rerun Sergeant after any corrective commit, then request CodeRabbit again on the new final head.

CodeRabbit is therefore a secondary external reviewer and a source of new regression knowledge. Sergeant remains the release authority and accumulates valid findings so external-review dependence can reduce over time without reducing proof quality.

## Twenty lanes

1. Approved readable shell and frozen glass theme.
2. Locked sidebar order with no extra functions.
3. Overview data and quick actions.
4. All Downloads, Unfinished and Finished task actions.
5. Queues and persisted queue rules.
6. Categories.
7. LinkGrabber validation and batch handoff.
8. Mobile Firmware and Operating Systems catalogue handoff.
9. Settings persistence across a real application restart.
10. Speed-test success, failure and invalid-number behavior.
11. Chrome and Edge extension package preparation.
12. One-time pairing and client-side expiry.
13. Authenticated browser capture, Lumi takeover and browser fallback.
14. Readable Electron main process with no payload bootstrap.
15. Tray-only startup, close-to-tray and widget isolation.
16. Canonical Lumi icon for main window, tray and widget.
17. Contained path opening and executable deny-list.
18. One authoritative 32-connection persistence path.
19. SHA-256 integrity plus pause/resume recovery.
20. Genuine Windows public-internet download through Lumi.

## Two independent passes

### Pass A — code and functional proof

- JavaScript syntax and IPC contract checks.
- Real Flask API settings persistence and restart/reopen proof.
- Real deterministic HTTP range download through Lumi's production engine.
- One connection versus 32 connections under controlled per-connection throttling.
- SHA-256 equality after single, segmented, extension-captured and resumed transfers.
- Chrome/Edge package preparation, pairing, takeover and safe browser fallback.
- Speed-test success, timeout/error and invalid-number paths.

### Pass B — visual, security and lifecycle proof

- Render all fifteen approved screens at 1672 × 941.
- Compare each capture against a 256-bit perceptual hash recovered from the owner-approved mockup.
- Enforce per-screen and aggregate visual-distance ceilings.
- Confirm no extra sidebar items or altered approved renderer source.
- Confirm taskbar appears only for the full app.
- Confirm close and Windows login startup remain tray-only.
- Confirm the widget is optional, guarded and never a taskbar application.
- Confirm the canonical Lumi logo is used for the app, tray and widget.
- Confirm runtime sources are readable and contain no committed payload transport.

## Required aggregate check

`.github/workflows/lumi-release-gate.yml` publishes **Sergeant 20-for-2** only after these independent jobs complete successfully:

- UI and Electron contract
- approved fifteen-screen visual contract
- Windows lifecycle contract
- real download-engine contract
- Windows public-internet smoke test

The aggregate job runs `tests/sergeant-20-for-2.test.js`, which executes twenty named assertions in Pass A and the same twenty-lane release boundary through an independent Pass B, for forty required assertions.

## Merge rule

Merge and Builder packaging are blocked until:

1. **Sergeant 20-for-2** is green on the final head;
2. **Readable Lumi source guard** is green on the final head;
3. CodeRabbit has reviewed that same Sergeant-green final head with no unresolved findings;
4. every valid CodeRabbit finding has been absorbed into Sergeant evidence;
5. all inline review threads are resolved.
