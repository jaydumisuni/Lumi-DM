# Lumi issue #8 correction CI assurance

Status: correction-campaign source/review evidence  
Execution standard: `ttg.tenfold.v1`  
Scope: issue #8 — one Runtime, multiple surfaces

This assurance record covers the correction-campaign change to `.github/workflows/full-desktop-interaction-contract.yml`. It does not grant release, deployment, signing, merge, secret, or external-system authority.

## `.github/workflows/full-desktop-interaction-contract.yml`

### Purpose

The correction campaign extends the established read-only full-desktop proof lane in two bounded ways:

1. JavaScript syntax proof includes the packaged Chromium extension sources under `static/browser-extension/chromium/*.js` in addition to the existing main-renderer and Electron sources.
2. The pytest proof list includes `tests/test_v7_correction_contract.py` and `tests/test_v7_desktop_correction_source.py`, which lock the issue #8 Runtime/RPC, 32-connection, same-PC extension trust, media, widget, geometry, firmware and remote-request contracts.

The workflow remains a source/contract test lane. It does not build an installer, publish a package, create a release, deploy a service, mutate a repository, run on an owner workstation, or perform a production action.

### Permissions

Repository permission remains exactly `contents: read`. Checkout continues to use `persist-credentials: false`. No write, actions-management, issue/PR, release/package, environment/deployment, signing, cloud, or external-system permission is introduced.

### Secrets

No new secret is requested or consumed. The correction tests use temporary, test-only loopback credentials generated or supplied inside the isolated test process. They do not read repository secrets, owner credentials, production pairing tokens, browser cookies, signing material or external service credentials.

### Rollback

Rollback is deterministic and CI-only: remove the Chromium-extension syntax loop and the two v7 test paths from the existing workflow. Product source and external systems require no rollback to undo this workflow integration. Removing this proof before the correction campaign is complete would reduce assurance and therefore requires equivalent replacement evidence.

### Proof

On the exact PR head the workflow must prove:

- all top-level `static/*.js` and `electron/*.js` syntax;
- all packaged `static/browser-extension/chromium/*.js` syntax;
- the established desktop interaction/release/engine/technician/reliability suites;
- the live v7 Runtime integration contract;
- the v7 static architecture/source contract.

A green result is mechanical/source proof only. It does not substitute for independent Sergeant review, Playwright visual/interaction proof, Builder packaging proof, native Windows identity proof or final physical acceptance.

## Authority boundary

Sergeant remains the primary independent review authority for the PR. Builder remains installer/package authority. Native Windows/Oracle evidence does not redefine architecture. No CI success may promote a different SHA from the exact reviewed/frozen/proven candidate.
