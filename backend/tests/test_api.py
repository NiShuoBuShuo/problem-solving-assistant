"""
API Integration Tests（mock LLM，真实 FastAPI 路由）

TDD 验收标准（来自 PRD §17）：
  AC-1  输入题目 → 识别学科，进入分步流程
  AC-2  /next-step 每次只生成一个步骤，不跳步
  AC-3  步骤卡片结构完整（step_type / title / content / is_final）
  AC-4  SSE 流式返回 chunk 帧，最终帧含完整 step
  AC-5  顺序多步：步骤 index 严格递增
  AC-6  追问不重置步骤（session steps 不减少）
  AC-7  队列满时 SSE 推送 busy 帧
  AC-8  无题目内容 → 400
  AC-9  不存在的 session → 步骤/聊天返回 error 帧
  AC-10 /health 含队列信息
"""

import asyncio
import json
import pytest
import pytest_asyncio
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from httpx import AsyncClient, ASGITransport
from tests.conftest import (
    create_session, collect_sse,
    STEP_PROBLEM_TYPE, STEP_UNDERSTANDING, STEP_FINAL, DETECT_META,
)


# ── AC-1  创建会话 ────────────────────────────────────────

class TestSolveEndpoint:
    @pytest.mark.asyncio
    async def test_ac1_creates_session_with_subject(self, async_client):
        """AC-1: 识别学科，返回 session_id + subject。"""
        resp = await async_client.post("/api/solve", data={"problem_text": "x²-5x+6=0，求x"})
        assert resp.status_code == 200
        body = resp.json()
        assert "session_id" in body
        assert body["subject"] == "math"
        assert body["problem_type"] != ""

    @pytest.mark.asyncio
    async def test_ac8_empty_problem_returns_400(self, async_client):
        """AC-8: 无内容提交 → 400。"""
        resp = await async_client.post("/api/solve", data={"problem_text": "  "})
        assert resp.status_code == 400

    @pytest.mark.asyncio
    async def test_session_persists_in_store(self, async_client):
        """创建后可通过 /api/session/{id} 查到。"""
        sid = await create_session(async_client)
        resp = await async_client.get(f"/api/session/{sid}")
        assert resp.status_code == 200
        assert resp.json()["session_id"] == sid


# ── AC-2/3/4  下一步流式生成 ──────────────────────────────

class TestNextStep:
    @pytest.mark.asyncio
    async def test_ac4_sse_contains_chunks_then_step(self, async_client):
        """AC-4: SSE 先有 chunk 帧，最后有含 step 的 done 帧。"""
        sid = await create_session(async_client)
        frames = await collect_sse(async_client, f"/api/next-step/{sid}")

        chunk_frames = [f for f in frames if "chunk" in f]
        done_frames  = [f for f in frames if f.get("done")]

        assert len(chunk_frames) > 0, "应该有 chunk 流式帧"
        assert len(done_frames) == 1, "应该有且仅有一个 done 帧"
        assert "step" in done_frames[0], "done 帧必须包含 step"

    @pytest.mark.asyncio
    async def test_ac2_one_step_per_call(self, async_client):
        """AC-2: 每次 /next-step 只产生一个步骤。"""
        sid = await create_session(async_client)
        frames = await collect_sse(async_client, f"/api/next-step/{sid}")
        steps = [f["step"] for f in frames if f.get("done") and "step" in f]
        assert len(steps) == 1

    @pytest.mark.asyncio
    async def test_ac3_step_has_required_fields(self, async_client):
        """AC-3: 步骤结构完整。"""
        sid = await create_session(async_client)
        frames = await collect_sse(async_client, f"/api/next-step/{sid}")
        step = next(f["step"] for f in frames if f.get("done") and "step" in f)

        assert "step_type" in step
        assert "title" in step
        assert "content" in step
        assert "explanation" in step["content"]
        assert "is_final" in step

    @pytest.mark.asyncio
    async def test_ac9_unknown_session_returns_error(self, async_client):
        """AC-9: 不存在的 session → error 帧。"""
        frames = await collect_sse(async_client, "/api/next-step/nonexistent-id")
        errors = [f for f in frames if "error" in f]
        assert len(errors) > 0


# ── AC-5  多步顺序 ────────────────────────────────────────

class TestMultiStep:
    @pytest.mark.asyncio
    async def test_ac5_step_indices_increment(self, async_client_seq):
        """AC-5: 连续调用 step_index 严格递增（0 → 1 → 2）。"""
        sid = await create_session(async_client_seq)
        indices = []
        for _ in range(3):
            frames = await collect_sse(async_client_seq, f"/api/next-step/{sid}")
            step = next((f["step"] for f in frames if f.get("done") and "step" in f), None)
            if step:
                indices.append(step["step_index"])

        assert indices == list(range(len(indices))), f"步骤 index 不递增: {indices}"

    @pytest.mark.asyncio
    async def test_last_step_is_final(self, async_client_seq):
        """最后一步的 is_final 为 True。"""
        sid = await create_session(async_client_seq)
        last_step = None
        for _ in range(3):
            frames = await collect_sse(async_client_seq, f"/api/next-step/{sid}")
            step = next((f["step"] for f in frames if f.get("done") and "step" in f), None)
            if step:
                last_step = step
        assert last_step is not None
        assert last_step["is_final"] is True

    @pytest.mark.asyncio
    async def test_session_marks_complete_after_final(self, async_client_seq):
        """is_final 步骤后，session.is_complete 变为 True。"""
        sid = await create_session(async_client_seq)
        for _ in range(3):
            await collect_sse(async_client_seq, f"/api/next-step/{sid}")
        info = (await async_client_seq.get(f"/api/session/{sid}")).json()
        assert info["is_complete"] is True

    @pytest.mark.asyncio
    async def test_prefetch_populates_buffer_after_visible_step(self, async_client_seq, monkeypatch):
        monkeypatch.setenv("PREFETCH_STEPS", "1")
        sid = await create_session(async_client_seq)

        await collect_sse(async_client_seq, f"/api/next-step/{sid}")
        await asyncio.sleep(0.05)

        info = (await async_client_seq.get(f"/api/session/{sid}")).json()
        assert info["prefetched_steps"] == 1

    @pytest.mark.asyncio
    async def test_next_step_uses_prefetched_cache(self, async_client_seq, monkeypatch):
        monkeypatch.setenv("PREFETCH_STEPS", "1")
        sid = await create_session(async_client_seq)

        await collect_sse(async_client_seq, f"/api/next-step/{sid}")
        await asyncio.sleep(0.05)

        frames = await collect_sse(async_client_seq, f"/api/next-step/{sid}")
        done = next(f for f in frames if f.get("done"))

        assert done.get("cached") is True
        assert done["step"]["step_index"] == 1
        assert not any("chunk" in f for f in frames)


# ── AC-6  追问不重置步骤 ──────────────────────────────────

class TestChat:
    @pytest.mark.asyncio
    async def test_ac6_chat_does_not_reset_steps(self, async_client):
        """AC-6: 追问后步骤数量不减少。"""
        sid = await create_session(async_client)
        await collect_sse(async_client, f"/api/next-step/{sid}")

        before = (await async_client.get(f"/api/session/{sid}")).json()
        step_count_before = len(before["steps"])

        # 发送一条解释追问（纯文字回答，不产生新步骤）
        async with async_client.stream("POST", "/api/chat", json={
            "session_id": sid,
            "message": "为什么这样分解？",
            "referenced_step_index": 0,
        }) as r:
            async for _ in r.aiter_lines():
                pass  # 消费完 SSE

        after = (await async_client.get(f"/api/session/{sid}")).json()
        assert len(after["steps"]) >= step_count_before, "追问后步骤不应减少"

    @pytest.mark.asyncio
    async def test_chat_invalidates_prefetched_steps(self, async_client_seq, monkeypatch):
        monkeypatch.setenv("PREFETCH_STEPS", "1")
        sid = await create_session(async_client_seq)
        await collect_sse(async_client_seq, f"/api/next-step/{sid}")
        await asyncio.sleep(0.05)

        before = (await async_client_seq.get(f"/api/session/{sid}")).json()
        assert before["prefetched_steps"] == 1

        async with async_client_seq.stream("POST", "/api/chat", json={
            "session_id": sid,
            "message": "为什么这样理解？",
            "referenced_step_index": 0,
        }) as r:
            async for _ in r.aiter_lines():
                pass

        after = (await async_client_seq.get(f"/api/session/{sid}")).json()
        assert after["prefetched_steps"] == 0

    @pytest.mark.asyncio
    async def test_ac9_chat_unknown_session_returns_error(self, async_client):
        """AC-9: 不存在的 session 聊天 → error 帧。"""
        frames = []
        async with async_client.stream("POST", "/api/chat", json={
            "session_id": "bad-id",
            "message": "test",
            "referenced_step_index": None,
        }) as r:
            async for line in r.aiter_lines():
                line = line.strip()
                if line.startswith("data: "):
                    try:
                        frames.append(json.loads(line[6:]))
                    except Exception:
                        pass
        assert any("error" in f for f in frames)


# ── AC-7  队列繁忙 ────────────────────────────────────────

class TestQueueBusy:
    @pytest.mark.asyncio
    async def test_ac7_busy_frame_when_queue_full(self, async_client):
        """AC-7: 队列满时 SSE 推送 busy:true 帧。"""
        import queue_manager as qm
        sid = await create_session(async_client)
        original = qm._queue_depth
        qm._queue_depth = qm.MAX_QUEUE  # 模拟队列满

        try:
            frames = await collect_sse(async_client, f"/api/next-step/{sid}")
            busy_frames = [f for f in frames if f.get("busy")]
            assert len(busy_frames) > 0, f"应收到 busy 帧，实际收到: {frames}"
        finally:
            qm._queue_depth = original  # 恢复


# ── AC-10 Health ──────────────────────────────────────────

class TestHealth:
    @pytest.mark.asyncio
    async def test_ac10_health_contains_queue_info(self, async_client):
        """AC-10: /health 包含队列状态字段。"""
        resp = await async_client.get("/health")
        assert resp.status_code == 200
        body = resp.json()
        assert "active" in body
        assert "queued" in body
        assert "max_concurrent" in body
