#!/usr/bin/env python3
"""Record a native test command without changing or skipping its actions.

Usage: record-ui-test.py ios SIMULATOR_UUID video.mp4 -- xcodebuild ...
       record-ui-test.py android SERIAL video.mp4 -- adb ... am instrument ...
Requires xcrun or adb on PATH, plus ffmpeg for Android clips over 180 seconds.
"""
import argparse
import os
from pathlib import Path
import shlex
import signal
import subprocess
import time

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("platform", choices=["ios", "android"])
parser.add_argument("device")
parser.add_argument("output", type=Path)
parser.add_argument("command", nargs=argparse.REMAINDER)
args = parser.parse_args()
command = args.command[1:] if args.command[:1] == ["--"] else args.command
if not command:
    parser.error("Pass the native test command after --")
output = args.output.resolve()
output.parent.mkdir(parents=True, exist_ok=True)
if output.exists():
    parser.error("Output already exists; use a new filename to preserve evidence")

def adb(*parts, **kwargs):
    return subprocess.run(["adb", "-s", args.device, *parts], check=True, **kwargs)

if args.platform == "ios":
    recorder = subprocess.Popen(["xcrun", "simctl", "io", args.device, "recordVideo", "--codec=h264", str(output)])
    try:
        result = subprocess.run(command)
    finally:
        recorder.send_signal(signal.SIGINT)
        recorder.wait(timeout=30)
else:
    clips = []
    test = None
    try:
        while test is None or test.poll() is None:
            index = len(clips)
            remote = f"/sdcard/statement-qa-{os.getpid()}-{index}.mp4"
            # Redirect all child streams so adb returns the recorder PID immediately.
            shell = f"screenrecord --bit-rate 3000000 --time-limit 180 {shlex.quote(remote)} </dev/null >/dev/null 2>&1 & echo $!"
            pid = int(adb("shell", shell, capture_output=True, text=True).stdout.strip())
            if test is None:
                test = subprocess.Popen(command)
            started = time.monotonic()
            while test.poll() is None and time.monotonic() - started < 179:
                time.sleep(0.25)
            subprocess.run(["adb", "-s", args.device, "shell", "kill", "-2", str(pid)], check=False)
            time.sleep(1)
            clip = output.with_name(f"{output.stem}-part-{index}.mp4")
            adb("pull", remote, str(clip))
            clips.append(clip)
        result = test
    finally:
        if test is not None and test.poll() is None:
            test.terminate()
    if len(clips) == 1:
        clips[0].rename(output)
    else:
        playlist = output.with_suffix(".concat.txt")
        playlist.write_text("".join(f"file '{clip.name}'\n" for clip in clips))
        subprocess.run(["ffmpeg", "-v", "error", "-f", "concat", "-safe", "0", "-i", str(playlist), "-c", "copy", str(output)], check=True)
raise SystemExit(result.returncode)
