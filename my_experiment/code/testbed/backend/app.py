"""FastAPI backend for SparkRTC Testbed."""

import sys
from pathlib import Path
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

# Add my_experiment/code/ to path so we can import existing modules
# (app.py is at testbed/backend/app.py, so parent.parent.parent = code/)
sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent))

from routers import preprocess, experiment, analysis, code_agent, settings, comparison

app = FastAPI(title="SparkRTC Testbed Backend")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health")
async def health():
    return {"status": "ok"}


app.include_router(preprocess.router, prefix="/api/preprocess", tags=["preprocess"])
app.include_router(experiment.router, prefix="/api/experiment", tags=["experiment"])
app.include_router(analysis.router, prefix="/api/analysis", tags=["analysis"])
app.include_router(code_agent.router, prefix="/api/agent", tags=["agent"])
app.include_router(settings.router, prefix="/api/settings", tags=["settings"])
app.include_router(comparison.router, prefix="/api/comparison", tags=["comparison"])

# Serve result figures as static files
# __file__ = testbed/backend/app.py → 4 parents up = my_experiment/
result_dir = Path(__file__).resolve().parent.parent.parent.parent / "result"
if result_dir.exists():
    app.mount("/static/results", StaticFiles(directory=str(result_dir)), name="results")
