#!/usr/bin/python3
"""Read the real GTK window and resolve its launcher in the isolated Xvfb session."""
import json
import os
from pathlib import Path
import re
import subprocess
import sys

import gi
gi.require_version("Gtk", "3.0")
from gi.repository import Gio, GLib, Gtk

app_id = "io.yunting.desktop"
pid = int(sys.argv[1])
tree = subprocess.check_output(["xwininfo", "-root", "-tree"], text=True)
windows = []
for window_id in re.findall(r"^\s*(0x[0-9a-fA-F]+)", tree, re.MULTILINE):
    properties = subprocess.check_output(
        ["xprop", "-id", window_id, "_NET_WM_PID", "WM_CLASS", "_GTK_APPLICATION_ID"],
        text=True,
    )
    if not re.search(rf"^_NET_WM_PID\([^)]*\) = {pid}$", properties, re.MULTILINE):
        continue
    classes = re.search(r"^WM_CLASS\([^)]*\) = (.*)$", properties, re.MULTILINE)
    identity = re.search(r"^_GTK_APPLICATION_ID\([^)]*\) = (.*)$", properties, re.MULTILINE)
    if classes:
        windows.append({
            "window": window_id,
            "wmClass": re.findall(r'"([^"]*)"', classes[1]),
            "gtkAppId": re.findall(r'"([^"]*)"', identity[1]) if identity else [],
        })

assert windows, f"No GTK window found for PID {pid}"
assert any(window["gtkAppId"] == [app_id] and "Yunting" in window["wmClass"] for window in windows), windows

data_home = Path(os.environ["XDG_DATA_HOME"])
desktop_path = data_home / "applications" / f"{app_id}.desktop"
launcher = Gio.DesktopAppInfo.new(f"{app_id}.desktop")
assert launcher and Path(launcher.get_filename()) == desktop_path, "Canonical desktop entry did not resolve"
assert launcher.get_name() == "CloudTune" and launcher.should_show(), "Launcher is hidden or has the wrong name"
# GLib's get_executable retains quotes from Exec; parse the actual command.
_, command = GLib.shell_parse_argv(launcher.get_commandline())
assert command == [os.environ["CLOUDMUSIC_TEST_BINARY"]], "Launcher points to the wrong test binary"
assert launcher.get_startup_wm_class() == "Yunting", "X11 launcher class does not match the GTK window"
icon = launcher.get_icon()
assert isinstance(icon, Gio.ThemedIcon) and app_id in icon.get_names(), "Launcher icon name is incorrect"
resolved_icon = Gtk.IconTheme.get_default().lookup_icon(app_id, 256, Gtk.IconLookupFlags.FORCE_SIZE)
expected_icon = data_home / "icons" / "hicolor" / "256x256" / "apps" / f"{app_id}.png"
assert resolved_icon and Path(resolved_icon.get_filename()) == expected_icon, "Launcher icon did not resolve from isolated XDG_DATA_HOME"
print(json.dumps({"desktopIdentity": True, "windows": windows, "desktop": str(desktop_path), "icon": str(expected_icon)}, ensure_ascii=False))
