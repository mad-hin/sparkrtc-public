"""Preprocess endpoints: video conversion and QR overlay."""

import argparse
from pathlib import Path
from fastapi import APIRouter
from models.schemas import PreprocessRequest
from services.process_bridge import run_convert, run_qr_overlay

router = APIRouter()


@router.post("/convert")
async def convert_video(req: PreprocessRequest):
    result = await run_convert(req.file_path, req.width, req.height, req.fps)
    return {"status": "ok", "output": result}


@router.post("/qrcode")
async def overlay_qrcode(req: PreprocessRequest):
    result = await run_qr_overlay(req.file_path, req.width, req.height, req.fps)
    return {"status": "ok", "output": result}
