#!/usr/bin/env python3
"""
Test that all 7 debug scenarios generate valid trace files
and produce runnable MahiMahi commands.

Run from my_experiment/code/:
    python test_scenarios.py
"""

import os
import subprocess
import sys
import tempfile
from pathlib import Path

MAHIMAHI_PATH = "/home/marco/networking/sparkrtc-public/mahimahi/src/frontend/"
TRACE_DIR = Path(__file__).parent.parent / "file" / "trace_logs"
LOSS_TRACE_PATH = Path(__file__).parent.parent / "file" / "loss_trace"

# Reproduce the TypeScript trace generators in Python
def generate_trace(mbps: float, duration_sec: int) -> str:
    interval = 12.0 / mbps
    lines = []
    t = 1.0
    end = duration_sec * 1000
    while t <= end:
        lines.append(str(round(t)))
        t += interval
    return "\n".join(lines)


def generate_bursty_trace(high_mbps: float, low_mbps: float,
                          burst_ms: int, stall_ms: int, duration_sec: int) -> str:
    lines = []
    t = 1.0
    end = duration_sec * 1000
    cycle = burst_ms + stall_ms
    while t <= end:
        cycle_pos = t % cycle
        mbps = high_mbps if cycle_pos < burst_ms else low_mbps
        interval = 12.0 / mbps
        lines.append(str(round(t)))
        t += interval
    return "\n".join(lines)


def generate_loss_trace(loss_rate: float, duration_sec: int, interval_ms: int = 100) -> str:
    lines = []
    for t in range(0, duration_sec * 1000 + 1, interval_ms):
        lines.append(f"{t},{loss_rate}")
    return "\n".join(lines)


# Define all 7 scenarios with their parameters matching debugScenarios.ts
SCENARIOS = [
    {
        "id": "codec_blockage",
        "name": "Codec Blockage (AFR NSDI'23)",
        "bw": 12, "bw_low": 0.5, "burst_ms": 500, "stall_ms": 200,
        "loss_rate": 0, "delay_ms": 0, "duration": 30,
        "enable_mahimahi": True, "enable_loss_trace": False,
        "field_trials": "WebRTC-TasksetReceiver/c0/",
    },
    {
        "id": "frame_overshoot",
        "name": "Frame Size Overshoot (BurstRTC ICNP'24)",
        "bw": 4, "bw_low": 4, "burst_ms": 0, "stall_ms": 0,
        "loss_rate": 0, "delay_ms": 0, "duration": 30,
        "enable_mahimahi": True, "enable_loss_trace": False,
        "field_trials": "",
    },
    {
        "id": "cca_late_response",
        "name": "CCA Late Response (Pudica NSDI'24)",
        "bw": 30, "bw_low": 5, "burst_ms": 5000, "stall_ms": 5000,
        "loss_rate": 0, "delay_ms": 0, "duration": 30,
        "enable_mahimahi": True, "enable_loss_trace": False,
        "field_trials": "",
    },
    {
        "id": "pacing_queuing",
        "name": "Pacing Queuing (ACE SIGCOMM'25)",
        "bw": 20, "bw_low": 20, "burst_ms": 0, "stall_ms": 0,
        "loss_rate": 0, "delay_ms": 0, "duration": 30,
        "enable_mahimahi": True, "enable_loss_trace": False,
        "field_trials": "",
    },
    {
        "id": "rtx_overshoot",
        "name": "RTX/FEC Overshoot (Tooth/Hairpin)",
        "bw": 8, "bw_low": 8, "burst_ms": 0, "stall_ms": 0,
        "loss_rate": 5, "delay_ms": 0, "duration": 30,
        "enable_mahimahi": True, "enable_loss_trace": True,
        "field_trials": "",
    },
    {
        "id": "latency_rise",
        "name": "Latency Rise (Zhuge/AUGUR)",
        "bw": 12, "bw_low": 1, "burst_ms": 8000, "stall_ms": 3000,
        "loss_rate": 0, "delay_ms": 0, "duration": 30,
        "enable_mahimahi": True, "enable_loss_trace": False,
        "field_trials": "",
    },
    {
        "id": "loss_rise",
        "name": "Loss Rise (Hairpin/Tambur)",
        "bw": 12, "bw_low": 12, "burst_ms": 0, "stall_ms": 0,
        "loss_rate": 10, "delay_ms": 0, "duration": 30,
        "enable_mahimahi": True, "enable_loss_trace": True,
        "field_trials": "",
    },
]


def build_mahimahi_command(trace_file: str, delay_ms: int, enable_loss_trace: bool) -> str:
    """Reproduce the command built by process_video_qrcode.py"""
    trace_path = str(TRACE_DIR / f"{trace_file}.log")
    cmd = ""
    if delay_ms > 0:
        cmd += f"{MAHIMAHI_PATH}mm-delay {delay_ms} "
    cmd += f"{MAHIMAHI_PATH}mm-link {trace_path} {trace_path}"
    if enable_loss_trace:
        cmd += (f" {MAHIMAHI_PATH}mm-loss-trace downlink"
                f" --trace-file={LOSS_TRACE_PATH}"
                f" --configure-file=/tmp/mahimahi_loss_config")
    return cmd


def test_scenario(scen: dict) -> list[str]:
    """Test a single scenario. Returns list of error messages (empty = pass)."""
    errors = []
    sid = scen["id"]
    trace_name = f"debug_{sid}"

    # 1. Generate trace content
    if scen["burst_ms"] > 0 and scen["stall_ms"] > 0 and scen["bw"] != scen["bw_low"]:
        content = generate_bursty_trace(
            scen["bw"], scen["bw_low"],
            scen["burst_ms"], scen["stall_ms"],
            scen["duration"]
        )
    else:
        content = generate_trace(scen["bw"], scen["duration"])

    lines = content.strip().split("\n")

    # 2. Validate trace content
    if len(lines) < 10:
        errors.append(f"Trace too short: {len(lines)} lines")

    for i, line in enumerate(lines[:5] + lines[-3:]):
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        try:
            ts = int(line)
            if ts <= 0:
                errors.append(f"Invalid timestamp {ts} at line {i}")
        except ValueError:
            errors.append(f"Non-integer line: '{line}'")

    # Check timestamps are monotonically increasing
    timestamps = [int(l) for l in lines if l.strip() and not l.startswith("#")]
    for i in range(1, min(100, len(timestamps))):
        if timestamps[i] < timestamps[i-1]:
            errors.append(f"Non-monotonic timestamp at index {i}: {timestamps[i-1]} -> {timestamps[i]}")
            break

    # 3. Write trace file
    trace_path = TRACE_DIR / f"{trace_name}.log"
    TRACE_DIR.mkdir(parents=True, exist_ok=True)
    trace_path.write_text(content)
    if not trace_path.exists():
        errors.append(f"Failed to write trace: {trace_path}")

    # 4. Generate and write loss trace if needed
    if scen["enable_loss_trace"] and scen["loss_rate"] > 0:
        loss_content = generate_loss_trace(scen["loss_rate"] / 100.0, scen["duration"])
        LOSS_TRACE_PATH.write_text(loss_content)
        if not LOSS_TRACE_PATH.exists():
            errors.append("Failed to write loss trace")
        loss_lines = loss_content.strip().split("\n")
        for ll in loss_lines[:3]:
            parts = ll.split(",")
            if len(parts) != 2:
                errors.append(f"Bad loss trace format: '{ll}'")
                break
            try:
                ts = int(parts[0])
                rate = float(parts[1])
                if rate < 0 or rate > 1:
                    errors.append(f"Loss rate out of range: {rate}")
            except ValueError:
                errors.append(f"Bad loss trace values: '{ll}'")

    # 5. Build MahiMahi command and verify binaries exist
    cmd = build_mahimahi_command(trace_name, scen["delay_ms"], scen["enable_loss_trace"])

    mm_link = Path(f"{MAHIMAHI_PATH}mm-link")
    mm_delay = Path(f"{MAHIMAHI_PATH}mm-delay")
    mm_loss = Path(f"{MAHIMAHI_PATH}mm-loss-trace")

    if not mm_link.exists():
        errors.append(f"mm-link not found: {mm_link}")
    elif not (mm_link.stat().st_mode & 0o4000):
        errors.append(f"mm-link missing setuid bit")

    if scen["delay_ms"] > 0:
        if not mm_delay.exists():
            errors.append(f"mm-delay not found")
        elif not (mm_delay.stat().st_mode & 0o4000):
            errors.append(f"mm-delay missing setuid bit")

    if scen["enable_loss_trace"]:
        if not mm_loss.exists():
            errors.append(f"mm-loss-trace not found")
        elif not (mm_loss.stat().st_mode & 0o4000):
            errors.append(f"mm-loss-trace missing setuid bit")

    # 6. Verify trace file is readable by mm-link (quick dry-run)
    # mm-link just needs to open the file; we verify it's a valid trace by
    # checking first and last timestamps
    if len(timestamps) > 0:
        if timestamps[0] < 1:
            errors.append(f"First timestamp must be >= 1, got {timestamps[0]}")
        duration_actual_ms = timestamps[-1]
        expected_ms = scen["duration"] * 1000
        if duration_actual_ms < expected_ms * 0.9:
            errors.append(f"Trace duration {duration_actual_ms}ms < expected {expected_ms}ms")

    return errors


def test_delay_variants():
    """Test that delay_ms parameter generates correct command."""
    errors = []

    # Test with delay
    cmd = build_mahimahi_command("debug_codec_blockage", 20, False)
    if "mm-delay 20" not in cmd:
        errors.append(f"mm-delay not in command: {cmd}")
    if cmd.index("mm-delay") > cmd.index("mm-link"):
        errors.append("mm-delay must come before mm-link")

    # Test without delay
    cmd = build_mahimahi_command("debug_codec_blockage", 0, False)
    if "mm-delay" in cmd:
        errors.append(f"mm-delay should not be in command when delay=0: {cmd}")

    # Test with loss
    cmd = build_mahimahi_command("debug_rtx_overshoot", 0, True)
    if "mm-loss-trace" not in cmd:
        errors.append(f"mm-loss-trace not in command: {cmd}")

    return errors


def main():
    print("=" * 60)
    print("Testing all 7 debug scenarios")
    print("=" * 60)

    all_pass = True

    for scen in SCENARIOS:
        errors = test_scenario(scen)
        status = "PASS" if not errors else "FAIL"
        if errors:
            all_pass = False

        print(f"\n{'PASS' if not errors else 'FAIL'}  {scen['name']}")
        print(f"     id={scen['id']}, bw={scen['bw']}Mbps", end="")
        if scen["bw"] != scen["bw_low"]:
            print(f"/{scen['bw_low']}Mbps burst={scen['burst_ms']}ms/stall={scen['stall_ms']}ms", end="")
        if scen["loss_rate"] > 0:
            print(f", loss={scen['loss_rate']}%", end="")
        if scen["delay_ms"] > 0:
            print(f", delay={scen['delay_ms']}ms", end="")
        print()

        trace_path = TRACE_DIR / f"debug_{scen['id']}.log"
        if trace_path.exists():
            lines = trace_path.read_text().strip().split("\n")
            timestamps = [int(l) for l in lines if l.strip()]
            print(f"     trace: {len(lines)} lines, {timestamps[0]}ms → {timestamps[-1]}ms")

        for e in errors:
            print(f"     ERROR: {e}")

    # Test delay variants
    print(f"\n--- Delay command tests ---")
    delay_errors = test_delay_variants()
    if delay_errors:
        all_pass = False
        for e in delay_errors:
            print(f"FAIL  {e}")
    else:
        print("PASS  mm-delay command generation correct")

    print(f"\n{'=' * 60}")
    if all_pass:
        print("ALL TESTS PASSED")
    else:
        print("SOME TESTS FAILED")
    print("=" * 60)

    return 0 if all_pass else 1


if __name__ == "__main__":
    sys.exit(main())
