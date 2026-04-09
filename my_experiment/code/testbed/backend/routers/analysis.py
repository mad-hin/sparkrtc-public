"""Analysis endpoints: LLM analysis streaming."""

import json
import logging
from fastapi import APIRouter, WebSocket, WebSocketDisconnect

logger = logging.getLogger("uvicorn.error")
from models.schemas import AnalysisRequest
from services.llm_service import stream_analysis, get_summary

router = APIRouter()


@router.post("/summary")
async def get_analysis_summary(req: AnalysisRequest):
    summary = get_summary(req.output_dir, req.data_name)
    return {"summary": summary}


@router.websocket("/ws/stream")
async def ws_analysis_stream(ws: WebSocket):
    await ws.accept()
    disconnected = False

    try:
        data = await ws.receive_text()
        req = json.loads(data)
        logger.info(f"[analysis] model={req.get('model', '?')}")

        async for chunk in stream_analysis(
            output_dir=req["output_dir"],
            data_name=req["data_name"],
            model=req["model"],
            api_key=req["api_key"],
        ):
            try:
                await ws.send_json({"chunk": chunk})
            except WebSocketDisconnect:
                disconnected = True
                logger.info("[analysis] Client disconnected while streaming")
                break
            except Exception:
                disconnected = True
                logger.info("[analysis] Failed to send chunk; stopping stream")
                break

        if not disconnected:
            try:
                await ws.send_json({"done": True})
            except Exception:
                pass
    except WebSocketDisconnect:
        pass
    except Exception as e:
        logger.exception("[analysis] LLM stream failed")
        try:
            await ws.send_json({"error": str(e)})
        except Exception:
            pass
