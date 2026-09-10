# Lumi DM — KRATOS Pickup / Continuation

Last updated: 2026-09-10
Authority branch: `fix/issue8-packaged-runtime-child-pid`
Repository: `jaydumisuni/Lumi-DM`
KRATOS worktree used for this pass: `/home/kratos/lumi-athena-sync-20260910`
Base checkpoint before this pass: `93b9c8071a8d6dd941107a9b72b969a0c1ed23c1`

## Continuation rule

Do **not** restart the Lumi work or reconstruct the UI from old branches. Continue from the current head of `fix/issue8-packaged-runtime-child-pid`. ATHENA and KRATOS are intended to converge through GitHub: work/push on KRATOS, then ATHENA pulls the same branch.

The release/update pipeline is deliberately deferred until the product gaps below are closed. Lumi's in-app updater consumes GitHub Releases; it does not pull branch commits.

## What this KRATOS pass completed/proved

### Existing widget confirmation — implemented in the same widget

- No third confirmation BrowserWindow.
- Existing widget remains the native surface.
- Compact `240x66` -> expanded `360x320` -> compact lifecycle physically proven.
- Pending browser-capture task remains the same canonical Runtime task.
- Editable filename and destination are persisted.
- `Download later` confirms the task paused.
- `Cancel` releases/removes the pending Runtime task.
- IPC is through `v7-browser-pending`, `v7-widget-confirm`, and `v7-widget-release`; the old injected `executeJavaScript` path is removed.

### Technician navigation / Overview contract

- Technician dropdown now owns all five planned entries: Mobile Firmware, Operating Systems, Queues, Categories, LinkGrabber.
- Five compact rows physically fit at 920x560 with no overlap and 11 px clearance above Storage in the proof run.
- Overview `Clear Completed` is restored; the old `lumi-ui.js` rewrite to `Categories` is removed.

### Browser extension bridge finding

The earlier ATHENA conclusion that the extension bridge source was broken was corrected. On KRATOS, the real MV3 service worker reported:

- `bridgeReady=true`
- WebSocket readyState `1` (OPEN)
- reconnect attempts `0`

Server-side `browser.hello -> browser.ready` also passed. The ATHENA failure is treated as stale packaged Builder/runtime dependency state until the next Windows rebuild proves otherwise. `websockets>=12,<16` is already declared.

### Firmware device identity breadth

Broad device identity is now sourced without pretending identity data is firmware evidence:

- Google Play certified-device catalogue = broad OEM/model identity only.
- LineageOS Wiki = supported codenames/model aliases where available.
- Google identity data is **not** exposed as a firmware provider.

Live breadth measured during this pass included approximately:

- Samsung: 3,478
- Tecno: 430
- Infinix: 293
- itel: 298
- Huawei: 1,484
- Honor: 205
- Xiaomi: 419
- Redmi: 349
- POCO: 97
- ZTE/Nubia: 1,677

### LineageOS current API repaired

The current Lineage build API returns build objects containing nested `files[]`. Lumi now parses that shape and only emits direct artifacts when each nested file has:

- an HTTPS URL, and
- a valid published SHA-256.

Live `enchilada` proof returned 12 artifacts including ROM, boot, dtbo, and vbmeta from `mirrorbits.lineageos.org`, all checksum-backed. LineageOS is exposed for a selected model only when exact Lineage device-support evidence exists.

### Operating Systems catalogue repaired

macOS parser/result identity/order bugs are corrected. Live public results observed after the fix:

- Latest public: macOS 26.6.2 / build 25G83 / Latest
- Sequoia: 15.7.9 / build 24G830 / Latest
- Sonoma: 14.8.9 / build 23J631 / Latest
- macOS 27 public: no false stable result while current builds remain seed/pre-release builds

Apple build IDs ending in a lowercase seed suffix are treated as pre-release even if a third-party index labels a row `Public`.

Kali Live is also corrected: the current official directory does not publish the corresponding direct Live ISO, but does publish the official torrent. Lumi routes that result through its existing Torrent task path instead of fabricating an ISO URL. Real authenticated API proof produced a canonical task with `type=torrent`, `status=staged`, `category_id=operating-systems`, and `stop_after_download=true`.

### Xiaomi / Redmi / POCO firmware provider

A `xiaomi-firmware-updater` provider has been added as a **verified community firmware index**, never as an official Xiaomi service.

Rules:

- release source: `XiaomiFirmwareUpdaterReleases/firmware_xiaomi_<codename>`
- exact GitHub release asset must have a `sha256:<64-hex>` digest or it is not emitted as a verified direct row
- asset URL must be HTTPS/GitHub release content
- per-asset version and region are derived from the exact filename, not inherited blindly from the release body
- generic research/source cards remain the fallback if verified release metadata is unavailable
- GitHub fetch uses Python HTTPS first, then a bounded `curl` fallback because KRATOS showed `requests` timeouts while `curl` remained healthy

Live `spinel` proof returned two digest-backed artifacts:

- EEA: `OS3.0.301.0.WPGEUXM`, SHA-256 beginning `d875fa04fc22...`
- Global: `OS3.0.302.0.WPGMIXM`, SHA-256 beginning `504d96ba5879...`

### Published artifact integrity

`core/v5/artifact_postprocess.py` adds automatic SHA-256 enforcement for staged firmware/OS tasks that carry a valid published digest.

- matching digest -> task remains completed and records `<kind>_sha256_verified=true`
- mismatch -> task becomes failed with `PUBLISHED_SHA256_MISMATCH`

This closes the gap where Lumi previously stored/displayed an expected checksum without automatically enforcing it after transfer.

## Samsung FUS — current checkpoint and IMPORTANT blocker

Samsung work is **not release-ready yet**. Do not call it complete.

What exists now:

- `samsung-fus` provider/search row and UI Resolve action.
- exact Samsung model validation (`SM-...`) and exact 3-character CSC validation.
- protected `/api/v5/firmware/samsung/stage` route.
- staging uses Lumi's canonical HTTP task with category `firmware`.
- FUS Authorization is passed in the request envelope and therefore moved into Lumi's encrypted header vault; public task JSON shows only `<redacted>`.
- a protocol-shaped real API proof confirmed the secret did not appear in public JSON.
- `samsung_postprocess.py` currently models the required decrypt completion lifecycle.
- provider-secret vault support has also been added to `RequestEnvelope` / `core/v2/vault.py`, including secure redaction, hydration, and deletion. This is intended for the packaged-safe Samsung decrypt-key handoff.
- runtime reliability composition was adjusted to enhance `runtime.HTTPTransferRunner` rather than resetting to the bare replay runner, preserving Wave3 + Samsung + integrity wrappers.

### Packaging blocker discovered during review

The first Samsung implementation uses a pinned external samloader subprocess (`core/v5/samsung_fus.py`). That is acceptable as protocol research/source proof but **not acceptable as the final packaged Windows implementation** because the PyInstaller sidecar's `sys.executable` becomes `LUMIDM-server.exe`, not a reusable Python interpreter for `python -c`.

Do not freeze the Samsung external-subprocess implementation as release-ready.

### Next Samsung architecture — first task for the next chat

Replace the temporary runtime helper with a native Lumi FUS adapter that uses the already-packaged `cryptography` library. The intended final flow is:

1. Normalize exact Samsung model + CSC.
2. Resolve latest version from Samsung FOTA/FUS when reachable.
3. Perform FUS nonce/auth/BinaryInform/BinaryInit natively inside Lumi.
4. Derive the `.enc2/.enc4` decrypt key **at resolve time**.
5. Store that key as a `provider_secret` in Lumi's encrypted vault; retain only `provider_secret_reference` on the request/task.
6. Keep FUS HTTP Authorization in the existing sensitive-header vault.
7. Lumi's own HTTP engine downloads/resumes the encrypted Samsung package.
8. Samsung post-process hydrates the provider secret, decrypts the package using packaged `cryptography`, verifies output exists/is usable, deletes the encrypted file only after successful decrypt, then destroys the provider-secret vault entry.
9. On decrypt failure: preserve encrypted package, mark task failed, preserve diagnostic evidence, do not delete the provider secret until retry/cancel policy is defined.
10. Remove `pycryptodomex`/`tqdm` and external runtime-helper dependency if the native path fully replaces it.

The external samloader revision used as protocol evidence was commit `0e53d8032699a4039ea6f5310ebec05f8f417f07`. It is archived/GPL and should remain a protocol/reference donor, not embedded Lumi application source.

## Tests/proofs already green in this pass

Targeted results observed during this session include:

- OS correction + transport contracts: 8/8 PASS
- Lineage/current firmware breadth/hardening set: PASS
- Samsung/Xiaomi provider contracts before native refactor: PASS
- Samsung UI/stage/post-process source contracts: PASS
- Samsung protected-stage redaction proof: HTTP 200; Authorization returned only as `<redacted>`
- Xiaomi parser + bounded GitHub transport tests: PASS
- Artifact SHA-256 integrity tests: PASS
- Widget pending-confirmation physical Electron proof: PASS
- Compact Technician layout regression: PASS

**Important:** a full repository regression/freeze has NOT yet been performed on this complete combined worktree. Do not infer release readiness from the targeted passes.

Checkpoint verification before this WIP push ran 59 targeted ownership tests: **58 passed / 1 failed**. The single failure is confirmed baseline debt: `tests/test_v6_ttg_shell_os_workspace.py::test_advanced_diagnostics_remains_available_only_as_hidden_workspace` expects `docs/TTG_APP_SHELL_STANDARD.md`, and `git cat-file HEAD:docs/TTG_APP_SHELL_STANDARD.md` confirms that file was already absent from the pre-pass HEAD (`93b9c80`). Do not misclassify that missing document as a regression introduced by this checkpoint.

## Exact next execution order

1. Finish packaged-safe native Samsung FUS implementation using provider-secret vault support.
2. Add tests for native FUS nonce/auth/request parsing, decrypt-key derivation, provider-secret destruction after successful decrypt, and packaged/frozen interpreter independence.
3. Prove runner MRO/composition: artifact integrity -> Samsung post-process -> Wave3 HTTP, with v6 reliability preserving that chain.
4. Re-run live Samsung metadata proof when Samsung endpoints are reachable; fail closed/source fallback if unreachable.
5. Re-run live Xiaomi `spinel` and Lineage `enchilada` evidence.
6. Run all targeted firmware/OS/widget/navigation contracts.
7. Run the broad Python regression suite using the correct Lumi dependency environment. Distinguish pre-existing release/baseline debt from regressions introduced here; do not rewrite unrelated tests merely to get green.
8. Run Node/Playwright browser sweeps and real Electron source-shell/widget lifecycle tests on KRATOS.
9. `git diff --check`, inspect complete diff, remove only proven test/runtime noise.
10. Freeze/commit/push.
11. Verify remote SHA.
12. When ATHENA returns, pull this same branch; do not manually copy files.
13. Only after product behavior is frozen, finish the GitHub Release/build pipeline consumed by Lumi's in-app updater.

## Do not regress these locked decisions

- Existing approved 920x560 Lumi manager/glass UI remains the visual baseline.
- Existing widget is the confirmation surface; no third confirmation window.
- Technician owns all five grouped functions.
- Quick Action remains `Clear Completed`, not `Categories`.
- Broad device identity does not equal verified firmware availability.
- Community sources must remain labeled community.
- No fake direct URLs.
- No firmware result may be called verified solely because a source page names it; direct artifacts need verifiable provenance, and checksum-backed sources must be checked by Lumi after transfer.
- Optional provider/network failure must not make the rest of Lumi unusable.
