"""Code agent endpoints: analyze, suggest, patch, build, run."""

import json
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from models.schemas import ApplyPatchesRequest
from services.agent_pipeline import AgentPipeline, AgentConfig
from services.git_service import GitService
from services.build_service import BuildService

router = APIRouter()
git_svc = GitService()
build_svc = BuildService()


@router.websocket("/ws/stream")
async def ws_agent_stream(ws: WebSocket):
    await ws.accept()
    try:
        data = await ws.receive_text()
        req = json.loads(data)

        pipeline = AgentPipeline()
        config = AgentConfig(
            output_dir=req.get("output_dir", ""),
            data_name=req.get("data_name", ""),
            model=req.get("model", ""),
            api_key=req.get("api_key", ""),
            context_length=req.get("context_length", 128000),
            mode=req.get("type", "analyze"),
            build_output=req.get("build_output"),
        )

        async for msg in pipeline.run(config):
            await ws.send_json(msg)

        await ws.send_json({"type": "done"})
    except WebSocketDisconnect:
        pass
    except Exception as e:
        try:
            await ws.send_json({"type": "error", "message": str(e)})
        except Exception:
            pass


@router.post("/apply-patches")
async def apply_patches(req: ApplyPatchesRequest):
    branch = git_svc.create_branch()
    results = {"success": True, "branch": branch, "applied": [], "failed": []}

    for patch in req.patches:
        ok = git_svc.apply_patch(patch.file, patch.diff)
        if ok:
            results["applied"].append(patch.file)
        else:
            results["failed"].append(patch.file)
            results["success"] = False

    if results["applied"]:
        git_svc.commit("Agent: apply suggested changes")

    return results


@router.websocket("/ws/build")
async def ws_build(ws: WebSocket):
    await ws.accept()
    try:
        async for msg in build_svc.run_build():
            await ws.send_json(msg)
    except WebSocketDisconnect:
        build_svc.stop()


@router.post("/run-experiment")
async def run_agent_experiment(req: dict):
    """Run experiment on temp branch and return compare dir."""
    from services.experiment_runner import ExperimentRunner

    runner = ExperimentRunner()
    compare_dir = f"agent-{git_svc.current_branch}"
    await runner.start_simple(req.get("output_dir", ""), req.get("data_name", ""), compare_dir)
    return {"compare_dir": compare_dir}


@router.post("/fix-build")
async def fix_build(req: dict):
    """Endpoint for sending build errors back to LLM (handled via WebSocket)."""
    return {"status": "use /ws/stream with type=fix-build"}


@router.delete("/cleanup")
async def cleanup():
    git_svc.cleanup()
    return {"status": "cleaned up"}


@router.get("/branch-status")
async def branch_status():
    return {
        "branch": git_svc.current_branch,
        "original_branch": git_svc.original_branch,
    }


@router.get("/preview-branch")
async def preview_branch():
    """Return what the next branch name would be without creating it."""
    return {"branch_name": git_svc.preview_branch_name()}
