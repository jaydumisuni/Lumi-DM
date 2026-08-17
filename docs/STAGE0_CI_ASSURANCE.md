# Lumi Stage 0 and issue #8 CI assurance

Status: Stage-0 diagnostic + issue #8 correction/review evidence  
Execution standard: `ttg.tenfold.v1`  
Scope: PR #9 Stage-0 diagnostics, stacked PR #10 correction campaign, and PR #11 physical-recovery source proof

This is Lumi's canonical repository assurance file for high-risk CI/review changes. It does not grant deployment, release, signing, secret, merge, or external-system authority.

## `.github/workflows/current-functional-proof.yml`

### Purpose

The Stage-0 change adds `tests/test_stage0_packaged_trace_contract.py` to the existing interaction/current-release pytest invocation. The workflow remains a source/contract proof lane; it does not package, publish, deploy, sign, release, or mutate product state.

### Permissions

Repository permission remains `contents: read`. Checkout uses `persist-credentials: false`. No write, deployment, release, signing, issue/PR mutation, or environment authority is added.

### Secrets

No new secret is requested or consumed. Stage-0 diagnostics forbid persistence of credentials, request bodies, query strings or private browser/session content.

### Rollback

Remove `tests/test_stage0_packaged_trace_contract.py` from the workflow's pytest list. No product or external-system rollback is required.

### Proof

The exact PR head must execute the Stage-0 regression together with the existing JavaScript syntax, desktop interaction, release, engine, technician and reliability proofs. Green is source/contract evidence only.

---

## `.github/workflows/full-desktop-interaction-contract.yml`

### Purpose

Stage 0 originally added `tests/test_stage0_packaged_trace_contract.py`. Issue #8 extends this already-registered read-only proof workflow so the correction/recovery campaign executes against the exact PR head before Builder packaging is attempted.

The issue #8 / physical-recovery additions are bounded to:

1. JavaScript syntax checks for the renderer, Electron source files, packaged Chromium extension, and all Playwright proof scripts.
2. `tests/test_v7_correction_contract.py`, `tests/test_v7_desktop_correction_source.py`, and `tests/test_issue8_physical_recovery_source.py` for the one-Runtime/RPC, exact sidecar identity, native-shell authentication, 32-connection, browser trust/media, widget, startup-fallback, compact-geometry, firmware and remote-request contracts.
3. Pinned Playwright `1.61.1`, Chromium, and test-only Electron `43.2.0`. Electron 43.2.0 is used only as a source-shell proof runtime; Builder remains the packaging/runtime-version authority for release artifacts.
4. Real Electron source-shell launches on Linux/Xvfb and Windows hosted runners. Each starts Lumi's actual `electron/main.js`, which in turn starts its own isolated Python Runtime through the production supervisor path.
5. Native source-shell assertions covering exact 920×560 BrowserWindow geometry, owned Runtime URL, absence of `confirm.html`, two-surface main+widget topology, main-visible/widget-hidden exclusivity, real preload/IPC minimize/maximize/close behavior, and close-to-widget lifecycle.
6. A second real Electron lifecycle proof that creates one pending browser-capture Runtime task, requires the existing widget to expand, clicks the real pending Start hit target, proves the same task ID is confirmed with 32 connections, then requires the same widget to collapse to compact progress without creating a third BrowserWindow. This proof runs on Linux/Xvfb and Windows.
7. After Electron closes and port 7000 is proven released, one isolated browser-only Lumi Runtime on loopback with runner-temporary storage.
8. Main-renderer regression proof at 920×650, issue-#8 visual/button proof at the IDM-size 920×560 default, settled post-animation screenshots for representative workspaces, and the fixed-ID Manifest V3 extension/bridge/media-handoff proof.
9. Upload of job-local screenshots and Runtime logs as review artifacts.

The workflow does not build an installer, publish a package, create a release, deploy a service, mutate repository/product state, run on an owner workstation, or claim packaged Windows acceptance.

### Permissions

Repository permission remains exactly `contents: read`. Checkout uses `persist-credentials: false`. `actions/upload-artifact@v4` only persists job-local proof output. No repository-write, pull-request/issue-write, actions-management, package/release, deployment/environment, signing, cloud, or external-system permission is introduced.

### Secrets

No repository or external secret is requested or consumed. The Electron source shells receive only runner-local temporary paths and the setup-python interpreter path. Each Electron process generates its own per-process Runtime credential using the production supervisor path; the widget lifecycle proof reads that credential only inside the same ephemeral test process to call the owned loopback Runtime, never logs it, and destroys it with the runner. `LUMIDM_DESKTOP_SECRET` and `LUMIDM_RUNTIME_INSTANCE` used by the subsequent isolated browser proof are explicit test-only values scoped to the hosted job. Test download/state paths use `$RUNNER_TEMP` or the job-local artifact directory. The real MV3 extension receives a token generated by that temporary Runtime; it disappears with the runner. The proof does not read owner credentials, production pairing tokens, browser cookies, signing material or service credentials.

### Rollback

Issue #8 CI rollback is deterministic: remove the v7/recovery test paths, Electron source-shell/widget-lifecycle scripts and pinned Electron install, Windows source-shell job, settled-visual script, extension/Playwright syntax entries, isolated Runtime steps, Playwright executions and proof-artifact upload. The pre-existing Stage-0/desktop contract remains. No product, release, credential, deployment or external-system rollback is required. Removing this proof before issue #8 completion requires equivalent replacement evidence.

### Proof

On the exact PR head this workflow must prove:

1. all relevant main-renderer, Electron, packaged extension and Playwright JavaScript parses;
2. established Stage-0, desktop interaction, release, engine, technician and reliability suites remain green;
3. the live v7 Runtime integration contract passes;
4. the v7/recovery static architecture and regression contracts pass;
5. the **actual Electron source shell** reaches the owned local Runtime instead of the recovery page and creates exactly the expected main manager plus one widget, with no legacy confirmation BrowserWindow;
6. the native source manager opens at exactly 920×560 and the widget becomes hidden while the main window is visible;
7. gear and bell are real renderer hit targets through the actual Electron shell, and minimize/maximize/close traverse the real preload→IPC owner; close hides main and reveals the existing widget without creating another window;
8. a pending browser capture is represented by one canonical Runtime task in the inactive `browser-pending` queue, forces the **existing** widget to expanded geometry, exposes a physically hit-testable Start action, and creates no third native surface;
9. clicking Start confirms the **same task ID**, restores its requested queue, retains the canonical 32-connection HTTP contract, collapses the **same widget** to 240×66 compact progress, and reaches an independent Range-capable loopback fixture;
10. the browser-only renderer remains healthy at 920×650 as a larger-layout regression and at 920×560 as the canonical IDM-size default, with no HTML/body/Overview page scrolling or hidden sidebar scrolling;
11. settled visual screenshots are captured only after the short view-entry transition ends, and each representative active workspace has final opacity 1 rather than a first-animation-frame false dim state;
12. New Download Start/Cancel controls remain completely inside the 920×560 viewport and are actual physical hit targets;
13. Browser Extension action prepares the actually bundled extension and states that same-PC pairing is not required;
14. Firmware dependency order is Brand → Model → Source → Channel/qualifiers and model selection activates valid sources;
15. the actual fixed-ID Manifest V3 extension loads in Chromium;
16. automatic local extension identity and persistent WebSocket bridge connect to the same Runtime;
17. browser media enumeration is untruncated, reaches terminal states instead of endless spinner, source-local quality metadata does not blindly inherit the active parent video's dimensions, and URL-equivalent browser/resolver observations do not create duplicate visible variants;
18. selecting a media variant creates one pending canonical-Runtime task in the existing widget queue with the 32-connection contract where HTTP applies.

A green result is source/runtime/Electron/browser evidence. It does not substitute for Sergeant review, Builder packaging, native Windows installer/taskbar identity, packaged child-process ownership, or final packaged physical acceptance on ATHENA.

---

## `.github/workflows/stage0-sergeant-review.yml`

### Purpose

This workflow is Lumi's primary independent Sergeant gate. It builds the exact PR base→head changed-file list, supplies that list to `sergeant pr-review`, records the JSON review packet, and fails unless Sergeant's final PR verdict is `APPROVE`.

It uses packaged reviewer `sergeant-reviewer==0.4.0`; therefore this known canonical assurance file remains the explicit assurance surface for the high-risk workflow change being reviewed.

### Permissions

Repository permission is `contents: read` only. Checkout uses `fetch-depth: 0` only to compute the exact PR diff and `persist-credentials: false`. No write, issue/PR mutation, package/release, deployment, environment, signing, or external-system permission is granted. Sergeant runs with `SERGEANT_CPL_POLICY=disabled`, so deterministic Sergeant evidence is authoritative in this gate.

### Secrets

No repository or external secret is requested. No secret is printed, copied into review files, uploaded, or exported.

### Rollback

Delete this workflow only if an explicit replacement independent-review authority has been accepted. Its removal does not mutate product code, Builder state, releases, deployments, credentials, or external systems.

### Proof

The workflow must produce a non-empty exact changed-file list, invoke `sergeant pr-review` with that list, parse its JSON, and fail unless `verdict.verdict == APPROVE`. An `APPROVE` clears independent static/adversarial review for that exact source head only; it is not native Windows acceptance.

---

## Combined assurance boundary

All workflow changes documented here are limited to **proof and independent review**. They do not grant new mechanical authority, do not publish/deploy Lumi, do not merge the correction PR, and do not sign/release artifacts. Builder remains package/installer authority; Sergeant remains independent review authority; packaged Windows proof remains a separate gate.

If a workflow changes beyond the Purpose, Permissions, Secrets, Rollback or Proof boundaries documented here, this assurance must be reviewed again rather than assumed to carry forward.
