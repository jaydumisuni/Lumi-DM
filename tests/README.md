# Lumi release-gate tests

`test_release_gate_download.py` runs the real Lumi Flask API and HTTP transfer engine against a deterministic local Range server. It proves the 32-connection default, persisted settings, adaptive segmented transfer, SHA-256 integrity, and pause/resume recovery.

`lumi-ui-contract.test.js` proves the settings, speed-test, Electron IPC and browser-extension release contracts.
