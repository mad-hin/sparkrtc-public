"""Experiment runner: manages server/sender/receiver processes."""

import asyncio
import json
import os
import subprocess
import time
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

        # output_dir must be in "trace/output_N" format for process_video_qrcode
        output_dir = req.output_dir.strip() if req.output_dir else ""
        if not output_dir or "/" not in output_dir:
            output_dir = "default_run/output_1"

        self._output_dir = output_dir
        data_name = Path(req.file_path).stem
        self._data_name = data_name

        repo_root = get_repo_path()
        # my_experiment/ is two levels below repo root
        experiment_dir = os.path.join(repo_root, "my_experiment")
        code_dir = os.path.join(experiment_dir, "code")

        client_bin = os.path.join(repo_root, "out", "Default", "peerconnection_localvideo")
        server_bin = os.path.join(repo_root, "out", "Default", "peerconnection_server")

        server_ip = "127.0.0.1"
        port = "8888"

        recv_dir = os.path.join(experiment_dir, "result", output_dir, "rec", data_name)
        recv_file = os.path.join(recv_dir, "recon.yuv")
        send_video_path = os.path.join(experiment_dir, "data", data_name + "_qrcode.yuv")
        send_log_file = os.path.join(recv_dir, "send.log")

        async def _run():
            server_proc = None
            recv_proc = None
            try:
                loop = asyncio.get_event_loop()

                os.makedirs(recv_dir, exist_ok=True)

                # Verify binaries exist
                for binary, name in [(server_bin, "peerconnection_server"), (client_bin, "peerconnection_localvideo")]:
                    if not os.path.exists(binary):
                        await self._broadcast("server", f"Error: {name} not found at {binary}\n")
                        await self._broadcast("server", f"Make sure the repo path is correct in Settings and binaries are built.\n")
                        return

                if not os.path.exists(send_video_path):
                    await self._broadcast("server", f"Error: Send video not found at {send_video_path}\n")
                    await self._broadcast("server", f"Run Pre-process first to generate the QR-coded YUV file.\n")
                    return

                # Start server
                await self._broadcast("server", f"Starting peerconnection_server on port {port}...\n")
                server_proc = subprocess.Popen(
                    [server_bin, "--port", port],
                    stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                    cwd=repo_root,
                )
                await asyncio.sleep(1)

                # Start receiver
                await self._broadcast("receiver", f"Starting receiver, saving to {recv_file}...\n")
                recv_proc = subprocess.Popen(
                    [client_bin, "--recon", recv_file, "--server", server_ip, "--port", port],
                    stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                    cwd=repo_root,
                )
                await asyncio.sleep(1)

                # Start sender
                await self._broadcast("sender", f"Starting sender with {send_video_path}...\n")
                send_log_fh = open(send_log_file, "w")
                send_proc = subprocess.Popen(
                    [
                        client_bin, "--file", send_video_path,
                        "--height", str(req.height), "--width", str(req.width),
                        "--fps", str(req.fps),
                        "--server", server_ip, "--port", port,
                    ],
                    stdout=send_log_fh, stderr=subprocess.STDOUT,
                    cwd=repo_root,
                )

                # Stream server output while sender runs
                def _wait_and_stream():
                    while send_proc.poll() is None:
                        if server_proc and server_proc.stdout:
                            line = server_proc.stdout.readline()
                            if line:
                                pass  # Server output is verbose, skip
                        time.sleep(0.1)
                    send_proc.wait()

                await loop.run_in_executor(None, _wait_and_stream)
                send_log_fh.close()

                await self._broadcast("sender", "Sender finished.\n")

                # Kill receiver and server
                if recv_proc:
                    recv_proc.terminate()
                    recv_proc.wait(timeout=5)
                if server_proc:
                    server_proc.terminate()
                    server_proc.wait(timeout=5)

                await self._broadcast("server", "Server and receiver stopped.\n")

                # Post-process: decode received video
                await self._broadcast("server", "Running post-processing (decode, SSIM, PSNR)...\n")
                import process_video_qrcode
                import argparse

                cfg = argparse.Namespace(
                    data=data_name,
                    width=req.width,
                    height=req.height,
                    fps=req.fps,
                    output_dir=output_dir,
                )

                def _decode():
                    saved_cwd = os.getcwd()
                    try:
                        os.chdir(code_dir)
                        process_video_qrcode.decode_recv_video(cfg)
                    finally:
                        os.chdir(saved_cwd)

                await loop.run_in_executor(None, _decode)
                await self._broadcast("server", "\nExperiment complete.\n")

            except Exception as e:
                await self._broadcast("server", f"\nError: {e}\n")
            finally:
                # Cleanup processes
                for proc in [recv_proc, server_proc]:
                    if proc and proc.poll() is None:
                        try:
                            proc.kill()
                        except Exception:
                            pass
                self._running = False
                for ws in self._ws_clients:
                    try:
                        await ws.send_text(json.dumps({"type": "done"}))
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
