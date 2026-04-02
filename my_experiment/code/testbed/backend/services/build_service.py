"""Build service: ninja build orchestration with streaming output."""

import asyncio
import subprocess
from typing import AsyncIterator
from pathlib import Path
from services.config import get_repo_path


class BuildService:
    def __init__(self):
        self._process: asyncio.subprocess.Process | None = None

    async def run_build(self) -> AsyncIterator[dict]:
        """Run ninja build, yielding output lines."""
        repo = Path(get_repo_path())
        build_dir = repo / "out" / "Default"
        targets = ["peerconnection_localvideo", "peerconnection_server"]
        cmd = ["ninja", "-C", str(build_dir)] + targets

        self._process = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.STDOUT,
            cwd=str(repo),
        )

        async for line in self._process.stdout:
            text = line.decode(errors="replace")
            yield {"output": text}

        await self._process.wait()
        success = self._process.returncode == 0
        yield {"type": "done", "success": success, "returncode": self._process.returncode}
        self._process = None

    def stop(self):
        if self._process:
            self._process.kill()
