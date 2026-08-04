# Release gate status

Current state: **verification in progress — do not merge**.

Required before merge:

- Lumi release-gate GitHub Actions green.
- Real 1-connection versus 32-connection download proof green.
- Downloaded-file SHA-256 integrity green.
- Pause/resume proof green.
- Settings, speed test and extension contract green.
- CodeRabbit review green with no unresolved comments.
- Sergeant 10-for-2 code and visual passes green.
- Owner review of the running Windows application.

Only after these gates pass may this branch be merged and sent to THETECHGUY Software Builder.
