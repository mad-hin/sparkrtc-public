"""
LLM-based analysis of SparkRTC experiment results via OpenRouter.

Summarises raw log files into compact statistics, then streams an
analysis from any model available on OpenRouter (Claude, GPT, Gemini, …).
"""

import re
import numpy as np
from openai import OpenAI

SYSTEM_PROMPT = """\
You are a WebRTC video streaming performance analyst. You analyse experiment \
results from SparkRTC, a low-latency WebRTC fork. You receive summary \
statistics from per-frame instrumentation AND periodic WebRTC getStats() \
snapshots covering the full encode-transport-decode pipeline.

Structure your analysis by layer, checking for these specific anomaly types:

## Network Layer
- **Latency Abnormal**: RTT p95 >100ms or high variance; end-to-end delay >200ms
- **Loss Abnormal**: packet loss rate >1%; sequence number gaps; fractionLost >0.02

## Transport Layer
- **RTX (retransmission)**: retransmittedPacketsSent >0 indicates loss recovery is active; \
high retransmission ratio suggests persistent loss
- **FEC**: fecPacketsSent >0 means forward error correction is active; \
high fecPacketsDiscarded suggests FEC overhead without benefit
- **Rate Control — Late Response**: delay between congestion signal and bitrate drop; \
targetBitrate stays high while loss increases
- **Rate Control — Insufficient Degree**: targetBitrate drops but not enough to match \
available bandwidth; persistent loss after adaptation

## Application Layer
- **Capturer — Frame Interval Anomaly**: FRAME_CAPTURE interval stddev >20% of expected; \
irregular frame production
- **Codec — Frame Size Overshoots**: encoded frame >3x median size; I-frame bursts
- **Codec — Coding Queuing**: FRAME_CAPTURE to FRAME_ENCODE_START gap >10ms
- **Codec — Coding Blockage**: encode duration >2x median; qualityLimitationReason=cpu

For each anomaly found:
1. State the anomaly type and which layer it belongs to
2. Show the evidence (specific metric values)
3. Diagnose the root cause
4. Recommend a fix

Metric reference:
- Delay (ms): <100 excellent, 100-200 acceptable, >200 problematic
- SSIM (0-1): >0.95 excellent, 0.90-0.95 good, <0.90 visible degradation
- PSNR (dB): >40 excellent, 30-40 good, <30 poor
- RTT (s): <0.05 excellent, 0.05-0.15 acceptable, >0.15 high
- Jitter (s): <0.01 good, >0.03 problematic

Rate the result 1-5 for: latency, quality, stability. \
Be concise but thorough. Highlight the most important findings first.\
"""


# ---------------------------------------------------------------------------
# Log parsing helpers
# ---------------------------------------------------------------------------

def _parse_csv_column(text, col_index, skip_header=False):
    """Extract a numeric column from comma-separated text."""
    values = []
    for i, line in enumerate(text.strip().splitlines()):
        if skip_header and i == 0:
            continue
        parts = line.split(",")
        if len(parts) > col_index:
            try:
                values.append(float(parts[col_index]))
            except ValueError:
                pass
    return np.array(values)


def _percentiles(arr):
    if len(arr) == 0:
        return {}
    return {
        "count": len(arr),
        "mean": float(np.mean(arr)),
        "median": float(np.median(arr)),
        "std": float(np.std(arr)),
        "min": float(np.min(arr)),
        "p5": float(np.percentile(arr, 5)),
        "p25": float(np.percentile(arr, 25)),
        "p75": float(np.percentile(arr, 75)),
        "p95": float(np.percentile(arr, 95)),
        "p99": float(np.percentile(arr, 99)),
        "max": float(np.max(arr)),
    }


def _count_above(arr, thresholds):
    return {f">{t}": int(np.sum(arr > t)) for t in thresholds}


def _count_below(arr, thresholds):
    return {f"<{t}": int(np.sum(arr < t)) for t in thresholds}


def _parse_webrtc_events(text):
    """Count event types and extract timing from raw WebRTC log."""
    event_types = [
        "FRAME_CAPTURE", "FRAME_ENCODE_START", "FRAME_ENCODE_END",
        "PACKET_SEND", "PACKET_RECEIVE", "FRAME_DECODE_START", "FRAME_DECODE_END",
    ]
    counts = {e: 0 for e in event_types}
    kv_re = re.compile(r"(\w+)=([-\d]+)")

    encode_starts = {}
    encode_durations = []
    decode_starts = {}
    decode_durations = []
    packet_seqs = []

    for line in text.splitlines():
        for et in event_types:
            if et in line:
                counts[et] += 1
                idx = line.index(et)
                kv = dict(kv_re.findall(line[idx:]))

                if et == "FRAME_ENCODE_START":
                    fid = kv.get("frame_id") or kv.get("rtp_ts")
                    ts = kv.get("encode_start_us")
                    if fid and ts:
                        encode_starts[fid] = int(ts)
                elif et == "FRAME_ENCODE_END":
                    fid = kv.get("frame_id") or kv.get("rtp_ts")
                    ts = kv.get("encode_end_us")
                    if fid and ts and fid in encode_starts:
                        encode_durations.append(int(ts) - encode_starts[fid])
                elif et == "FRAME_DECODE_START":
                    fid = kv.get("frame_id") or kv.get("rtp_ts")
                    ts = kv.get("decode_start_us")
                    if fid and ts:
                        decode_starts[fid] = int(ts)
                elif et == "FRAME_DECODE_END":
                    fid = kv.get("frame_id") or kv.get("rtp_ts")
                    ts = kv.get("decode_end_us")
                    if fid and ts and fid in decode_starts:
                        decode_durations.append(int(ts) - decode_starts[fid])
                elif et in ("PACKET_SEND", "PACKET_RECEIVE"):
                    seq = kv.get("seq")
                    if seq:
                        packet_seqs.append(int(seq))
                break

    result = {"event_counts": counts}

    if encode_durations:
        arr = np.array(encode_durations)
        result["encode_duration_us"] = {
            "mean": float(np.mean(arr)),
            "max": float(np.max(arr)),
        }
    if decode_durations:
        arr = np.array(decode_durations)
        result["decode_duration_us"] = {
            "mean": float(np.mean(arr)),
            "max": float(np.max(arr)),
        }
    if packet_seqs:
        seqs = sorted(set(packet_seqs))
        expected = seqs[-1] - seqs[0] + 1 if len(seqs) > 1 else len(seqs)
        result["packet_info"] = {
            "unique_packets": len(seqs),
            "expected_packets": expected,
            "seq_gaps": expected - len(seqs),
        }

    return result


def _parse_webrtc_stats(text):
    """Parse WEBRTC_STATS lines from send.log/recv.log into per-type summaries."""
    kv_re = re.compile(r"(\w+)=([-\w./]+)")
    # Collect snapshots per type
    snapshots = {}  # type -> list of {field: value_str}

    for line in text.splitlines():
        if "WEBRTC_STATS," not in line:
            continue
        idx = line.index("WEBRTC_STATS,")
        kv = dict(kv_re.findall(line[idx:]))
        stat_type = kv.pop("type", None)
        if not stat_type:
            continue
        snapshots.setdefault(stat_type, []).append(kv)

    result = {}

    # Numeric fields to summarize per type
    numeric_fields = {
        "candidate-pair": [
            "currentRoundTripTime", "totalRoundTripTime",
            "availableOutgoingBitrate", "packetsSent", "packetsReceived",
            "bytesSent", "bytesReceived",
        ],
        "inbound-rtp": [
            "packetsReceived", "packetsLost", "jitter",
            "framesDecoded", "framesDropped", "framesReceived",
            "totalDecodeTime", "retransmittedPacketsReceived",
            "fecPacketsReceived", "fecPacketsDiscarded",
            "nackCount", "freezeCount", "totalFreezesDuration",
            "jitterBufferDelay",
        ],
        "outbound-rtp": [
            "packetsSent", "bytesSent",
            "retransmittedPacketsSent", "retransmittedBytesSent",
            "targetBitrate", "framesEncoded", "totalEncodeTime",
            "nackCount", "hugeFramesSent", "totalPacketSendDelay",
        ],
        "remote-inbound-rtp": [
            "roundTripTime", "totalRoundTripTime", "fractionLost",
            "roundTripTimeMeasurements",
        ],
    }

    for stat_type, rows in snapshots.items():
        if not rows:
            continue
        type_summary = {"snapshot_count": len(rows)}

        fields = numeric_fields.get(stat_type, [])
        for field in fields:
            vals = []
            for row in rows:
                v = row.get(field, "NA")
                if v != "NA":
                    try:
                        vals.append(float(v))
                    except ValueError:
                        pass
            if vals:
                arr = np.array(vals)
                # For cumulative counters, report last value and delta
                if field in ("packetsSent", "packetsReceived", "bytesSent",
                             "bytesReceived", "packetsLost", "framesDecoded",
                             "framesDropped", "framesReceived", "framesEncoded",
                             "retransmittedPacketsSent", "retransmittedBytesSent",
                             "retransmittedPacketsReceived",
                             "fecPacketsReceived", "fecPacketsDiscarded",
                             "nackCount", "hugeFramesSent",
                             "totalRoundTripTime", "roundTripTimeMeasurements",
                             "totalDecodeTime", "totalEncodeTime",
                             "totalPacketSendDelay", "totalFreezesDuration",
                             "freezeCount"):
                    type_summary[field] = {
                        "last": float(arr[-1]),
                        "first": float(arr[0]),
                        "delta": float(arr[-1] - arr[0]),
                    }
                else:
                    # Instantaneous values — show distribution
                    type_summary[field] = {
                        "mean": float(np.mean(arr)),
                        "min": float(np.min(arr)),
                        "max": float(np.max(arr)),
                        "p95": float(np.percentile(arr, 95)) if len(arr) >= 2 else float(arr[0]),
                    }

        # Non-numeric fields (e.g. qualityLimitationReason)
        if stat_type == "outbound-rtp":
            reasons = [r.get("qualityLimitationReason", "NA") for r in rows if r.get("qualityLimitationReason", "NA") != "NA"]
            if reasons:
                from collections import Counter
                type_summary["qualityLimitationReason"] = dict(Counter(reasons))

        result[stat_type] = type_summary

    return result


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def summarize_logs(logs):
    """
    Turn the dict returned by ``collect_logs()`` into compact statistics.

    Returns a dict suitable for formatting into the LLM prompt.
    """
    files = logs.get("files", {})
    summary = {}

    # --- delay (col 3: delay_ms) ---
    if "delay" in files and not files["delay"].startswith(("File not found", "Error")):
        arr = _parse_csv_column(files["delay"], 3)
        if len(arr):
            summary["delay"] = {**_percentiles(arr), **_count_above(arr, [100, 200, 500])}
            # Trend: compare first-quarter mean vs last-quarter mean
            q = max(1, len(arr) // 4)
            summary["delay"]["trend_start_mean"] = float(np.mean(arr[:q]))
            summary["delay"]["trend_end_mean"] = float(np.mean(arr[-q:]))

    # --- ssim (col 1) ---
    if "ssim" in files and not files["ssim"].startswith(("File not found", "Error")):
        arr = _parse_csv_column(files["ssim"], 1)
        if len(arr):
            summary["ssim"] = {**_percentiles(arr), **_count_below(arr, [0.9, 0.8])}

    # --- psnr (col 1) ---
    if "psnr" in files and not files["psnr"].startswith(("File not found", "Error")):
        arr = _parse_csv_column(files["psnr"], 1)
        if len(arr):
            summary["psnr"] = {**_percentiles(arr), **_count_below(arr, [30, 25])}

    # --- frame_size (col 3: bytes) ---
    if "frame_size" in files and not files["frame_size"].startswith(("File not found", "Error")):
        arr = _parse_csv_column(files["frame_size"], 3)
        if len(arr):
            median = float(np.median(arr))
            i_frames = int(np.sum(arr > 3 * median)) if median > 0 else 0
            summary["frame_size"] = {
                **_percentiles(arr),
                "total_bytes": int(np.sum(arr)),
                "i_frame_candidates": i_frames,
            }

    # --- rate (col 1: bitrate_kbps) ---
    if "rate" in files and not files["rate"].startswith(("File not found", "Error")):
        arr = _parse_csv_column(files["rate"], 1)
        if len(arr):
            mean = float(np.mean(arr))
            cv = float(np.std(arr) / mean) if mean > 0 else 0
            summary["rate"] = {**_percentiles(arr), "coeff_variation": cv}

    # --- send.log / recv.log (custom instrumentation) ---
    for key in ("send_log", "recv_log"):
        if key in files and not files[key].startswith(("File not found", "Error")):
            summary[key] = _parse_webrtc_events(files[key])

    # --- WEBRTC_STATS from send.log / recv.log (getStats() API) ---
    for key in ("send_log", "recv_log"):
        if key in files and not files[key].startswith(("File not found", "Error")):
            stats = _parse_webrtc_stats(files[key])
            if stats:
                summary[key + "_stats"] = stats

    # --- statistics.csv (already compact) ---
    if "statistics_csv" in files and not files["statistics_csv"].startswith(("File not found", "Error")):
        summary["statistics_csv"] = files["statistics_csv"].strip()

    return summary


def format_summary(logs, summary):
    """Format the summary dict as a readable text block for the LLM."""
    lines = []
    lines.append(f"Experiment: {logs.get('data_name', 'unknown')}")
    lines.append(f"Configuration: {logs.get('output_dir', 'unknown')}")
    lines.append(f"Host: {logs.get('host', 'unknown')}")
    lines.append(f"Timestamp: {logs.get('timestamp', 'unknown')}")
    lines.append("")

    def _fmt_section(title, data, unit=""):
        lines.append(f"## {title}")
        if isinstance(data, str):
            lines.append(data)
        elif isinstance(data, dict):
            for k, v in data.items():
                if isinstance(v, dict):
                    lines.append(f"  {k}:")
                    for kk, vv in v.items():
                        lines.append(f"    {kk}: {vv}")
                elif isinstance(v, float):
                    lines.append(f"  {k}: {v:.4f}{unit}")
                else:
                    lines.append(f"  {k}: {v}{unit}")
        lines.append("")

    if "delay" in summary:
        _fmt_section("Delay (ms)", summary["delay"], " ms")
    if "ssim" in summary:
        _fmt_section("Video Quality — SSIM", summary["ssim"])
    if "psnr" in summary:
        _fmt_section("Video Quality — PSNR (dB)", summary["psnr"], " dB")
    if "frame_size" in summary:
        _fmt_section("Frame Size (bytes)", summary["frame_size"])
    if "rate" in summary:
        _fmt_section("Bitrate (kbps)", summary["rate"], " kbps")
    if "send_log" in summary:
        _fmt_section("Sender Pipeline (custom instrumentation)", summary["send_log"])
    if "recv_log" in summary:
        _fmt_section("Receiver Pipeline (custom instrumentation)", summary["recv_log"])
    if "send_log_stats" in summary:
        _fmt_section("Sender WebRTC Stats (getStats API)", summary["send_log_stats"])
    if "recv_log_stats" in summary:
        _fmt_section("Receiver WebRTC Stats (getStats API)", summary["recv_log_stats"])
    if "statistics_csv" in summary:
        _fmt_section("Overall Statistics (CSV)", summary["statistics_csv"])

    return "\n".join(lines)


def analyze_experiment(logs, api_key, model="anthropic/claude-sonnet-4",
                       on_chunk=None):
    """
    Summarise *logs* and stream an LLM analysis via OpenRouter.

    Parameters
    ----------
    logs : dict
        Output of ``collect_logs()``.
    api_key : str
        OpenRouter API key.
    model : str
        Any OpenRouter model id (e.g. ``"openai/gpt-4o"``).
    on_chunk : callable(str) | None
        Called with each streamed text delta.

    Returns
    -------
    (summary_text, analysis_text) : tuple[str, str]
    """
    summary = summarize_logs(logs)
    summary_text = format_summary(logs, summary)

    client = OpenAI(
        api_key=api_key,
        base_url="https://openrouter.ai/api/v1",
    )

    user_msg = (
        "Here are the summary statistics from a SparkRTC video streaming "
        "experiment:\n\n" + summary_text +
        "\n\nPlease analyse these results and provide recommendations."
    )

    stream = client.chat.completions.create(
        model=model,
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": user_msg},
        ],
        stream=True,
    )

    full_response = []
    for chunk in stream:
        delta = chunk.choices[0].delta
        if delta.content:
            full_response.append(delta.content)
            if on_chunk:
                on_chunk(delta.content)

    return summary_text, "".join(full_response)
