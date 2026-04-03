"""LLM service: wraps llm_analysis.py + code agent prompts."""

import re
import uuid
from typing import AsyncIterator
from pathlib import Path

import send_webhook
import llm_analysis
from services.log_collector import RESULT_DIR
from services.file_reader import read_relevant_sources


def _collect_logs(output_dir: str, data_name: str) -> dict:
    """Collect logs, converting absolute output_dir to relative for send_webhook."""
    from pathlib import Path
    p = Path(output_dir)
    if p.is_absolute():
        try:
            output_dir = str(p.relative_to(RESULT_DIR))
        except ValueError:
            pass
    return send_webhook.collect_logs(output_dir, data_name)

CODE_AGENT_SYSTEM_PROMPT = """\
You are a WebRTC video streaming performance analyst AND code improvement agent.

First, analyse the experiment results using the same structured anomaly approach.

Then, based on the anomalies you find, suggest SPECIFIC code changes to the WebRTC \
C++ codebase that could improve performance. You will be given relevant source file excerpts.

For each code change suggestion:
1. Explain WHY the change should help (link to the anomaly)
2. Show the EXACT change as a unified diff inside <code_change> tags

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


def get_summary(output_dir: str, data_name: str) -> str:
    """Get formatted summary of experiment logs."""
    logs = _collect_logs(output_dir, data_name)
    summary = llm_analysis.summarize_logs(logs)
    return llm_analysis.format_summary(logs, summary)


async def stream_analysis(
    output_dir: str,
    data_name: str,
    model: str,
    api_key: str,
) -> AsyncIterator[str]:
    """Stream LLM analysis using existing llm_analysis module."""
    import asyncio

    logs = _collect_logs(output_dir, data_name)
    summary = llm_analysis.summarize_logs(logs)
    formatted = llm_analysis.format_summary(logs, summary)

    chunks: list[str] = []

    def on_chunk(text: str):
        chunks.append(text)

    loop = asyncio.get_event_loop()

    # Run the blocking OpenAI call in a thread
    async def _stream():
        await loop.run_in_executor(
            None,
            lambda: llm_analysis.analyze_experiment(logs, api_key, model, on_chunk),
        )

    task = asyncio.create_task(_stream())

    sent = 0
    while not task.done() or sent < len(chunks):
        if sent < len(chunks):
            yield chunks[sent]
            sent += 1
        else:
            await asyncio.sleep(0.05)

    # Yield any remaining chunks
    while sent < len(chunks):
        yield chunks[sent]
        sent += 1


async def stream_code_agent(
    output_dir: str,
    data_name: str,
    model: str,
    api_key: str,
    build_output: str | None = None,
    mode: str = "analyze",
) -> AsyncIterator[dict]:
    """Stream code agent analysis with code suggestions."""
    import asyncio
    from openai import OpenAI

    if mode == "fix-build" and build_output:
        # Lightweight prompt: only build errors, no full experiment re-analysis
        system = CODE_AGENT_SYSTEM_PROMPT
        # Truncate build output to last 3000 chars (the errors are at the end)
        truncated_errors = build_output[-3000:] if len(build_output) > 3000 else build_output
        user_content = (
            f"## Build Error Output\n```\n{truncated_errors}\n```\n\n"
            "The previous patches failed to compile. Analyze the compiler errors "
            "and provide corrected patches. Only output the fixed <code_change> blocks.\n"
        )
    else:
        # Full analysis mode
        logs = _collect_logs(output_dir, data_name)
        summary = llm_analysis.summarize_logs(logs)
        formatted = llm_analysis.format_summary(logs, summary)
        source_excerpts = read_relevant_sources()

        system = llm_analysis.SYSTEM_PROMPT + "\n\n" + CODE_AGENT_SYSTEM_PROMPT
        user_content = formatted + "\n\n"
        user_content += "## Relevant Source Code\n\n"
        for path, code in source_excerpts.items():
            user_content += f"### {path}\n```cpp\n{code}\n```\n\n"

    messages = [
        {"role": "system", "content": system},
        {"role": "user", "content": user_content},
    ]

    client = OpenAI(
        base_url="https://openrouter.ai/api/v1",
        api_key=api_key,
    )

    # Stream the response
    full_text = ""
    response = client.chat.completions.create(
        model=model,
        messages=messages,
        stream=True,
    )

    for chunk in response:
        delta = chunk.choices[0].delta if chunk.choices else None
        if delta and delta.content:
            text = delta.content
            full_text += text
            yield {"type": "analysis", "chunk": text}

    # Parse code_change blocks from full response
    pattern = r'<code_change\s+file="([^"]+)"(?:\s+description="([^"]*)")?\s*>(.*?)</code_change>'
    matches = re.findall(pattern, full_text, re.DOTALL)

    for file_path, description, diff_content in matches:
        diff_content = diff_content.strip()

        # Extract old and new code from the diff
        old_lines = []
        new_lines = []
        for line in diff_content.split("\n"):
            if line.startswith("---") or line.startswith("+++") or line.startswith("@@"):
                continue
            if line.startswith("-"):
                old_lines.append(line[1:])
            elif line.startswith("+"):
                new_lines.append(line[1:])
            else:
                # Context line (remove leading space)
                content = line[1:] if line.startswith(" ") else line
                old_lines.append(content)
                new_lines.append(content)

        yield {
            "type": "suggestion",
            "id": str(uuid.uuid4())[:8],
            "file": file_path,
            "diff": diff_content,
            "old_code": "\n".join(old_lines),
            "new_code": "\n".join(new_lines),
            "description": description or "",
        }
