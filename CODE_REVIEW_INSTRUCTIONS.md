# Code review instructions

Review this branch as a release candidate, not a visual prototype.

## Required review sequence

1. Sergeant reviews the exact candidate head first.
2. The complete **Sergeant 20-for-2** aggregate and readable-source guard must be green before CodeRabbit is requested.
3. CodeRabbit then reviews the same green head as the secondary external reviewer.
4. Every valid new CodeRabbit finding must be converted into a permanent Sergeant regression assertion, test, or documented lane before the finding is closed.
5. Any corrective commit invalidates the previous result: rerun Sergeant first, then request CodeRabbit on the new head.

Focus on:

- default 32-connection behavior and explicit saved-value preservation;
- Electron capacity-test result normalization;
- settings persistence and startup behavior;
- Chrome/Edge extension preparation, pairing and safe browser fallback;
- tray/widget/taskbar lifecycle;
- real download integrity and pause/resume tests;
- absence of unsupported or misleading Firefox behavior;
- no regression to the approved visual layout.

Do not approve while any release-gate check, valid external-review finding, or review thread is unresolved.
