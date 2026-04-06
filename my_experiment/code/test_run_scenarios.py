#!/usr/bin/env python3
"""
Integration test: run each debug scenario for ~15s via process_video_qrcode.

Usage:  uv run python test_run_scenarios.py [--case N]
"""

import argparse
import os
import signal
import subprocess
import sys
import time
import threading
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
MY_EXP = ROOT / "my_experiment"
TRACE_DIR = MY_EXP / "file" / "trace_logs"
CODE_DIR = MY_EXP / "code"
DATA_DIR = MY_EXP / "data"
RESULT_DIR = MY_EXP / "result"
VIDEO = DATA_DIR / "test_qrcode.yuv"

RUN_TIMEOUT = 90  # seconds to wait before killing


def generate_trace(mbps, dur):
    interval = 12.0 / mbps
    lines, t = [], 1.0
    while t <= dur * 1000:
        lines.append(str(round(t)))
        t += interval
    return "\n".join(lines)


def generate_bursty_trace(hi, lo, burst, stall, dur):
    lines, t = [], 1.0
    cycle = burst + stall
    while t <= dur * 1000:
        mbps = hi if (t % cycle) < burst else lo
        lines.append(str(round(t)))
        t += 12.0 / mbps
    return "\n".join(lines)


SCENARIOS = [
    {"id": "codec_blockage",    "name": "Case 1: Codec Blockage",    "bw": 12, "lo": 0.5,  "burst": 500,  "stall": 200,  "mm": True,  "ft": ""},
    {"id": "frame_overshoot",   "name": "Case 2: Frame Overshoot",   "bw": 4,  "lo": 4,    "burst": 0,    "stall": 0,    "mm": True,  "ft": ""},
    {"id": "cca_late_response", "name": "Case 3: CCA Late Response", "bw": 30, "lo": 5,    "burst": 5000, "stall": 5000, "mm": True,  "ft": ""},
    {"id": "pacing_queuing",    "name": "Case 4: Pacing Queuing",    "bw": 20, "lo": 20,   "burst": 0,    "stall": 0,    "mm": True,  "ft": ""},
    {"id": "rtx_overshoot",     "name": "Case 5: RTX/FEC Overshoot", "bw": 8,  "lo": 8,    "burst": 0,    "stall": 0,    "mm": True,  "ft": ""},
    {"id": "latency_rise",      "name": "Case 6: Latency Rise",      "bw": 12, "lo": 1,    "burst": 8000, "stall": 3000, "mm": True,  "ft": ""},
    {"id": "loss_rise",         "name": "Case 7: Loss Rise",         "bw": 12, "lo": 12,   "burst": 0,    "stall": 0,    "mm": True,  "ft": ""},
    {"id": "no_mahimahi",       "name": "Case 0: Baseline",          "bw": 0,  "lo": 0,    "burst": 0,    "stall": 0,    "mm": False, "ft": ""},
]


def kill_all():
    for n in ["peerconnection_server", "peerconnection_localvideo", "mm-link", "mm-delay"]:
        subprocess.run(["pkill", "-9", "-f", n], capture_output=True)
    time.sleep(1)


def create_trace(scen):
    name = f"debug_{scen['id']}"
    if scen["burst"] > 0 and scen["stall"] > 0 and scen["bw"] != scen["lo"]:
        content = generate_bursty_trace(scen["bw"], scen["lo"], scen["burst"], scen["stall"], 60)
    else:
        content = generate_trace(scen["bw"], 60)
    (TRACE_DIR / f"{name}.log").write_text(content)
    return name


def run_case(scen):
    print(f"\n{'='*60}")
    print(f"  {scen['name']}")
    print(f"{'='*60}")

    kill_all()

    if scen["mm"]:
        trace_name = create_trace(scen)
    else:
        trace_name = ""

    output_dir = f"_test_{scen['id']}/output_1"
    # Clean previous
    test_dir = RESULT_DIR / f"_test_{scen['id']}"
    if test_dir.exists():
        subprocess.run(["rm", "-rf", str(test_dir)], capture_output=True)

    # Run via process_video_qrcode.send_and_recv_video in a subprocess
    script = f"""
import os, sys, argparse, signal, time
os.chdir('{CODE_DIR}')
sys.path.insert(0, '.')
import process_video_qrcode as pvq

cfg = argparse.Namespace(
    data='test',
    width=1920, height=1080, fps=24,
    output_dir='{output_dir}',
    server_ip='127.0.0.1', port=8888,
    enable_mahimahi={'True' if scen['mm'] else 'False'},
    trace_file='{trace_name}',
    enable_loss_trace=False,
    delay_ms=0,
    field_trials='{scen["ft"]}',
)

pvq.send_and_recv_video(cfg)
"""

    print(f"  Starting experiment (timeout={RUN_TIMEOUT}s)...")
    proc = subprocess.Popen(
        [sys.executable, "-c", script],
        cwd=str(CODE_DIR),
        stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
        text=True, preexec_fn=os.setsid
    )

    # Collect output with timeout
    output_lines = []
    def reader():
        for line in proc.stdout:
            output_lines.append(line.rstrip())
    t = threading.Thread(target=reader, daemon=True)
    t.start()

    try:
        proc.wait(timeout=RUN_TIMEOUT)
    except subprocess.TimeoutExpired:
        print(f"  Timeout after {RUN_TIMEOUT}s — killing")
        os.killpg(proc.pid, signal.SIGKILL)
        proc.wait()

    t.join(timeout=2)
    kill_all()

    # Check results
    rec_dir = RESULT_DIR / output_dir / "rec" / "test"
    recv_log = rec_dir / "recv.log"
    send_log = rec_dir / "send.log"
    recon = rec_dir / "recon.yuv"

    recv_text = recv_log.read_text() if recv_log.exists() else ""
    send_text = send_log.read_text() if send_log.exists() else ""
    recon_size = recon.stat().st_size if recon.exists() else 0

    recv_frames = recv_text.count("FRAME_DECODE")
    send_frames = send_text.count("FRAME_ENCODE")

    print(f"  recon: {recon_size/(1024*1024):.1f}MB, recv_frames: {recv_frames}, send_frames: {send_frames}")
    print(f"  recv.log: {len(recv_text)} bytes, send.log: {len(send_text)} bytes")

    # Check for errors
    full_out = "\n".join(output_lines)
    for err in ["error opening", "setuid root", "Connection refused"]:
        if err in full_out or err in recv_text:
            print(f"  ERROR: {err}")
            # Show context
            for line in (output_lines + recv_text.split('\n')):
                if err in line:
                    print(f"    > {line[:200]}")
                    break
            return False, err

    if recon_size > 0 and recv_frames > 0:
        return True, f"{recon_size/(1024*1024):.0f}MB, {recv_frames} decoded"
    elif send_frames > 0:
        return True, f"partial: {send_frames} encoded, {recv_frames} decoded"
    else:
        print(f"  subprocess output (last 10 lines):")
        for line in output_lines[-10:]:
            print(f"    {line}")
        if recv_text:
            print(f"  recv.log (first 10 lines):")
            for line in recv_text.split('\n')[:10]:
                print(f"    {line}")
        return False, "No data transmitted"


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--case", type=int, default=-1)
    args = parser.parse_args()

    if not VIDEO.exists():
        print(f"FATAL: {VIDEO} not found"); return 1

    scenarios = SCENARIOS
    if args.case >= 0 and args.case < len(SCENARIOS):
        scenarios = [SCENARIOS[args.case]]

    results = []
    for scen in scenarios:
        ok, msg = run_case(scen)
        results.append((scen["name"], ok, msg))

    # Cleanup
    kill_all()
    for scen in SCENARIOS:
        d = RESULT_DIR / f"_test_{scen['id']}"
        if d.exists():
            subprocess.run(["rm", "-rf", str(d)], capture_output=True)

    print(f"\n{'='*60}")
    print("SUMMARY:")
    all_pass = True
    for name, ok, msg in results:
        s = "PASS" if ok else "FAIL"
        if not ok: all_pass = False
        print(f"  {s}  {name}: {msg}")
    print(f"\n{'ALL PASSED' if all_pass else 'SOME FAILED'}")
    return 0 if all_pass else 1


if __name__ == "__main__":
    sys.exit(main())
