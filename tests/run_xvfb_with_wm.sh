#!/usr/bin/env bash
set -euo pipefail

wm_log="${TMPDIR:-/tmp}/lumi-x11-wm.log"
: > "$wm_log"

if command -v openbox >/dev/null 2>&1; then
  openbox >"$wm_log" 2>&1 &
elif command -v xfwm4 >/dev/null 2>&1; then
  xfwm4 --replace >"$wm_log" 2>&1 &
else
  echo "No X11 window manager is installed" >&2
  exit 1
fi
wm_pid=$!
cleanup() {
  kill "$wm_pid" >/dev/null 2>&1 || true
  wait "$wm_pid" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

ready=0
for _ in $(seq 1 80); do
  if xprop -root _NET_SUPPORTING_WM_CHECK 2>/dev/null | grep -q '_NET_SUPPORTING_WM_CHECK(WINDOW)'; then
    ready=1
    break
  fi
  sleep 0.1
done
if [ "$ready" -ne 1 ]; then
  echo "X11 window manager did not become ready" >&2
  cat "$wm_log" >&2 || true
  exit 1
fi

"$@"
