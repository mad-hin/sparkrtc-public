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

MAX_LINES_PER_FILE = 200  # Limit to keep token count reasonable


def _read_excerpt(path: Path, max_lines: int = MAX_LINES_PER_FILE) -> str | None:
    """Read a file, returning at most max_lines around instrumentation points."""
    if not path.is_absolute():
        path = Path(get_repo_path()) / path
    if not path.exists():
        return None

    lines = path.read_text(errors="replace").splitlines()

    if len(lines) <= max_lines:
        return "\n".join(lines)

    # Find lines with instrumentation markers
    markers = ["RTC_LOG", "FRAME_ENCODE", "FRAME_DECODE", "PACKET_SEND",
               "PACKET_RECEIVE", "FRAME_CAPTURE", "WEBRTC_STATS"]
    important_lines = set()
    for i, line in enumerate(lines):
        if any(m in line for m in markers):
            # Include context around the marker
            for j in range(max(0, i - 15), min(len(lines), i + 15)):
                important_lines.add(j)

    if not important_lines:
        # No markers found; return first and last chunks
        half = max_lines // 2
        return "\n".join(lines[:half]) + "\n// ... (truncated) ...\n" + "\n".join(lines[-half:])

    # Build excerpt from important regions
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
