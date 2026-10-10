#!/usr/bin/env bash
# Reversible current-user install; no root or system package changes.
set -euo pipefail
cd "$(dirname "$0")/.."
binary="$PWD/src-tauri/target/release/yunting"
if [[ ! -x "$binary" ]]; then printf '%s\n' '先运行 npm run tauri build'; exit 1; fi
dependencies=$(ldd "$binary")
if [[ "$dependencies" == *'not found'* ]]; then printf '%s\n' '系统缺少 GTK/WebKitGTK 运行库，请使用 .deb 安装依赖。'; exit 1; fi
task_install_dir="${XDG_DATA_HOME:-$HOME/.local/share}/yunting"
mkdir -p "$task_install_dir" "${XDG_DATA_HOME:-$HOME/.local/share}/applications" "${XDG_DATA_HOME:-$HOME/.local/share}/icons/hicolor/256x256/apps"
install -m755 "$binary" "$task_install_dir/yunting"
install -m644 src-tauri/icons/128x128@2x.png "${XDG_DATA_HOME:-$HOME/.local/share}/icons/hicolor/256x256/apps/io.yunting.desktop.png"
cat > "${XDG_DATA_HOME:-$HOME/.local/share}/applications/io.yunting.desktop.desktop" <<DESKTOP
[Desktop Entry]
Type=Application
Name=CloudTune
Comment=网易云音乐 Linux 第三方客户端
Exec="$task_install_dir/yunting"
Icon=io.yunting.desktop
Terminal=false
Categories=AudioVideo;Audio;Music;
Keywords=Music;网易云;CloudTune;
StartupWMClass=Yunting
DESKTOP
if command -v update-desktop-database >/dev/null; then update-desktop-database "${XDG_DATA_HOME:-$HOME/.local/share}/applications"; fi
if command -v gtk-update-icon-cache >/dev/null; then gtk-update-icon-cache -q -f -t "${XDG_DATA_HOME:-$HOME/.local/share}/icons/hicolor"; fi
printf '已安装到 %s，可从应用菜单打开「CloudTune」。\n' "$task_install_dir"
