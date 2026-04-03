"""LLM service: wraps llm_analysis.py + code agent prompts."""

import re
import uuid
from typing import AsyncIterator
from pathlib import Path

import send_webhook
import llm_analysis
from services.log_collector import RESULT_DIR
from services.file_reader import read_relevant_sources
from services.agent_pipeline import CODE_CHANGE_FORMAT


def _collect_logs(output_dir: str, data_name: str) -> dict:
    """Collect experiment logs using absolute paths.

    If *output_dir* is absolute it is used directly; otherwise it is resolved
    against RESULT_DIR.  This avoids the fragile chdir that
    ``send_webhook.collect_logs`` requires.
    """
    import os
    from pathlib import Path
    from datetime import datetime

    # Normalize data_name: strip directory and .yuv extension if it's a full path
    data_name = Path(data_name).stem if ("/" in data_name or "\\" in data_name) else data_name

    base = Path(output_dir) if Path(output_dir).is_absolute() else RESULT_DIR / output_dir
    res_dir = base / "res" / data_name
    rec_dir = base / "rec" / data_name

    logs: dict = {
        "timestamp": datetime.now().isoformat(),
        "output_dir": output_dir,
        "data_name": data_name,
        "host": os.uname().nodename if hasattr(os, "uname") else "unknown",
        "files": {},
        "metadata": {},
    }

    print(f"Collecting logs from {res_dir} and {rec_dir}")

    log_files = {
        "ssim":  res_dir / "ssim" / "ssim.log",
        "psnr":  res_dir / "psnr" / "psnr.log",
        "delay": res_dir / "delay.log",
        "frame_size": res_dir / "frame_size.log",
        "rate":  res_dir / "rate.log",
        "rate_with_frame_index": res_dir / "rate_with_frame_index.log",
        "receive_corresponding_index": res_dir / "receive_correspoding_index.log",
        "send_log": rec_dir / "send.log",
        "recv_log": rec_dir / "recv.log",
        "rate_timestamp": rec_dir / "rate_timestamp.log",
        "frame_size_timestamp": rec_dir / "frame_size_original_timestamp.log",
    }

    # Optional statistics files (live one level above code/)
    stats_dir = RESULT_DIR.parent / "code"
    for key, name in [("statistics_log", "statistics.log"), ("statistics_csv", "statistics.csv")]:
        p = stats_dir.parent / name
        if p.exists():
            log_files[key] = p

    for log_name, fpath in log_files.items():
        if fpath.exists():
            logs["files"][log_name] = send_webhook.read_log_file(str(fpath))
            try:
                st = fpath.stat()
                logs["metadata"][log_name] = {
                    "size_bytes": st.st_size,
                    "modified": datetime.fromtimestamp(st.st_mtime).isoformat(),
                    "lines": len(logs["files"][log_name].split("\n")),
                }
            except Exception as e:
                logs["metadata"][log_name] = {"error": str(e)}
        else:
            logs["files"][log_name] = f"File not found: {fpath}"

    return logs

CODE_AGENT_SYSTEM_PROMPT = """\
You are a WebRTC video streaming performance analyst AND code improvement agent.

First, analyse the experiment results using the same structured anomaly approach.

Then, based on the anomalies you find, suggest SPECIFIC code changes to the WebRTC \
C++ codebase that could improve performance. You will be given relevant source file excerpts.

If your diagnosis concludes that the system is operating normally and no code \
changes are needed, say so clearly and do NOT output any <code_change> blocks.

For each code change suggestion:
1. Explain WHY the change should help (link to the anomaly)
2. Show the EXACT change as a unified diff inside <code_change> tags

""" + CODE_CHANGE_FORMAT


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
