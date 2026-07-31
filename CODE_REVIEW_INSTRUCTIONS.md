# Code review instructions

Review this branch as a release candidate, not a visual prototype.

Focus on:

- default 32-connection behavior and explicit saved-value preservation;
- Electron capacity-test result normalization;
- settings persistence and startup behavior;
- Chrome/Edge extension preparation, pairing and safe browser fallback;
- tray/widget/taskbar lifecycle;
- real download integrity and pause/resume tests;
- absence of unsupported or misleading Firefox behavior;
- no regression to the approved visual layout.

Do not approve while any release-gate check or review thread is unresolved.
