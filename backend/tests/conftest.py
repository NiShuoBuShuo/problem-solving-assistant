"""
测试公共 Fixtures
- mock_llm_stream : 替换真实 LLM，返回预设 JSON chunk 序列
- mock_llm_complete: 替换非流式补全
- client          : FastAPI TestClient（同步）
- async_client    : httpx AsyncClient（用于 SSE 流式断言）
"""

import json
import os
import sys
from typing import AsyncGenerator
from unittest.mock import AsyncMock, patch

import pytest
import pytest_asyncio
from httpx import AsyncClient, ASGITransport

# 确保 backend 目录在 sys.path
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

os.environ.setdefault("API_TYPE", "openai")
os.environ.setdefault("MODEL", "mock-model")
os.environ.setdefault("OPENAI_API_KEY", "test-key")
os.environ.setdefault("API_BASE_URL", "http://mock")
os.environ.setdefault("OPENAI_ENABLE_THINKING", "false")
os.environ.setdefault("PREFETCH_STEPS", "0")
os.environ.setdefault("PERSIST_SESSIONS", "false")

from log_config import setup_logging
setup_logging()

# ── 预制 LLM 响应体 ────────────────────────────────────────

STEP_PROBLEM_TYPE = {
    "step_type": "problem_type",
    "title": "题型识别",
    "explanation": "这是一道一元二次方程求解题。",
    "formula": None,
    "conclusion": "确定为代数方程，需要因式分解或求根公式。",
    "citations": [],
    "is_final": False,
    "method_index": 0,
}

STEP_UNDERSTANDING = {
    "step_type": "understanding",
    "title": "题意理解",
    "explanation": "已知方程 x²-5x+6=0，求 x 的值。",
    "formula": "x^2 - 5x + 6 = 0",
    "conclusion": "目标：求方程的两个实数根。",
    "citations": [{"type": "in_problem", "text": "x²-5x+6=0", "source": None}],
    "is_final": False,
    "method_index": 0,
}

STEP_FINAL = {
    "step_type": "final_answer",
    "title": "最终答案",
    "explanation": "方程的两个根为 x=2 和 x=3。",
    "formula": "x_1=2,\\quad x_2=3",
    "conclusion": "x=2 或 x=3",
    "citations": [],
    "is_final": True,
    "method_index": 0,
}

DETECT_META = {
    "subject": "math",
    "problem_type": "一元二次方程",
    "grade_level": "初中",
    "brief": "求解方程",
}


async def _fake_stream(step_dict: dict) -> AsyncGenerator[str, None]:
    """将 step_dict 序列化为 JSON，逐字符 yield，模拟流式输出。"""
    text = json.dumps(step_dict, ensure_ascii=False)
    for ch in text:
        yield ch


# ── Fixtures ───────────────────────────────────────────────

@pytest.fixture
def mock_llm(request):
    """
    参数化 fixture：可通过 pytest.mark.parametrize 或 indirect 指定
    返回哪个 step；默认返回 STEP_PROBLEM_TYPE。
    """
    step = getattr(request, "param", STEP_PROBLEM_TYPE)

    async def fake_stream(*args, **kwargs):
        async for ch in _fake_stream(step):
            yield ch

    async def fake_complete(*args, **kwargs) -> str:
        return json.dumps(DETECT_META, ensure_ascii=False)

    with patch("agent._raw_stream_openai", side_effect=fake_stream), \
         patch("agent._raw_stream_anthropic", side_effect=fake_stream), \
         patch("agent._complete", new=AsyncMock(return_value=json.dumps(DETECT_META))):
        yield step


@pytest.fixture
def mock_llm_seq():
    """
    顺序多步 fixture：第 1 次调用 → STEP_PROBLEM_TYPE，
    第 2 次 → STEP_UNDERSTANDING，第 3 次 → STEP_FINAL。
    """
    steps = [STEP_PROBLEM_TYPE, STEP_UNDERSTANDING, STEP_FINAL]
    call_count = {"n": 0}

    async def fake_stream(*args, **kwargs):
        idx = min(call_count["n"], len(steps) - 1)
        call_count["n"] += 1
        async for ch in _fake_stream(steps[idx]):
            yield ch

    with patch("agent._raw_stream_openai", side_effect=fake_stream), \
         patch("agent._raw_stream_anthropic", side_effect=fake_stream), \
         patch("agent._complete", new=AsyncMock(return_value=json.dumps(DETECT_META))):
        yield steps


@pytest.fixture(autouse=True)
def reset_runtime_state():
    import agent
    import queue_manager as qm

    agent.sessions.clear()
    for task in list(agent.prefetch_tasks.values()):
        task.cancel()
    agent.prefetch_tasks.clear()
    qm._semaphore = None
    qm._queue_depth = 0
    qm._active = 0

    yield

    agent.sessions.clear()
    for task in list(agent.prefetch_tasks.values()):
        task.cancel()
    agent.prefetch_tasks.clear()


@pytest_asyncio.fixture
async def async_client(mock_llm):
    """httpx AsyncClient，适合 SSE 流式读取测试。"""
    from main import app
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        yield ac


@pytest_asyncio.fixture
async def async_client_seq(mock_llm_seq):
    from main import app
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        yield ac


async def create_session(ac: AsyncClient, text: str = "x²-5x+6=0，求x") -> str:
    """辅助函数：创建解题会话，返回 session_id。"""
    resp = await ac.post("/api/solve", data={"problem_text": text})
    assert resp.status_code == 200, resp.text
    return resp.json()["session_id"]


async def collect_sse(ac: AsyncClient, url: str) -> list[dict]:
    """收集 SSE 响应的所有 data 帧（解析为 dict 列表）。"""
    frames = []
    async with ac.stream("GET", url) as r:
        assert r.status_code == 200
        async for line in r.aiter_lines():
            line = line.strip()
            if line.startswith(":"):       # 心跳注释
                continue
            if line.startswith("data: "):
                try:
                    frames.append(json.loads(line[6:]))
                except json.JSONDecodeError:
                    pass
    return frames
