#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
source scripts/local-env.sh
mkdir -p .local
session_dir=$(mktemp -d "$PWD/.local/native-smoke.XXXXXX")
mkdir -p "$session_dir/runtime" "$session_dir/data" "$session_dir/config"
chmod 700 "$session_dir/runtime"
export XDG_RUNTIME_DIR="$session_dir/runtime" XDG_DATA_HOME="$session_dir/data" XDG_CONFIG_HOME="$session_dir/config"
export CLOUDMUSIC_SMOKE_REPORT="$session_dir/report.json"
export CLOUDMUSIC_TEST_BINARY="$PWD/src-tauri/target/debug/yunting"
export GDK_BACKEND=x11
mkdir -p "$XDG_DATA_HOME/applications" "$XDG_DATA_HOME/icons/hicolor/256x256/apps"
# Exercise the shipped canonical launcher with this session's debug executable.
/usr/bin/python3 - <<'LAUNCHER'
import os
from pathlib import Path
text = Path('src-tauri/linux-app.desktop').read_text()
text = text.replace('Exec=yunting\n', 'Exec="' + os.environ['CLOUDMUSIC_TEST_BINARY'] + '"\n')
Path(os.environ['XDG_DATA_HOME'], 'applications', 'io.yunting.desktop.desktop').write_text(text)
LAUNCHER
install -m644 src-tauri/icons/128x128@2x.png "$XDG_DATA_HOME/icons/hicolor/256x256/apps/io.yunting.desktop.png"
smoke_dev_pid=""
cleanup_dev() { if [[ -n "$smoke_dev_pid" ]]; then kill "$smoke_dev_pid" 2>/dev/null || true; fi; }
trap cleanup_dev EXIT
if ! curl -fsS --max-time 2 http://127.0.0.1:1431/ >/dev/null; then
  node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 1431 --strictPort >"$session_dir/dev.log" 2>&1 &
  smoke_dev_pid=$!
  for _ in {1..30}; do
    if curl -fsS --max-time 1 http://127.0.0.1:1431/ >/dev/null 2>&1; then break; fi
    sleep 0.2
  done
fi
curl -fsS --max-time 3 http://127.0.0.1:1431/ >/dev/null
xvfb-run -a dbus-run-session -- bash -euo pipefail <<'NATIVE'
  printf '%s' 'yunting-test-only' | gnome-keyring-daemon --unlock --components=secrets
  /usr/bin/python3 scripts/tray-probe.py host >"$XDG_RUNTIME_DIR/tray-host.log" 2>&1 &
  host=$!
  for _ in {1..15}; do [[ -f "$XDG_RUNTIME_DIR/tray-host-ready" ]] && break; sleep 0.2; done
  "$CLOUDMUSIC_TEST_BINARY" >"$XDG_RUNTIME_DIR/app.log" 2>&1 &
  app=$!
  trap 'kill "$app" "$host" 2>/dev/null || true' EXIT
  for _ in {1..60}; do
    if [[ -f "$CLOUDMUSIC_SMOKE_REPORT" ]]; then break; fi
    sleep 1
  done
  if [[ ! -f "$CLOUDMUSIC_SMOKE_REPORT" ]]; then cat "$XDG_RUNTIME_DIR/app.log"; exit 1; fi
  /usr/bin/python3 scripts/desktop-identity.py "$app"
  /usr/bin/python3 scripts/tray-probe.py check
  node -e 'const r=JSON.parse(require("fs").readFileSync(process.env.CLOUDMUSIC_SMOKE_REPORT));console.log(r);if(!r.ok)process.exit(1)'
NATIVE
