"""Pydantic models for API request/response types."""

from pydantic import BaseModel


class PreprocessRequest(BaseModel):
    file_path: str
    width: int = 1920
    height: int = 1080
    fps: int = 24


class ExperimentRequest(BaseModel):
    file_path: str
    width: int = 1920
    height: int = 1080
    fps: int = 24
    output_dir: str = ""


class AnalysisRequest(BaseModel):
    output_dir: str
    data_name: str
    model: str = "anthropic/claude-sonnet-4"
    api_key: str = ""


class PatchItem(BaseModel):
    file: str
    diff: str


class ApplyPatchesRequest(BaseModel):
    patches: list[PatchItem]


class FixBuildRequest(BaseModel):
    build_output: str
    output_dir: str
    data_name: str
    model: str = "anthropic/claude-sonnet-4"
    api_key: str = ""


class ValidateKeyRequest(BaseModel):
    api_key: str
