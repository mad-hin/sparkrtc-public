"""Bridge to existing process_video_qrcode.py functions."""

import asyncio
import os
import subprocess
import argparse
from pathlib import Path
from services.config import get_repo_path


def _code_dir() -> str:
    return os.path.join(get_repo_path(), "my_experiment", "code")


def _data_dir() -> str:
    return os.path.join(get_repo_path(), "my_experiment", "data")


async def run_convert(file_path: str, width: int, height: int, fps: int) -> str:
    """Convert video to YUV using ffmpeg."""
    src = Path(file_path)
    name = src.stem
    data_dir = Path(_data_dir())
    out = data_dir / f"{name}.yuv"
    data_dir.mkdir(parents=True, exist_ok=True)

    cmd = [
        "ffmpeg", "-y", "-i", str(src),
        "-vf", f"scale={width}:{height}",
        "-r", str(fps),
        "-pix_fmt", "yuv420p",
        str(out),
    ]

    proc = await asyncio.create_subprocess_exec(
        *cmd,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    _, stderr = await proc.communicate()
    if proc.returncode != 0:
        raise RuntimeError(f"ffmpeg failed: {stderr.decode()[-500:]}")
    return str(out)


async def run_qr_overlay(file_path: str, width: int, height: int, fps: int) -> str:
    """Run QR code overlay via process_video_qrcode."""
    import process_video_qrcode

    cfg = argparse.Namespace(
        data=Path(file_path).stem,
        width=width,
        height=height,
        fps=fps,
    )

    def _run_in_code_dir():
        saved_cwd = os.getcwd()
        try:
            os.chdir(_code_dir())
            return process_video_qrcode.overlay_qrcode_to_video(cfg)
        finally:
            os.chdir(saved_cwd)

    loop = asyncio.get_event_loop()
    result = await loop.run_in_executor(None, _run_in_code_dir)
    return str(result) if result else "QR overlay complete"
