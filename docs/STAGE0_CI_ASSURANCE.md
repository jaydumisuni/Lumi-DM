# Lumi Stage 0 CI assurance

Status: Stage-0 diagnostic/review evidence  
Execution standard: `ttg.tenfold.v1`  
Scope: PR #9 — packaged interaction and Runtime trace diagnostics

This document exists to make the high-risk CI changes in the Stage-0 diagnostic change set explicit and reviewable. It does not grant deployment, release, secret, or write authority.

## `.github/workflows/current-functional-proof.yml`

### Purpose

The only Stage-0 change to this existing workflow is to add `tests/test_stage0_packaged_trace_contract.py` to the already-existing interaction/current-release pytest invocation. The workflow remains a source/contract proof lane; it does not package, publish, deploy, sign, release, or mutate product state.

### Permissions

Repository permission remains `contents: read`. Checkout uses `persist-credentials: false`. The Stage-0 change does not add write permissions, elevated GitHub permissions, deployment environments, service credentials, or external execution authority.

### Secrets

No new secret is requested, read, printed, persisted, or forwarded. Stage-0 diagnostics explicitly avoid credentials, request bodies, query strings, filenames, browser/media content and session material.

### Rollback

Rollback is deterministic: remove `tests/test_stage0_packaged_trace_contract.py` from this workflow's pytest list. No product source, release artifact or external system must be rolled back to undo this CI-only integration.

### Proof

The workflow must execute the Stage-0 regression file on the exact PR head together with the existing JavaScript syntax, desktop interaction, release-contract, download-engine, technician and reliability proofs. A green result proves only those source/contract obligations; it is not physical Windows acceptance.

---

## `.github/workflows/full-desktop-interaction-contract.yml`

### Purpose

The only Stage-0 change to this existing workflow is to add `tests/test_stage0_packaged_trace_contract.py` to the established full-desktop interaction contract. This ensures the new diagnostic/privacy contract cannot be omitted while the broader interaction gate remains green.

### Permissions

Repository permission remains `contents: read`. Checkout uses `persist-credentials: false`. No write, deployment, release, package-publish, signing, issue/PR mutation, or environment permission is introduced.

### Secrets

No secret is consumed or added. The workflow runs repository code/tests with normal public test dependencies only. The Stage-0 tracer contract forbids diagnostic persistence of credentials or private browser/session content.

### Rollback

Rollback is deterministic: remove the Stage-0 regression file from this workflow's pytest list. Existing interaction and engine proof commands remain otherwise unchanged.

### Proof

The exact PR head must pass JavaScript syntax plus Stage-0, interaction, release, engine, technician and reliability contract tests. This proof remains source-level and cannot substitute for the packaged Windows Stage-0 trace run.

---

## `.github/workflows/stage0-sergeant-review.yml`

### Purpose

This new workflow restores Sergeant as the primary independent review authority for the Stage-0 PR. It builds the exact GitHub PR changed-file list, passes that list to `sergeant pr-review`, records the JSON review packet, and fails the workflow unless Sergeant's final verdict is `PASS`.

The workflow exists because the earlier naive invocation omitted changed-file evidence and because Sergeant's CLI can print a non-PASS review while returning process exit code `0`. This workflow closes both proof gaps.

### Permissions

Repository permission is `contents: read` only. Checkout uses `fetch-depth: 0` solely so the PR base/head diff can be computed and uses `persist-credentials: false`. The workflow has no write permission, no issue/PR mutation permission, no package/release permission, no deployment environment, and no shell access outside the hosted read-only review job's normal repository workspace.

Sergeant runs with `SERGEANT_CPL_POLICY=disabled`; this Stage-0 gate relies on deterministic Sergeant evidence rather than requiring an external model endpoint.

### Secrets

No repository or external secret is requested by the workflow. The checkout token is handled by the standard GitHub action and is not persisted into repository Git configuration. No secret value is printed, copied into review files, uploaded, or exported.

### Rollback

Rollback is deterministic: delete `.github/workflows/stage0-sergeant-review.yml`. This removes only the Stage-0 independent-review gate and does not mutate product code, Builder state, releases, deployments, credentials, or external systems. Removing it before Stage-0 completion would reduce assurance and therefore requires an explicit replacement review authority.

### Proof

The workflow must:

1. produce a non-empty file list from the exact PR base SHA to exact PR head SHA;
2. show the Stage-0 changed files in that list;
3. call `sergeant pr-review . --file-list .sergeant-stage0-files.txt --pretty`;
4. parse Sergeant's JSON result;
5. fail unless `verdict.verdict == PASS`.

A PASS clears Sergeant's static/adversarial review obligation for that exact source head only. It does not prove packaged Windows behavior. Physical Stage-0 proof remains mandatory before architecture correction or release promotion.

---

## Combined assurance boundary

These workflow changes are intentionally limited to **proof and independent review**. They do not grant new mechanical authority. They do not publish or deploy Lumi, do not merge PR #7/#9, do not sign or release artifacts, and do not change the physical acceptance boundary.

If any workflow changes beyond the purpose, permissions, secrets, rollback, or proof boundaries documented here, this assurance must be reviewed again rather than assumed to carry forward.
