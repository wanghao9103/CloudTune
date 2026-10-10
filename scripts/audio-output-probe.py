#!/usr/bin/python3
"""Measure synthetic WebKit audio across event sounds in a private PipeWire graph.

Dependencies: Python GI Gtk3/WebKit2 4.1, numpy, PipeWire, WirePlumber 0.5+,
pw-record, canberra-gtk-play, libX11/libXtst, dbus-daemon, and xvfb-run.
No system audio is recorded or changed.
Artifacts (including synthetic PCM) stay under ignored .local/.
"""
import argparse
import base64
import io
import json
import math
import os
from pathlib import Path
import shutil
import signal
import subprocess
import sys
import tempfile
import time
import wave


SINK = "cloudtune_audio_probe_null"
ROOT = Path(__file__).resolve().parents[1]


def dump_graph(env):
    return json.loads(subprocess.check_output(["pw-dump"], env=env, text=True, timeout=5))


def system_defaults():
    """Return default sink/source metadata only; no user stream titles or data."""
    graph = dump_graph(os.environ.copy())
    return [e for o in graph if o.get("type") == "PipeWire:Interface:Metadata"
            and o.get("props", {}).get("metadata.name") == "default"
            for e in o.get("metadata", [])
            if e.get("key", "").startswith("default.audio")]


def assert_private_graph(env):
    graph = dump_graph(env)
    nodes = [o for o in graph if o.get("type") == "PipeWire:Interface:Node"]
    devices = [o for o in graph if o.get("type") == "PipeWire:Interface:Device"]
    sinks = [o for o in nodes if o.get("info", {}).get("props", {}).get("media.class") == "Audio/Sink"]
    if devices or len(sinks) != 1 or sinks[0].get("info", {}).get("props", {}).get("node.name") != SINK:
        raise RuntimeError("Private graph is not limited to the synthetic null sink; recording refused")
    for node in nodes:
        props = node.get("info", {}).get("props", {})
        if props.get("device.api") or str(props.get("node.name", "")).startswith(("alsa_", "bluez_")):
            raise RuntimeError("Hardware node in private graph; recording refused")
    return {"onlyNullSink": True, "hardwareDevices": 0,
            "nodeClasses": sorted(set(o.get("info", {}).get("props", {}).get("media.class", "") for o in nodes))}


def make_wave(rate):
    import numpy as np
    # A single long source avoids adding loop-boundary gaps to the experiment.
    samples = (np.sin(np.arange(rate * 25) * (2 * math.pi * 440 / rate)) * 0.04 * 32767).astype("<i2")
    stereo = np.repeat(samples[:, None], 2, axis=1)
    out = io.BytesIO()
    with wave.open(out, "wb") as writer:
        writer.setnchannels(2)
        writer.setsampwidth(2)
        writer.setframerate(rate)
        writer.writeframes(stereo.tobytes())
    return base64.b64encode(out.getvalue()).decode()


def worker(args):
    import gi
    gi.require_version("Gtk", "3.0")
    gi.require_version("WebKit2", "4.1")
    from gi.repository import GLib, Gtk, WebKit2
    data = {"rate": args.rate, "eventsRequested": args.events, "states": [], "eventSounds": [],
            "webkitVersion": f"{WebKit2.get_major_version()}.{WebKit2.get_minor_version()}.{WebKit2.get_micro_version()}"}
    manager = WebKit2.UserContentManager()
    manager.register_script_message_handler("probe")
    started = time.monotonic()

    def received(_manager, result):
        value = json.loads(result.get_js_value().to_string())
        value["elapsed"] = round(time.monotonic() - started, 4)
        data["states"].append(value)

    manager.connect("script-message-received::probe", received)
    web = WebKit2.WebView.new_with_user_content_manager(manager)
    web.get_settings().set_property("media-playback-requires-user-gesture", False)
    window = Gtk.Window(title="CloudTune synthetic audio probe")
    window.set_default_size(320, 180)
    window.add(web)
    window.show_all()
    wav = make_wave(args.rate)
    web.load_html("""<!doctype html><html><body><button style="position:fixed;inset:0">Start synthetic music</button><script>
const a = new Audio('data:audio/wav;base64,%s');
a.loop = false;
a.volume = 0.7;
const state = event => window.webkit.messageHandlers.probe.postMessage(JSON.stringify({
 event, currentTime:a.currentTime, paused:a.paused, readyState:a.readyState,
 muted:a.muted, volume:a.volume, error:a.error?.code || null
}));
for (const event of ['play','playing','pause','waiting','stalled','error','ended'])
 a.addEventListener(event, () => state(event));
setInterval(() => state('tick'), 250);
document.querySelector('button').addEventListener('click', () => a.play().catch(e => {
 window.webkit.messageHandlers.probe.postMessage(JSON.stringify({event:'play-rejected',name:e.name,message:e.message}));
}));
</script></body></html>""" % wav, "file:///")

    def start_music():
        # Send a real pointer event to the private Xvfb display, so WebKit sees
        # an actual user gesture instead of an untrusted DOM click.
        import ctypes
        import ctypes.util
        x11 = ctypes.CDLL(ctypes.util.find_library("X11"))
        xtst = ctypes.CDLL(ctypes.util.find_library("Xtst"))
        x11.XOpenDisplay.argtypes = [ctypes.c_char_p]
        x11.XOpenDisplay.restype = ctypes.c_void_p
        x11.XFlush.argtypes = [ctypes.c_void_p]
        x11.XCloseDisplay.argtypes = [ctypes.c_void_p]
        xtst.XTestFakeMotionEvent.argtypes = [ctypes.c_void_p, ctypes.c_int, ctypes.c_int, ctypes.c_int, ctypes.c_ulong]
        xtst.XTestFakeButtonEvent.argtypes = [ctypes.c_void_p, ctypes.c_uint, ctypes.c_int, ctypes.c_ulong]
        display = x11.XOpenDisplay(os.environ["DISPLAY"].encode())
        if not display:
            raise RuntimeError("Private Xvfb display unavailable")
        x, y = window.get_position()
        xtst.XTestFakeMotionEvent(display, -1, x + 100, y + 70, 0)
        xtst.XTestFakeButtonEvent(display, 1, True, 0)
        xtst.XTestFakeButtonEvent(display, 1, False, 0)
        x11.XFlush(display)
        x11.XCloseDisplay(display)
        return False

    GLib.timeout_add(1500, start_music)

    def event_sound():
        moment = time.monotonic() - started
        result = subprocess.run(
            ["canberra-gtk-play", "--id=camera-shutter", "--cache-control=never",
             "--property=media.role=event", "--property=application.name=CloudTune synthetic event probe"],
            stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, timeout=4,
        )
        data["eventSounds"].append({"elapsed": round(moment, 4), "exitCode": result.returncode,
                                   "error": result.stderr.strip()[:300]})
        return False

    for second in ([7] if args.events == 1 else [7, 10, 13]):
        GLib.timeout_add_seconds(second, event_sound)

    def finished():
        data["duration"] = round(time.monotonic() - started, 4)
        Path(args.worker_report).write_text(json.dumps(data, indent=2) + "\n")
        web.stop_loading()
        window.destroy()
        Gtk.main_quit()
        return False

    GLib.timeout_add_seconds(19, finished)
    Gtk.main()


def measure(path):
    import numpy as np
    stereo = np.fromfile(path, dtype="<i2")
    stereo = stereo[:len(stereo) // 2 * 2].reshape(-1, 2).astype(np.float64) / 32768
    mono = stereo.mean(axis=1)
    size = 12000  # 250 ms at the explicitly selected 48 kHz recording rate.
    chunks = []
    for offset in range(0, len(mono) - size + 1, size):
        chunk = mono[offset:offset + size]
        # The 440 Hz bin isolates music from the unrelated transient camera sound.
        basis = np.exp(-2j * np.pi * 440 * np.arange(size) / 48000)
        tone = float(abs(np.dot(chunk, basis)) * 2 / size)
        chunks.append({"second": round(offset / 48000, 2),
                       "rms": round(float(np.sqrt(np.mean(chunk * chunk))), 7),
                       "tone440Amplitude": round(tone, 7)})
    before = [c for c in chunks if 3 <= c["second"] < 6]
    # WebKit cold startup varies. Start the baseline at actual nonzero output,
    # then retain every following chunk so a real gap still fails the check.
    onset = next((i for i, c in enumerate(before) if c["tone440Amplitude"] > 0.01), len(before))
    before = before[onset:]
    baseline = [c["tone440Amplitude"] for c in before]
    after = [c["tone440Amplitude"] for c in chunks if 16 <= c["second"] < 18]
    baseline_rms = [c["rms"] for c in before]
    event_rms = [c["rms"] for c in chunks if 6 <= c["second"] < 16]
    event_present = bool(baseline_rms and event_rms and max(event_rms) > max(baseline_rms) * 1.5)
    good = bool(len(baseline) >= 4 and after and min(baseline) > 0.01 and min(after) > min(baseline) * 0.8)
    return {"recordedSeconds": round(len(mono) / 48000, 3), "chunks": chunks,
            "baselineStartSecond": before[0]["second"] if before else None,
            "baselineChunks": len(baseline),
            "baseline440Min": round(min(baseline), 7) if baseline else None,
            "after440Min": round(min(after), 7) if after else None,
            "cameraSoundTransientObserved": event_present,
            "nonzeroMusicBeforeAndAfter": good}


def main(args):
    required = ["pipewire", "pipewire-pulse", "wireplumber", "pw-dump", "pw-record",
                "canberra-gtk-play", "xvfb-run", "dbus-daemon"]
    missing = [name for name in required if not shutil.which(name)]
    if missing:
        raise RuntimeError("Missing dependencies: " + ", ".join(missing))
    output = ROOT / ".local" / ("audio-output-probe-" + time.strftime("%Y%m%d-%H%M%S"))
    output.mkdir(parents=True)
    original_defaults = system_defaults()
    processes = []
    handles = []
    report = {"purpose": "Synthetic WebKit music and camera-shutter event audio only",
              "capturesRealUserAudio": False, "cases": [], "ok": False,
              "notCovered": ["Physical audio hardware", "Production CloudTune process",
                             "Network/codec-specific audio", "Screenshot tool window-focus behavior"]}
    # Short private socket paths avoid AF_UNIX length limits in non-ASCII workspaces.
    with tempfile.TemporaryDirectory(prefix="cloudtune-audio-probe-") as temp:
        runtime = Path(temp)
        os.chmod(runtime, 0o700)
        env = os.environ.copy()
        env.update({"XDG_RUNTIME_DIR": str(runtime), "PIPEWIRE_RUNTIME_DIR": str(runtime),
                    "PIPEWIRE_REMOTE": "pipewire-0", "PULSE_SERVER": "unix:" + str(runtime / "pulse/native"),
                    "DBUS_SESSION_BUS_ADDRESS": "unix:path=" + str(runtime / "bus"),
                    "PULSE_SINK": SINK, "CANBERRA_DRIVER": "pulse", "GDK_BACKEND": "x11",
                    "NO_AT_BRIDGE": "1",
                    "XDG_CONFIG_HOME": str(runtime / "config"), "XDG_DATA_HOME": str(runtime / "data"),
                    "XDG_STATE_HOME": str(runtime / "state"),
                    "WIREPLUMBER_CONFIG_DIR": str(runtime / "wireplumber"),
                    # Prevent autoaudiosink fallback from opening actual hardware.
                    "GST_PLUGIN_FEATURE_RANK": "pulsesink:1000,alsasink:0,pipewiresink:0,osssink:0,oss4sink:0,jackaudiosink:0"})
        for name in ["config", "data", "state", "wireplumber"]:
            (runtime / name).mkdir()
        shutil.copyfile("/usr/share/wireplumber/wireplumber.conf", runtime / "wireplumber/wireplumber.conf")
        config = runtime / "pipewire-probe.conf"
        config.write_text('''context.properties = {
 core.daemon = true
 core.name = pipewire-0
 default.clock.rate = 48000
 default.clock.quantum = 1024
}
context.spa-libs = { audio.convert.* = audioconvert/libspa-audioconvert support.* = support/libspa-support }
context.modules = [
 { name = libpipewire-module-protocol-native }
 { name = libpipewire-module-client-node }
 { name = libpipewire-module-metadata }
 { name = libpipewire-module-spa-node-factory }
 { name = libpipewire-module-adapter }
 { name = libpipewire-module-link-factory }
 { name = libpipewire-module-access args = { access.force = unrestricted } }
]
context.objects = [
 { factory = adapter args = {
    factory.name = support.null-audio-sink
    node.name = cloudtune_audio_probe_null
    node.description = "CloudTune synthetic null output"
    media.class = Audio/Sink
    audio.position = [ FL FR ]
    node.driver = true
    priority.driver = 100
 } }
]
''')
        pulse = runtime / "pulse-probe.conf"
        pulse.write_text('''context.spa-libs = { audio.convert.* = audioconvert/libspa-audioconvert support.* = support/libspa-support }
context.modules = [
 { name = libpipewire-module-protocol-native }
 { name = libpipewire-module-client-node }
 { name = libpipewire-module-adapter }
 { name = libpipewire-module-metadata }
 { name = libpipewire-module-protocol-pulse }
]
pulse.properties = { server.address = [ "unix:native" ] }
''')

        def launch(command, name, process_env=env):
            log = (output / (name + ".log")).open("wb")
            handles.append(log)
            process = subprocess.Popen(command, env=process_env, stdout=log, stderr=log, start_new_session=True)
            processes.append(process)
            return process

        try:
            launch(["dbus-daemon", "--session", "--nofork", "--address=" + env["DBUS_SESSION_BUS_ADDRESS"]], "dbus")
            launch(["pipewire", "-c", str(config)], "pipewire")
            for _ in range(40):
                if (runtime / "pipewire-0").exists():
                    break
                time.sleep(0.1)
            if not (runtime / "pipewire-0").exists():
                raise RuntimeError("Private PipeWire failed to start")
            launch(["wireplumber", "-p", "policy"], "wireplumber")
            launch(["pipewire-pulse", "-c", str(pulse)], "pulse")
            for _ in range(40):
                if (runtime / "pulse/native").exists():
                    break
                time.sleep(0.1)
            if not (runtime / "pulse/native").exists():
                raise RuntimeError("Private Pulse server failed to start")
            time.sleep(0.7)
            report["isolation"] = assert_private_graph(env)
            cases = [(48000, 1)] if args.quick else [(44100, 1), (48000, 1), (44100, 3), (48000, 3)]
            for rate, event_count in cases:
                label = f"{rate}hz-{event_count}events"
                case_dir = output / label
                case_dir.mkdir()
                assert_private_graph(env)
                raw = case_dir / "synthetic-output.s16le"
                capture = launch(["pw-record", "--target", SINK, "--rate", "48000", "--channels", "2",
                                  "--format", "s16", "--raw", str(raw)], label + "-capture")
                time.sleep(0.2)
                case_env = env.copy()
                case_env.update({"GST_DEBUG": "pulse:3,audiobasesink:3",
                                 "GST_DEBUG_FILE": str(case_dir / "gstreamer.log")})
                worker_report = case_dir / "web-state.json"
                process = launch(["xvfb-run", "-a", "/usr/bin/python3", str(Path(__file__).resolve()),
                                  "--worker", "--rate", str(rate), "--events", str(event_count),
                                  "--worker-report", str(worker_report)], label + "-webkit", case_env)
                process.wait(timeout=28)
                os.killpg(capture.pid, signal.SIGINT)
                capture.wait(timeout=5)
                assert_private_graph(env)
                if process.returncode or not worker_report.exists():
                    raise RuntimeError(f"WebKit worker failed for {label}; see private log")
                state = json.loads(worker_report.read_text())
                measurement = measure(raw)
                events_ok = len(state["eventSounds"]) == event_count and all(e["exitCode"] == 0 for e in state["eventSounds"])
                case = {"case": label, "eventSounds": state["eventSounds"],
                        "webkitVersion": state.get("webkitVersion"),
                        "playingTicks": sum(s["event"] == "tick" and not s["paused"] for s in state["states"]),
                        "measurement": measurement, "ok": events_ok and measurement["cameraSoundTransientObserved"]
                        and measurement["nonzeroMusicBeforeAndAfter"]}
                report["cases"].append(case)
                print(json.dumps({"case": label, "ok": case["ok"],
                                  "baseline440Min": measurement["baseline440Min"],
                                  "after440Min": measurement["after440Min"],
                                  "eventExitCodes": [e["exitCode"] for e in state["eventSounds"]]}), flush=True)
            report["ok"] = all(case["ok"] for case in report["cases"])
        except Exception as error:
            report["error"] = str(error)
        finally:
            for process in reversed(processes):
                if process.poll() is None:
                    try:
                        os.killpg(process.pid, signal.SIGTERM)
                        process.wait(timeout=3)
                    except (ProcessLookupError, subprocess.TimeoutExpired):
                        try:
                            os.killpg(process.pid, signal.SIGKILL)
                            process.wait(timeout=3)
                        except ProcessLookupError:
                            pass
            for log in handles:
                log.close()
            report["userDefaultTargetsUnchanged"] = original_defaults == system_defaults()
            report["ok"] = report["ok"] and report["userDefaultTargetsUnchanged"]
            (output / "report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps({"report": str(output / "report.json"), "ok": report["ok"],
                      "error": report.get("error")}, ensure_ascii=False), flush=True)
    return 0 if report["ok"] else 1


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--quick", action="store_true", help="Run only one 48 kHz / one-event baseline")
    parser.add_argument("--worker", action="store_true", help=argparse.SUPPRESS)
    parser.add_argument("--rate", type=int, default=48000, help=argparse.SUPPRESS)
    parser.add_argument("--events", type=int, default=1, help=argparse.SUPPRESS)
    parser.add_argument("--worker-report", help=argparse.SUPPRESS)
    arguments = parser.parse_args()
    if arguments.worker:
        worker(arguments)
    else:
        sys.exit(main(arguments))
