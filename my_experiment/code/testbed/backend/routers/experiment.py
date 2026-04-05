"""Experiment endpoints: run/stop experiment, stream output, serve logs."""

import json
from pathlib import Path
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query
from pydantic import BaseModel
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


@router.get("/trace-files")
async def list_trace_files():
    """List available mahimahi bandwidth trace files."""
    from services.config import get_repo_path
    trace_dir = Path(get_repo_path()) / "my_experiment" / "file" / "trace_logs"
    if not trace_dir.is_dir():
        return []
    return sorted(p.stem for p in trace_dir.glob("*.log"))


class CreateTraceRequest(BaseModel):
    name: str
    content: str


@router.post("/create-trace")
async def create_trace(req: CreateTraceRequest):
    """Create a new mahimahi bandwidth trace file."""
    from services.config import get_repo_path
    trace_dir = Path(get_repo_path()) / "my_experiment" / "file" / "trace_logs"
    trace_dir.mkdir(parents=True, exist_ok=True)
    name = req.name.strip().replace(" ", "_")
    if not name:
        return {"error": "Name is required"}
    path = trace_dir / f"{name}.log"
    path.write_text(req.content)
    return {"name": name, "path": str(path)}


class CreateLossTraceRequest(BaseModel):
    content: str


@router.post("/create-loss-trace")
async def create_loss_trace(req: CreateLossTraceRequest):
    """Create/overwrite the loss trace file at my_experiment/file/loss_trace."""
    from services.config import get_repo_path
    loss_path = Path(get_repo_path()) / "my_experiment" / "file" / "loss_trace"
    loss_path.parent.mkdir(parents=True, exist_ok=True)
    loss_path.write_text(req.content)
    return {"path": str(loss_path)}


@router.websocket("/ws/output")
async def ws_experiment_output(ws: WebSocket):
    await ws.accept()
    runner.add_ws(ws)
    try:
        while True:
            await ws.receive_text()  # Keep connection alive
    except WebSocketDisconnect:
        runner.remove_ws(ws)
