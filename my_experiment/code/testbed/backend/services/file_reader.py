"""Read relevant C++ source files for LLM context."""

from pathlib import Path
from services.config import get_repo_path

# Key instrumented files to always include (trimmed excerpts)
INSTRUMENTED_FILES = [
    "examples/peerconnection/localvideo/conductor.cc",
    "video/video_stream_encoder.cc",
    "pc/rtp_transport.cc",
    "modules/video_coding/generic_decoder.cc",
]

# Additional files by anomaly type
ANOMALY_FILES = {
    "rate_control": [
        "modules/congestion_controller/goog_cc/loss_based_bwe_v2.cc",
        "modules/congestion_controller/goog_cc/goog_cc_network_control.cc",
    ],
    "codec": [
        "modules/video_coding/video_codec_initializer.cc",
    ],
    "jitter": [
        "modules/video_coding/jitter_buffer_common.h",
        "modules/video_coding/timing/timing.cc",
    ],
}

# One-line descriptions of common WebRTC files (helps LLM choose which to read)
FILE_DESCRIPTIONS = {
    "video/video_stream_encoder.cc": "Video encoder wrapper — frame dropping, bitrate allocation, quality scaling",
    "pc/rtp_transport.cc": "RTP packet send/receive — transport layer",
    "modules/video_coding/generic_decoder.cc": "Frame decoder — decode buffer management",
    "examples/peerconnection/localvideo/conductor.cc": "Example app — peer connection setup, periodic getStats() logging",
    "modules/congestion_controller/goog_cc/goog_cc_network_control.cc": "GCC main loop — probe intervals, initial bitrate, bandwidth decisions",
    "modules/congestion_controller/goog_cc/loss_based_bwe_v2.cc": "Loss-based BWE v2 — responds to packet loss, ramp-up speed",
    "modules/congestion_controller/goog_cc/delay_based_bwe.cc": "Delay-based BWE — responds to one-way delay changes",
    "modules/congestion_controller/goog_cc/send_side_bandwidth_estimation.cc": "Send-side BWE — combines loss and delay signals",
    "modules/video_coding/timing/timing.cc": "Jitter buffer timing — render delay, decode time estimation",
    "modules/video_coding/jitter_buffer_common.h": "Jitter buffer constants — max packet/frame buffer sizes",
    "modules/video_coding/video_codec_initializer.cc": "Codec initializer — codec selection, initial params",
    "modules/rtp_rtcp/source/rtp_sender.cc": "RTP sender — packetisation, padding, retransmission",
    "modules/rtp_rtcp/source/rtp_sender_video.cc": "RTP video sender — FEC, RED, retransmit logic",
    "modules/rtp_rtcp/source/rtcp_sender.cc": "RTCP sender — sender/receiver reports, NACK",
    "modules/rtp_rtcp/source/rtcp_receiver.cc": "RTCP receiver — parses reports, triggers NACK",
    "video/video_receive_stream2.cc": "Video receive stream — assembles decoded frames",
    "video/video_send_stream.cc": "Video send stream — orchestrates encoding pipeline",
    "call/call.cc": "Call — top-level container for send/receive streams",
    "pc/peer_connection.cc": "PeerConnection — ICE, DTLS, SDP negotiation",
    "api/video_codecs/video_encoder_config.h": "Encoder config — resolution, framerate, bitrate limits",
}

MAX_LINES_PER_FILE = 200


def _read_excerpt(
    path: Path,
    max_lines: int = MAX_LINES_PER_FILE,
    search_terms: list[str] | None = None,
) -> str | None:
    """Read a file, returning at most max_lines around relevant code."""
    if not path.is_absolute():
        path = Path(get_repo_path()) / path
    if not path.exists():
        return None

    lines = path.read_text(errors="replace").splitlines()

    if len(lines) <= max_lines:
        return "\n".join(lines)

    # Default markers + any custom search terms
    markers = [
        "RTC_LOG", "FRAME_ENCODE", "FRAME_DECODE", "PACKET_SEND",
        "PACKET_RECEIVE", "FRAME_CAPTURE", "WEBRTC_STATS",
    ]
    if search_terms:
        markers.extend(search_terms)

    important_lines = set()
    for i, line in enumerate(lines):
        if any(m in line for m in markers):
            for j in range(max(0, i - 15), min(len(lines), i + 15)):
                important_lines.add(j)

    if not important_lines:
        # No markers found — include header (includes, class decls, constants)
        # and key function signatures throughout the file
        header_end = min(80, max_lines // 3)
        for i in range(header_end):
            important_lines.add(i)
        # Scan for function definitions and key constants
        for i, line in enumerate(lines):
            stripped = line.strip()
            if (
                stripped.startswith("void ")
                or stripped.startswith("bool ")
                or stripped.startswith("int ")
                or stripped.startswith("auto ")
                or "static constexpr" in stripped
                or "const int k" in stripped
                or "const float k" in stripped
            ):
                for j in range(max(0, i - 2), min(len(lines), i + 5)):
                    important_lines.add(j)
            if len(important_lines) >= max_lines:
                break

    if not important_lines:
        half = max_lines // 2
        return "\n".join(lines[:half]) + "\n// ... (truncated) ...\n" + "\n".join(lines[-half:])

    sorted_lines = sorted(important_lines)
    result = []
    prev = -2
    for i in sorted_lines:
        if i - prev > 1:
            result.append(f"// ... (line {i + 1}) ...")
        result.append(lines[i])
        prev = i
        if len(result) >= max_lines:
            break

    return "\n".join(result)


def read_relevant_sources(anomaly_types: list[str] | None = None) -> dict[str, str]:
    """Read relevant source files, returning {relative_path: content}."""
    files_to_read = list(INSTRUMENTED_FILES)

    if anomaly_types:
        for atype in anomaly_types:
            files_to_read.extend(ANOMALY_FILES.get(atype, []))

    result = {}
    for rel_path in files_to_read:
        full_path = Path(get_repo_path()) / rel_path
        excerpt = _read_excerpt(full_path)
        if excerpt:
            result[rel_path] = excerpt

    return result


def read_files_by_path(
    file_paths: list[str],
    token_budget_remaining: int,
    max_lines_per_file: int = 200,
) -> dict[str, str]:
    """Read arbitrary files from the repo, respecting a token budget.

    Args:
        file_paths: Relative paths within the repo.
        token_budget_remaining: Approximate token budget for all file content.
        max_lines_per_file: Max lines per file excerpt.

    Returns:
        {relative_path: content} for files that exist and fit the budget.
    """
    repo_root = Path(get_repo_path()).resolve()
    result = {}
    chars_used = 0
    max_chars = int(token_budget_remaining * 3.5)  # inverse of token estimate

    for rel_path in file_paths:
        # Security: ensure path stays within repo
        full_path = (repo_root / rel_path).resolve()
        if not str(full_path).startswith(str(repo_root)):
            continue
        if not full_path.exists() or not full_path.is_file():
            continue

        # Adjust max_lines if budget is tight
        remaining_chars = max_chars - chars_used
        if remaining_chars <= 0:
            break

        # Scale down lines if budget is limited
        avg_chars_per_line = 60
        affordable_lines = remaining_chars // avg_chars_per_line
        effective_max = min(max_lines_per_file, max(50, affordable_lines))

        excerpt = _read_excerpt(full_path, max_lines=effective_max)
        if excerpt:
            chars_used += len(excerpt)
            if chars_used > max_chars:
                # Truncate this last file to fit
                overshoot = chars_used - max_chars
                excerpt = excerpt[: len(excerpt) - overshoot]
                if excerpt:
                    result[rel_path] = excerpt
                break
            result[rel_path] = excerpt

    return result
