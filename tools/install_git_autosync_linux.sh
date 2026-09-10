#!/bin/sh
set -eu
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PYTHON="$(command -v python3 || command -v python)"
[ -n "$PYTHON" ] || { echo "Python 3 is required" >&2; exit 1; }
git -C "$ROOT" config core.hooksPath .githooks
UNIT_DIR="$HOME/.config/systemd/user"
mkdir -p "$UNIT_DIR"
cat > "$UNIT_DIR/lumi-git-autosync.service" <<EOF
[Unit]
Description=Lumi Git guarded auto-sync

[Service]
Type=oneshot
Environment=GIT_TERMINAL_PROMPT=0
ExecStart=$PYTHON "$ROOT/tools/git_autosync.py" --repo "$ROOT"
EOF
cat > "$UNIT_DIR/lumi-git-autosync.timer" <<EOF
[Unit]
Description=Run Lumi Git guarded auto-sync every 2 minutes

[Timer]
OnBootSec=30s
OnUnitActiveSec=2min
AccuracySec=15s
Persistent=true
Unit=lumi-git-autosync.service

[Install]
WantedBy=timers.target
EOF
systemctl --user daemon-reload
systemctl --user enable --now lumi-git-autosync.timer
"$PYTHON" "$ROOT/tools/git_autosync.py" --repo "$ROOT"
echo "Lumi Git auto-sync installed for $ROOT"
