"""Settings endpoints: API key validation, balance, model list, repo path."""

import urllib.request
import json
from fastapi import APIRouter, Header
from pydantic import BaseModel
from models.schemas import ValidateKeyRequest
from services import config

router = APIRouter()


class RepoPathRequest(BaseModel):
    repo_path: str


@router.post("/repo-path")
async def set_repo_path(req: RepoPathRequest):
    config.set_repo_path(req.repo_path)
    return {"status": "ok", "repo_path": req.repo_path}


@router.get("/repo-path")
async def get_repo_path():
    return {"repo_path": config.get_repo_path()}


@router.post("/validate-key")
async def validate_key(req: ValidateKeyRequest):
    try:
        request = urllib.request.Request(
            "https://openrouter.ai/api/v1/auth/key",
            headers={"Authorization": f"Bearer {req.api_key}"},
        )
        with urllib.request.urlopen(request, timeout=10) as resp:
            return {"valid": resp.status == 200}
    except Exception:
        return {"valid": False}


@router.get("/balance")
async def get_balance(x_api_key: str = Header()):
    try:
        request = urllib.request.Request(
            "https://openrouter.ai/api/v1/auth/key",
            headers={"Authorization": f"Bearer {x_api_key}"},
        )
        with urllib.request.urlopen(request, timeout=10) as resp:
            data = json.loads(resp.read().decode())["data"]
            return {
                "credits_remaining": data.get("limit", 0) - data.get("usage", 0),
                "credits_used": data.get("usage", 0),
                "rate_limit": str(data.get("rate_limit", {}).get("requests", "N/A")),
            }
    except Exception as e:
        return {"credits_remaining": 0, "credits_used": 0, "rate_limit": str(e)}


@router.get("/models")
async def get_models(x_api_key: str = Header()):
    try:
        request = urllib.request.Request(
            "https://openrouter.ai/api/v1/models",
            headers={"Authorization": f"Bearer {x_api_key}"},
        )
        with urllib.request.urlopen(request, timeout=15) as resp:
            data = json.loads(resp.read().decode())
            models = []
            for m in data.get("data", []):
                # Include any model that can produce text output
                arch = m.get("architecture", {})
                output_mods = arch.get("output_modalities", [])
                if "text" in output_mods or arch.get("modality", "") in (
                    "text->text",
                    "text+image->text",
                    "image+text->text",
                ):
                    models.append(
                        {
                            "id": m["id"],
                            "name": m.get("name", m["id"]),
                            "context_length": m.get("context_length", 0),
                        }
                    )
            models.sort(key=lambda x: x["name"].lower())
            return models
    except Exception:
        return []
