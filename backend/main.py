import base64
import json
import os

from dotenv import load_dotenv
load_dotenv()

# 日志必须最先初始化
from log_config import setup_logging
setup_logging()

import logging
logger = logging.getLogger("main")

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from typing import List

from models import ChatRequest
from agent import create_session, generate_next_step, handle_chat, get_session, runtime_stats
from queue_manager import BusyError, task_slot, queue_stats

app = FastAPI(title="教学解题 Agent API", version="1.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── 繁忙响应（SSE busy 帧）────────────────────────────────

def _busy_sse(msg: str):
    async def _gen():
        yield f"data: {json.dumps({'busy': True, 'error': msg}, ensure_ascii=False)}\n\n"
    return StreamingResponse(
        _gen(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


# ── 路由 ──────────────────────────────────────────────────

@app.post("/api/solve")
async def solve(
    problem_text: str = Form(""),
    files: List[UploadFile] = File(default=[]),
):
    images = []
    for f in files:
        content = await f.read()
        media_type = f.content_type or "image/jpeg"
        b64 = base64.b64encode(content).decode()
        images.append(f"data:{media_type};base64,{b64}")

    if not problem_text.strip() and not images:
        raise HTTPException(status_code=400, detail="请输入题目内容或上传图片")

    logger.info("New solve request  text_len=%d  images=%d", len(problem_text), len(images))

    try:
        async with task_slot():
            session = await create_session(problem_text, images)
    except BusyError as e:
        raise HTTPException(status_code=503, detail=str(e))

    return {
        "session_id": session.session_id,
        "subject": session.subject.value,
        "problem_type": session.problem_type,
    }


@app.get("/api/next-step/{session_id}")
async def next_step(session_id: str):
    try:
        async with task_slot(session_id):
            return StreamingResponse(
                generate_next_step(session_id),
                media_type="text/event-stream",
                headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
            )
    except BusyError as e:
        return _busy_sse(str(e))


@app.post("/api/chat")
async def chat(req: ChatRequest):
    try:
        async with task_slot(req.session_id):
            return StreamingResponse(
                handle_chat(req.session_id, req.message, req.referenced_step_index),
                media_type="text/event-stream",
                headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
            )
    except BusyError as e:
        return _busy_sse(str(e))


@app.get("/api/session/{session_id}")
async def get_session_info(session_id: str):
    session = get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="会话不存在")
    return {
        "session_id": session.session_id,
        "subject": session.subject.value,
        "problem_type": session.problem_type,
        "steps": [s.model_dump() for s in session.steps],
        "is_complete": session.is_complete,
        "prefetched_steps": len(session.prefetched_steps),
    }


@app.get("/api/queue")
async def queue_status():
    return {**queue_stats(), **runtime_stats()}


@app.get("/health")
async def health():
    return {"status": "ok", **queue_stats(), **runtime_stats()}
