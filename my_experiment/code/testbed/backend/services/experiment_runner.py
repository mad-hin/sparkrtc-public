"""Experiment runner: manages server/sender/receiver processes."""

import asyncio
import json
import os
from pathlib import Path
from typing import Optional
from fastapi import WebSocket
from models.schemas import ExperimentRequest
from services.config import get_repo_path


class ExperimentRunner:
    def __init__(self):
        self._running = False
        self._output_dir: Optional[str] = None
        self._data_name: Optional[str] = None
        self._ws_clients: list[WebSocket] = []
        self._task: Optional[asyncio.Task] = None

    def add_ws(self, ws: WebSocket):
        self._ws_clients.append(ws)

    def remove_ws(self, ws: WebSocket):
        try:
            self._ws_clients.remove(ws)
        except ValueError:
            pass

    async def _broadcast(self, source: str, text: str):
        msg = json.dumps({"source": source, "text": text})
        dead = []
        for ws in self._ws_clients:
            try:
                await ws.send_text(msg)
            except Exception:
                dead.append(ws)
        for ws in dead:
            try:
                self._ws_clients.remove(ws)
            except ValueError:
                pass

    async def start(self, req: ExperimentRequest):
        self._running = True

        repo_root = get_repo_path()
        result_base = os.path.join(repo_root, "my_experiment", "result")
        code_dir = os.path.join(repo_root, "my_experiment", "code")

        # Normalise output_dir → keep a relative version for process_video_qrcode
        # and store the absolute path for every other consumer.
        raw = req.output_dir.strip() if req.output_dir else ""
        if os.path.isabs(raw):
            if raw.startswith(result_base):
                rel_output_dir = os.path.relpath(raw, result_base)
            else:
                parts = Path(raw).parts
                rel_output_dir = "/".join(parts[-2:]) if len(parts) >= 2 else parts[-1] if parts else ""
        else:
            rel_output_dir = raw

        if not rel_output_dir or "/" not in rel_output_dir:
            rel_output_dir = "default_run/output_1"

        # Store absolute path so all downstream consumers get a stable reference
        self._output_dir = os.path.join(result_base, rel_output_dir)
        data_name = Path(req.file_path).stem
        self._data_name = data_name

        # Pre-flight checks
        server_bin = os.path.join(repo_root, "out", "Default", "peerconnection_server")
        client_bin = os.path.join(repo_root, "out", "Default", "peerconnection_localvideo")
        send_video = os.path.join(repo_root, "my_experiment", "data", data_name + "_qrcode.yuv")

        for path, label in [
            (server_bin, "peerconnection_server"),
            (client_bin, "peerconnection_localvideo"),
        ]:
            if not os.path.exists(path):
                await self._broadcast("server", f"Error: {label} not found at {path}\n")
                await self._broadcast("server", "Make sure repo path is correct in Settings and binaries are built.\n")
                self._running = False
                return

        if not os.path.exists(send_video):
            await self._broadcast("server", f"Error: QR-coded video not found at {send_video}\n")
            await self._broadcast("server", "Run Pre-process first to generate the YUV file with QR codes.\n")
            self._running = False
            return

        import shutil
        import process_video_qrcode
        import argparse
        import subprocess as _sp

        # Clean previous results for this output_dir so stale data doesn't
        # contaminate the new run.  (The comparison path — start_simple —
        # writes to a separate compare_dir, so it is unaffected.)
        result_dir = os.path.join(result_base, rel_output_dir)
        for subdir in ("res", "rec"):
            d = os.path.join(result_dir, subdir)
            if os.path.isdir(d):
                shutil.rmtree(d)
                await self._broadcast("server", f"Cleared previous {subdir}/ in {rel_output_dir}\n")

        # Kill any leftover peerconnection processes from previous runs
        for proc_name in ["peerconnection_server", "peerconnection_localvideo"]:
            _sp.run(["pkill", "-f", proc_name], capture_output=True)

        cfg = argparse.Namespace(
            data=data_name,
            width=req.width,
            height=req.height,
            fps=req.fps,
            output_dir=rel_output_dir,
        )

        async def _run():
            try:
                loop = asyncio.get_event_loop()
                await self._broadcast("server", f"Starting experiment: data={data_name}, output={self._output_dir}\n")
                await self._broadcast("server", f"Using binaries from {repo_root}/out/Default/\n")

                # Use the original send_and_recv_video which handles all process
                # spawning, log capture (send.log, recv.log), and post-processing.
                # It must run with cwd=my_experiment/code/ because all its paths
                # are relative to that directory.
                def _run_experiment():
                    saved_cwd = os.getcwd()
                    try:
                        os.chdir(code_dir)
                        process_video_qrcode.send_and_recv_video(cfg)
                    finally:
                        os.chdir(saved_cwd)

                await loop.run_in_executor(None, _run_experiment)
                await self._broadcast("server", "\nExperiment complete.\n")

            except Exception as e:
                await self._broadcast("server", f"\nError: {e}\n")
            finally:
                self._running = False
                for ws in self._ws_clients:
                    try:
                        await ws.send_text(json.dumps({
                            "type": "done",
                            "output_dir": self._output_dir,
                            "data_name": self._data_name,
                        }))
                    except Exception:
                        pass

        self._task = asyncio.create_task(_run())

    async def start_simple(self, output_dir: str, data_name: str, compare_dir: str):
        """Run experiment for agent comparison (simplified)."""
        import process_video_qrcode
        import argparse

        code_dir = os.path.join(get_repo_path(), "my_experiment", "code")
        cfg = argparse.Namespace(
            data=data_name,
            output_dir=compare_dir,
        )

        def _run_in_code_dir():
            saved_cwd = os.getcwd()
            try:
                os.chdir(code_dir)
                process_video_qrcode.send_and_recv_video(cfg)
            finally:
                os.chdir(saved_cwd)

        loop = asyncio.get_event_loop()
        await loop.run_in_executor(None, _run_in_code_dir)

    def stop(self):
        self._running = False
        if self._task:
            self._task.cancel()

    def get_status(self):
        return {
            "running": self._running,
            "output_dir": self._output_dir,
            "data_name": self._data_name,
        }
