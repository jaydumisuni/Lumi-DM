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

## Samsung FUS — native packaged-safe implementation complete

Samsung no longer depends on an external Python subprocess/helper at runtime. Lumi now implements the reviewed Samsung SmartDownload/FUS interoperability path natively with its already-packaged `cryptography` dependency.

Final architecture and proof:

- Protocol reference used for interoperability review: `topjohnwu/samloader-rs` (Apache-2.0), reviewed clone commit `2b9d59054f863c540578dc2dce429daaefb3460e`. No donor source is embedded in Lumi.
- Exact Samsung model (`SM-...`) and exact 3-character CSC validation remain mandatory.
- Native FOTA latest-version lookup + FUS nonce/auth + BinaryInform + BinaryInit are implemented in `core/v5/samsung_fus.py`.
- BinaryInform includes the required `Get/CmdID=2/BINARY_SW_VERSION` request block; BinaryInit matches the reviewed SmartDownload request shape.
- The `.enc2/.enc4` AES-128 decrypt key is derived at resolve time and stored only as an encrypted `provider_secret` vault reference.
- FUS HTTP Authorization remains in the existing sensitive-header vault and is redacted from public task JSON.
- HTTP 401 refresh is narrow/provider-specific: normal HTTP tasks are unchanged; Samsung serializes FUS reauthorization so multiple range workers do not all renegotiate simultaneously.
- Lumi's own HTTP engine owns segmented/resumable transfer. Samsung decryption is a post-process wrapper over the active Wave3 HTTP runner.
- Decrypt uses packaged `cryptography` AES-128-ECB and the reviewed final-byte padding semantics.
- Successful decrypt deletes the encrypted package and the decrypt-key vault entry only after usable output exists. Decrypt failure preserves the encrypted package and key reference for diagnosis/retry.

Live Samsung proof on KRATOS, without downloading the multi-gigabyte payload:

- `SM-S921B / EUX` resolved in about 4.34 s.
- Version resolved: `S921BXXSAGYH1/S921BOXMAGYH1/S921BXXSAGYH1/S921BXXSAGYH1`.
- Official encrypted package size: `17,592,535,024` bytes.
- Official cloud host: `cloud-neofussvr.samsungmobile.com`.
- 16-byte ranged transfer ticket test returned HTTP `206` with `Content-Range: bytes 0-15/17592535024`.
- Protected `/api/v5/firmware/samsung/stage` returned a canonical `status=staged`, `type=http`, `category=firmware` task.
- Public task JSON exposed `Authorization=<redacted>` and `provider_secret_reference=<secure-reference>`; no live decrypt key/signature was written into the repository.

### Xiaomi rate-limit hardening

GitHub's unauthenticated API quota was exhausted during live proof. Lumi now keeps verification without depending on that quota:

1. Try GitHub release API.
2. Try bounded command-line API transport if available.
3. If API access is rate-limited/unavailable, fetch the public GitHub release page and its `releases/expanded_assets/<tag>` fragment.
4. Parse only exact release assets whose public row contains `sha256:<64-hex>`.
5. Cache verified release metadata for 30 minutes.
6. If no digest-backed evidence is available, fail closed and retain research/source fallbacks.

Live proof while the API was rate-limited still recovered the same two `spinel` assets with matching SHA-256 values, and a protected Xiaomi firmware stage produced a canonical staged task carrying the exact expected SHA-256.

## Final verification state for this KRATOS product pass

Fresh evidence on the final tree:

- Native Samsung/Xiaomi/integrity focused contracts: green.
- Current functional core batch: **104/104 PASS**.
- Workflow filtered groups: **6 PASS + 1 PASS + 4 PASS + 8 PASS**.
- Full pytest collection after final Xiaomi fallback: **203 PASS / 11 FAIL**.
- The 11 failures are confirmed pre-existing/deferred release-pipeline baseline debt: builder profile/icon expectations, missing `electron/package.json`, missing Builder GitHub release contract/publisher, and missing TTG shell standard document. Their owning release/pipeline files are unchanged from the pre-pass branch state.
- Python compileall: PASS.
- JavaScript syntax on changed UI/Electron test files: PASS.
- Real Electron source shell: PASS; exactly two native surfaces, manager 920x560, widget hidden while manager is open, close -> widget handoff works.
- Physical widget pending confirmation: PASS.
- Approved mockup, compact geometry, settled views, 14-screen visual sweep, main interactions, both-theme readability/palette, glass accessibility/polish/parity: PASS.
- Final live Samsung metadata + ranged transfer + protected stage: PASS.
- Final live Xiaomi public-digest fallback + protected stage: PASS.

## Exact next execution order after this freeze

1. Commit and push the remaining post-checkpoint hardening delta; verify remote SHA.
2. ATHENA pulls the same branch when available; do not manually copy files.
3. Rebuild/package on Windows from the frozen source and prove the extension WebSocket/runtime dependency path on the fresh package.
4. Complete the deliberately deferred GitHub Release/build pipeline consumed by Lumi's in-app updater.
5. Resolve the 11 historical release/pipeline baseline tests as part of that pipeline work, not by weakening product tests.

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
