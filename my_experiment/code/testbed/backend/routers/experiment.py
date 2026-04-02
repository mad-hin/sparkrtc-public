"""Experiment endpoints: run/stop experiment, stream output, serve logs."""

import json
from pathlib import Path
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query
from models.schemas import ExperimentRequest
from services.experiment_runner import ExperimentRunner

router = APIRouter()
runner = ExperimentRunner()


@router.post("/run")
async def run_experiment(req: ExperimentRequest):
    await runner.start(req)
    return {"status": "started"}


@router.post("/stop")
async def stop_experiment():
    runner.stop()
    return {"status": "stopped"}


@router.get("/status")
async def get_status():
    return runner.get_status()


@router.get("/logs")
async def get_timestamp_logs(output_dir: str = Query(...), data_name: str = Query(...)):
    """Load timestamp CSV files from result directory."""
    from services.log_collector import load_timestamp_logs

    logs = load_timestamp_logs(output_dir, data_name)
    return logs


@router.get("/figures")
async def get_figures(output_dir: str = Query(...), data_name: str = Query(...)):
    """Return list of figure paths."""
    from services.log_collector import get_figure_paths

    return get_figure_paths(output_dir, data_name)


@router.websocket("/ws/output")
async def ws_experiment_output(ws: WebSocket):
    await ws.accept()
    runner.add_ws(ws)
    try:
        while True:
            await ws.receive_text()  # Keep connection alive
    except WebSocketDisconnect:
        runner.remove_ws(ws)
