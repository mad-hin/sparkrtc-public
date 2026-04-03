"""Build service: ninja build orchestration with streaming output."""

import asyncio
import time
from typing import AsyncIterator
from pathlib import Path
from services.config import get_repo_path


class BuildService:
    def __init__(self):
        self._process: asyncio.subprocess.Process | None = None

    async def run_build(self) -> AsyncIterator[dict]:
        """Run ninja build, yielding batched output."""
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

        # Batch output lines — send every 200ms instead of per-line
        buffer = []
        last_flush = time.monotonic()

        async for line in self._process.stdout:
            buffer.append(line.decode(errors="replace"))
            now = time.monotonic()
            if now - last_flush >= 0.2 or len(buffer) >= 50:
                yield {"output": "".join(buffer)}
                buffer.clear()
                last_flush = now

        # Flush remaining
        if buffer:
            yield {"output": "".join(buffer)}

        await self._process.wait()
        success = self._process.returncode == 0
        yield {"type": "done", "success": success, "returncode": self._process.returncode}
        self._process = None

    def stop(self):
        if self._process:
            self._process.kill()
