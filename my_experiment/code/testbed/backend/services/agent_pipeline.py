"""Multi-step Code Agent pipeline with project understanding and token budgeting."""

import re
import uuid
from dataclasses import dataclass
from typing import AsyncIterator

import send_webhook
import llm_analysis
from openai import OpenAI
from services.config import get_repo_path
from services.file_reader import (
    read_relevant_sources,
    read_files_by_path,
    INSTRUMENTED_FILES,
    FILE_DESCRIPTIONS,
)

# ---------------------------------------------------------------------------
# Shared constants (reused from llm_service.py)
# ---------------------------------------------------------------------------

CODE_CHANGE_PATTERN = re.compile(
    r'<code_change\s+file="([^"]+)"(?:\s+description="([^"]*)")?\s*>(.*?)</code_change>',
    re.DOTALL,
)

CODE_CHANGE_FORMAT = """\
Format each change like this:

<code_change file="relative/path/to/file.cc" description="Brief description of change">
--- a/relative/path/to/file.cc
+++ b/relative/path/to/file.cc
@@ -line,count +line,count @@
 context line (unchanged)
-removed line
+added line
 context line (unchanged)
</code_change>

Rules:
- Include 3+ lines of context around each change for accurate patching
- Use the exact file paths shown in the source excerpts
- Keep changes minimal and focused on the identified anomaly
- Prefer parameter tuning over architectural changes
- Each <code_change> block must be a valid unified diff
"""

# ---------------------------------------------------------------------------
# Project architecture map (static, derived from CLAUDE.md)
# ---------------------------------------------------------------------------

PROJECT_MAP = """\
## SparkRTC Project Architecture

SparkRTC is a WebRTC fork optimised for ultra-low latency video streaming.

### Video Pipeline (sender → receiver)
```
Camera/File → VideoCapturer → VideoStreamEncoder → RtpSender → RtpTransport → Network
Network → RtpTransport → RtpReceiver → VideoReceiveStream → GenericDecoder → Renderer
```

### Key Modules & Tunable Parameters
| Directory | Purpose | Key tunables |
|-----------|---------|--------------|
| `video/video_stream_encoder.cc` | Encodes raw frames, decides frame dropping, quality scaling | initial_frame_dropper threshold, quality scaler settings |
| `pc/rtp_transport.cc` | Packetises & sends/receives RTP packets | — |
| `modules/video_coding/generic_decoder.cc` | Decodes frames, manages decode buffer | max decode wait time |
| `modules/congestion_controller/goog_cc/` | Google Congestion Control (GCC) | `loss_based_bwe_v2.cc`: loss thresholds, bandwidth ramp-up speed; `goog_cc_network_control.cc`: probe intervals, initial bitrate |
| `modules/video_coding/timing/timing.cc` | Jitter buffer timing | render delay, decode time estimation |
| `modules/video_coding/jitter_buffer_common.h` | Jitter buffer constants | max packet buffer, frame buffer size |
| `modules/rtp_rtcp/` | RTP/RTCP protocol, NACK, FEC | max NACK list size, FEC rate |
| `examples/peerconnection/localvideo/conductor.cc` | Example app, periodic getStats() logging | stats interval |

### Instrumentation Points
- **FRAME_CAPTURE / FRAME_ENCODE_START / FRAME_ENCODE_END** in `video_stream_encoder.cc`
- **PACKET_SEND / PACKET_RECEIVE** in `rtp_transport.cc`
- **FRAME_DECODE_START / FRAME_DECODE_END** in `generic_decoder.cc`
- **WEBRTC_STATS** (periodic getStats()) in `conductor.cc`

### Available Source Files for Analysis
""" + "\n".join(
    f"- `{path}`: {desc}" for path, desc in FILE_DESCRIPTIONS.items()
)

# ---------------------------------------------------------------------------
# Step prompts
# ---------------------------------------------------------------------------

STEP1_SYSTEM = """\
You are a WebRTC video streaming performance analyst. You are given the project \
architecture and experiment results summary.

Your task:
1. Identify all anomalies in the experiment results (use the anomaly taxonomy below).
2. For each anomaly, state the type, layer, and supporting evidence.
3. List which source files should be examined to diagnose and fix each anomaly.

Output the file list inside tags:
<files_needed>
path/to/file1.cc
path/to/file2.cc
</files_needed>

""" + llm_analysis.SYSTEM_PROMPT

STEP2_SYSTEM = """\
You are a WebRTC performance engineer. You have been given:
1. Anomalies identified from an experiment
2. The relevant source code files

Your task:
- For each anomaly, diagnose the root cause by referencing specific code.
- Identify the exact function, parameter, or logic that should change.
- Explain your reasoning clearly.
- Outline a concrete change plan (what to change and why).

Do NOT output code diffs yet — just the diagnosis and change plan.\
"""

STEP3_SYSTEM = """\
You are a WebRTC code improvement agent. You have been given a diagnosis and change plan.

Now generate the EXACT code changes as unified diffs.

For each code change suggestion:
1. Explain WHY the change should help (link to the anomaly)
2. Show the EXACT change as a unified diff inside <code_change> tags

""" + CODE_CHANGE_FORMAT

# Used when steps 2+3 are merged into a single LLM call
MERGED_STEP2_3_SYSTEM = """\
You are a WebRTC performance engineer and code improvement agent. You have been given:
1. Anomalies identified from an experiment
2. The relevant source code files

Your task:
1. For each anomaly, diagnose the root cause by referencing specific code.
2. Identify the exact function, parameter, or logic that should change.
3. Explain your reasoning clearly.
4. Then generate the EXACT code changes as unified diffs.

For each code change suggestion:
- Explain WHY the change should help (link to the anomaly)
- Show the EXACT change as a unified diff inside <code_change> tags

""" + CODE_CHANGE_FORMAT

# ---------------------------------------------------------------------------
# Token budget
# ---------------------------------------------------------------------------


class TokenBudget:
    """Tracks estimated token usage to stay within model context limits."""

    CHARS_PER_TOKEN = 3.5
    OUTPUT_RESERVE = 0.20  # reserve 20% for output + estimation error

    def __init__(self, context_length: int):
        self.context_length = context_length
        self.usable = int(context_length * (1 - self.OUTPUT_RESERVE))
        self.used = 0

    def estimate(self, text: str) -> int:
        return int(len(text) / self.CHARS_PER_TOKEN)

    def add(self, text: str) -> int:
        tokens = self.estimate(text)
        self.used += tokens
        return tokens

    def remaining(self) -> int:
        return max(0, self.usable - self.used)

    def can_fit(self, text: str) -> bool:
        return self.estimate(text) <= self.remaining()

    def truncate_to_fit(self, text: str) -> str:
        """Truncate text to fit remaining budget."""
        max_chars = int(self.remaining() * self.CHARS_PER_TOKEN)
        if len(text) <= max_chars:
            return text
        return text[:max_chars] + "\n... (truncated to fit context window)"

    def reset(self):
        self.used = 0


# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------


@dataclass
class AgentConfig:
    output_dir: str
    data_name: str
    model: str
    api_key: str
    context_length: int = 128000
    mode: str = "analyze"
    build_output: str | None = None


# ---------------------------------------------------------------------------
# Pipeline
# ---------------------------------------------------------------------------


def _supports_thinking(model: str) -> bool:
    prefixes = [
        "anthropic/claude-3-5-sonnet",
        "anthropic/claude-sonnet-4",
        "anthropic/claude-opus-4",
        "anthropic/claude-3-opus",
    ]
    return any(model.startswith(p) for p in prefixes)


def _max_lines_for_budget(context_length: int) -> int:
    if context_length < 16000:
        return 100
    if context_length < 64000:
        return 200
    if context_length < 200000:
        return 400
    return 600


def _parse_files_needed(text: str) -> list[str]:
    """Extract file paths from <files_needed> block."""
    match = re.search(r"<files_needed>(.*?)</files_needed>", text, re.DOTALL)
    if not match:
        return []
    paths = []
    for line in match.group(1).strip().splitlines():
        line = line.strip().strip("`").strip("- ")
        if line and not line.startswith("#"):
            paths.append(line)
    return paths


def _parse_code_changes(text: str) -> list[dict]:
    """Extract <code_change> blocks from LLM response."""
    suggestions = []
    for file_path, description, diff_content in CODE_CHANGE_PATTERN.findall(text):
        diff_content = diff_content.strip()
        old_lines, new_lines = [], []
        for line in diff_content.split("\n"):
            if line.startswith("---") or line.startswith("+++") or line.startswith("@@"):
                continue
            if line.startswith("-"):
                old_lines.append(line[1:])
            elif line.startswith("+"):
                new_lines.append(line[1:])
            else:
                content = line[1:] if line.startswith(" ") else line
                old_lines.append(content)
                new_lines.append(content)
        suggestions.append({
            "type": "suggestion",
            "id": str(uuid.uuid4())[:8],
            "file": file_path,
            "diff": diff_content,
            "old_code": "\n".join(old_lines),
            "new_code": "\n".join(new_lines),
            "description": description or "",
        })
    return suggestions


async def _stream_llm(
    client: OpenAI,
    model: str,
    messages: list[dict],
    use_thinking: bool,
) -> AsyncIterator[tuple[str, str]]:
    """Stream LLM response, yielding (msg_type, text) tuples.

    msg_type is 'thinking' or 'analysis'.
    """
    import asyncio

    extra = {}
    if use_thinking:
        extra["extra_body"] = {"include_reasoning": True}

    full_text = ""
    chunks: list[tuple[str, str]] = []

    def _call():
        response = client.chat.completions.create(
            model=model,
            messages=messages,
            stream=True,
            **extra,
        )
        for chunk in response:
            delta = chunk.choices[0].delta if chunk.choices else None
            if not delta:
                continue
            reasoning = getattr(delta, "reasoning_content", None) or getattr(delta, "reasoning", None)
            if reasoning:
                chunks.append(("thinking", reasoning))
            if delta.content:
                chunks.append(("analysis", delta.content))

    loop = asyncio.get_event_loop()
    task = asyncio.ensure_future(loop.run_in_executor(None, _call))

    sent = 0
    while not task.done() or sent < len(chunks):
        if sent < len(chunks):
            msg_type, text = chunks[sent]
            if msg_type == "analysis":
                full_text += text
            yield msg_type, text
            sent += 1
        else:
            await asyncio.sleep(0.03)

    # Drain remaining
    while sent < len(chunks):
        msg_type, text = chunks[sent]
        if msg_type == "analysis":
            full_text += text
        yield msg_type, text
        sent += 1

    # Yield sentinel with full text for parsing
    yield "__full__", full_text


class AgentPipeline:
    """Multi-step Code Agent: analyze anomalies → read files → suggest changes."""

    async def run(self, config: AgentConfig) -> AsyncIterator[dict]:
        client = OpenAI(
            base_url="https://openrouter.ai/api/v1",
            api_key=config.api_key,
        )
        use_thinking = _supports_thinking(config.model)
        budget = TokenBudget(config.context_length)
        max_lines = _max_lines_for_budget(config.context_length)

        # --- Collect experiment data ---
        yield {"type": "status", "step": 0, "message": "Collecting experiment data..."}

        logs = send_webhook.collect_logs(config.output_dir, config.data_name)
        summary = llm_analysis.summarize_logs(logs)
        formatted_summary = llm_analysis.format_summary(logs, summary)

        # --- Step 1: Anomaly Analysis ---
        yield {"type": "status", "step": 1, "message": "Analyzing experiment anomalies..."}

        budget.reset()
        step1_system = STEP1_SYSTEM
        step1_user = f"## Project Architecture\n\n{PROJECT_MAP}\n\n## Experiment Results\n\n{formatted_summary}"

        # Truncate if needed for small models
        budget.add(step1_system)
        step1_user = budget.truncate_to_fit(step1_user)
        budget.add(step1_user)

        messages = [
            {"role": "system", "content": step1_system},
            {"role": "user", "content": step1_user},
        ]

        step1_full = ""
        async for msg_type, text in _stream_llm(client, config.model, messages, use_thinking):
            if msg_type == "__full__":
                step1_full = text
            elif msg_type == "thinking":
                yield {"type": "thinking", "chunk": text}
            else:
                yield {"type": "analysis", "chunk": text}

        # Parse files needed
        requested_files = _parse_files_needed(step1_full)
        if not requested_files:
            # Fallback to hardcoded files
            requested_files = list(INSTRUMENTED_FILES)

        yield {"type": "files_read", "files": requested_files}

        # --- Read requested files ---
        yield {"type": "status", "step": 2, "message": f"Reading {len(requested_files)} source files..."}

        budget.reset()
        budget.add(STEP2_SYSTEM)

        file_contents = read_files_by_path(
            requested_files,
            token_budget_remaining=budget.remaining(),
            max_lines_per_file=max_lines,
        )

        source_text = ""
        for path, code in file_contents.items():
            source_text += f"### {path}\n```cpp\n{code}\n```\n\n"

        # Decide: merge steps 2+3 or run separately
        step2_user = f"## Anomalies Identified\n\n{step1_full}\n\n## Source Code\n\n{source_text}"
        merge_steps = (
            config.context_length >= 200000
            or budget.can_fit(step2_user + STEP3_SYSTEM + CODE_CHANGE_FORMAT)
        )

        if merge_steps:
            # --- Merged Steps 2+3 ---
            yield {"type": "status", "step": 2, "message": "Analyzing code and generating changes..."}

            merged_system = MERGED_STEP2_3_SYSTEM
            budget.add(merged_system)
            step2_user = budget.truncate_to_fit(step2_user)
            budget.add(step2_user)

            if config.mode == "fix-build" and config.build_output:
                step2_user += f"\n\n## Build Error Output\n```\n{config.build_output}\n```\nThe previous patches failed to compile. Provide corrected patches.\n"

            messages = [
                {"role": "system", "content": merged_system},
                {"role": "user", "content": step2_user},
            ]

            full_text = ""
            async for msg_type, text in _stream_llm(client, config.model, messages, use_thinking):
                if msg_type == "__full__":
                    full_text = text
                elif msg_type == "thinking":
                    yield {"type": "thinking", "chunk": text}
                else:
                    yield {"type": "analysis", "chunk": text}

            yield {"type": "status", "step": 3, "message": "Parsing suggestions..."}
            for suggestion in _parse_code_changes(full_text):
                yield suggestion

        else:
            # --- Step 2: Deep Dive ---
            budget.add(STEP2_SYSTEM)
            step2_user = budget.truncate_to_fit(step2_user)
            budget.add(step2_user)

            messages = [
                {"role": "system", "content": STEP2_SYSTEM},
                {"role": "user", "content": step2_user},
            ]

            step2_full = ""
            async for msg_type, text in _stream_llm(client, config.model, messages, use_thinking):
                if msg_type == "__full__":
                    step2_full = text
                elif msg_type == "thinking":
                    yield {"type": "thinking", "chunk": text}
                else:
                    yield {"type": "analysis", "chunk": text}

            # --- Step 3: Code Changes ---
            yield {"type": "status", "step": 3, "message": "Generating code changes..."}

            budget.reset()
            budget.add(STEP3_SYSTEM)

            step3_user = f"## Diagnosis & Change Plan\n\n{step2_full}\n\n## Source Code (for diff context)\n\n{source_text}"

            if config.mode == "fix-build" and config.build_output:
                step3_user += f"\n\n## Build Error Output\n```\n{config.build_output}\n```\nProvide corrected patches.\n"

            step3_user = budget.truncate_to_fit(step3_user)
            budget.add(step3_user)

            messages = [
                {"role": "system", "content": STEP3_SYSTEM},
                {"role": "user", "content": step3_user},
            ]

            step3_full = ""
            async for msg_type, text in _stream_llm(client, config.model, messages, use_thinking):
                if msg_type == "__full__":
                    step3_full = text
                elif msg_type == "thinking":
                    yield {"type": "thinking", "chunk": text}
                else:
                    yield {"type": "analysis", "chunk": text}

            for suggestion in _parse_code_changes(step3_full):
                yield suggestion
