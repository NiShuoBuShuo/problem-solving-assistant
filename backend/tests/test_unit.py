"""
Unit Tests（纯逻辑，无网络）
覆盖：_extract_json / _parse_step / OpenAI 请求参数 / queue_manager
"""

import asyncio
import json
import pytest
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from agent import (
    _extract_json,
    _parse_step,
    _openai_request_kwargs,
    _repair_json_string_escapes,
    _save_sessions_to_disk,
    load_sessions_from_disk,
    runtime_stats,
    sessions,
)
from models import StepType, CitationType, SessionState, Subject


# ─────────────────────────────────────────────
# _extract_json
# ─────────────────────────────────────────────

class TestExtractJson:
    def test_plain_json(self):
        raw = '{"step_type": "derivation", "title": "推导"}'
        assert _extract_json(raw)["step_type"] == "derivation"

    def test_json_in_markdown_block(self):
        raw = '```json\n{"step_type": "summary", "title": "总结"}\n```'
        assert _extract_json(raw)["title"] == "总结"

    def test_json_with_prefix_text(self):
        raw = '好的，这是第一步：\n{"step_type": "approach", "title": "思路"}'
        assert _extract_json(raw)["step_type"] == "approach"

    def test_raises_on_no_json(self):
        with pytest.raises(ValueError):
            _extract_json("这里没有 JSON")

    def test_nested_json(self):
        data = {"step_type": "derivation", "citations": [{"type": "in_problem", "text": "题干"}]}
        assert _extract_json(json.dumps(data))["citations"][0]["text"] == "题干"

    def test_repairs_invalid_latex_escape(self):
        raw = '{"step_type":"derivation","title":"推导","explanation":"由 \\angle ABC = 30° 可知"}'
        assert _extract_json(raw)["explanation"] == "由 \\angle ABC = 30° 可知"

    def test_repairs_silent_text_escape(self):
        raw = '{"step_type":"derivation","title":"推导","formula":"\\text{AB}=2"}'
        assert _extract_json(raw)["formula"] == "\\text{AB}=2"

    def test_repair_helper_preserves_json_newline(self):
        raw = '{"explanation":"第一行\\n第二行","formula":"\\frac{1}{2}"}'
        repaired = _repair_json_string_escapes(raw)
        parsed = json.loads(repaired)
        assert parsed["explanation"] == "第一行\n第二行"
        assert parsed["formula"] == "\\frac{1}{2}"

    def test_repairs_bare_quotes_inside_string(self):
        raw = '{"step_type":"derivation","title":"受力分析","explanation":"规定 "向右" 为正方向"}'
        assert _extract_json(raw)["explanation"] == '规定 "向右" 为正方向'

    def test_repairs_raw_newline_inside_string(self):
        raw = '{"step_type":"derivation","title":"分析","details":"先分析受力\n再列方程"}'
        assert _extract_json(raw)["details"] == "先分析受力\n再列方程"

    def test_repairs_unterminated_string_at_end(self):
        raw = '{"step_type":"derivation","title":"分析","details":"列出已知条件}'
        assert _extract_json(raw)["details"] == "列出已知条件"


# ─────────────────────────────────────────────
# _parse_step
# ─────────────────────────────────────────────

class TestParseStep:
    BASE = {
        "step_type": "final_answer",
        "title": "最终答案",
        "explanation": "x=2 或 x=3",
        "formula": "x_1=2, x_2=3",
        "conclusion": "解为 2 和 3",
        "citations": [{"type": "in_problem", "text": "原题"}],
        "is_final": True,
    }

    def test_basic_parse(self):
        step = _parse_step(self.BASE, step_index=0)
        assert step.step_type == StepType.FINAL_ANSWER
        assert step.is_final is True
        assert step.content.formula == "x_1=2, x_2=3"

    def test_citations_parsed(self):
        step = _parse_step(self.BASE, step_index=0)
        assert len(step.content.citations) == 1
        assert step.content.citations[0].type == CitationType.IN_PROBLEM

    def test_unknown_step_type_fallback(self):
        data = {**self.BASE, "step_type": "nonexistent_type"}
        step = _parse_step(data, step_index=0)
        assert step.step_type == StepType.DERIVATION

    def test_step_index_assigned(self):
        step = _parse_step(self.BASE, step_index=5)
        assert step.step_index == 5

    def test_method_index(self):
        step = _parse_step(self.BASE, step_index=0, method_index=2)
        assert step.method_index == 2

    def test_empty_formula_becomes_none(self):
        data = {**self.BASE, "formula": ""}
        step = _parse_step(data, step_index=0)
        assert step.content.formula is None

    def test_diagram_tikz_is_preserved(self):
        data = {
            **self.BASE,
            "diagram_tikz": "\\begin{tikzpicture}[scale=1]\\draw[->] (0,0)--(1,0) node[right] {$v$};\\end{tikzpicture}",
        }
        step = _parse_step(data, step_index=0)
        assert step.content.diagram_tikz is not None
        assert "\\draw" in step.content.diagram_tikz


class TestOpenAIRequestKwargs:
    def test_dashscope_defaults_to_disable_thinking(self, monkeypatch):
        monkeypatch.delenv("OPENAI_ENABLE_THINKING", raising=False)
        monkeypatch.setenv("API_BASE_URL", "https://dashscope.aliyuncs.com/compatible-mode/v1")

        kwargs = _openai_request_kwargs("sys", [{"role": "user", "content": "hi"}], 123, stream=True)

        assert kwargs["stream"] is True
        assert kwargs["extra_body"] == {"enable_thinking": False}

    def test_explicit_thinking_flag_overrides_default(self, monkeypatch):
        monkeypatch.setenv("OPENAI_ENABLE_THINKING", "true")

        kwargs = _openai_request_kwargs("sys", [{"role": "user", "content": "hi"}], 123)

        assert kwargs["extra_body"] == {"enable_thinking": True}


class TestSessionPersistence:
    def test_save_and_restore_sessions(self, monkeypatch, tmp_path):
        monkeypatch.setenv("PERSIST_SESSIONS", "true")
        monkeypatch.setenv("SESSION_STORE_PATH", str(tmp_path / "sessions.json"))

        sessions["demo"] = SessionState(
            session_id="demo",
            problem_text="1+1=?",
            subject=Subject.MATH,
            problem_type="计算",
        )
        _save_sessions_to_disk()
        sessions.clear()

        load_sessions_from_disk()

        assert "demo" in sessions
        assert sessions["demo"].problem_text == "1+1=?"

    def test_runtime_stats_reflect_session_counts(self, monkeypatch, tmp_path):
        monkeypatch.setenv("PERSIST_SESSIONS", "true")
        monkeypatch.setenv("SESSION_STORE_PATH", str(tmp_path / "sessions.json"))

        sessions["s1"] = SessionState(session_id="s1", problem_text="a", subject=Subject.MATH)
        stats = runtime_stats()

        assert stats["sessions"] == 1
        assert stats["persistence"] is True


# ─────────────────────────────────────────────
# Queue Manager
# ─────────────────────────────────────────────

class TestQueueManager:
    def setup_method(self):
        # 每个测试前重置队列状态
        import queue_manager as qm
        qm._semaphore = None
        qm._queue_depth = 0
        qm._active = 0

    @pytest.mark.asyncio
    async def test_normal_task_runs(self):
        from queue_manager import task_slot, queue_stats
        async with task_slot("test-session"):
            stats = queue_stats()
            assert stats["active"] == 1

    @pytest.mark.asyncio
    async def test_busy_error_when_queue_full(self):
        from queue_manager import BusyError, MAX_QUEUE
        import queue_manager as qm
        qm._queue_depth = MAX_QUEUE  # 模拟队列已满

        with pytest.raises(BusyError):
            async with qm.task_slot("overflow-session"):
                pass

    @pytest.mark.asyncio
    async def test_depth_restored_after_task(self):
        from queue_manager import task_slot, queue_stats
        async with task_slot("s1"):
            pass
        stats = queue_stats()
        assert stats["active"] == 0
        assert stats["queued"] == 0

    @pytest.mark.asyncio
    async def test_concurrent_limit(self):
        """同时发起 MAX_CONCURRENT+2 个任务，只有 MAX_CONCURRENT 个并发执行。"""
        from queue_manager import task_slot, MAX_CONCURRENT
        import queue_manager as qm

        max_seen_active = 0
        lock = asyncio.Lock()

        async def _task(sid: str):
            nonlocal max_seen_active
            async with task_slot(sid):
                async with lock:
                    if qm._active > max_seen_active:
                        max_seen_active = qm._active
                await asyncio.sleep(0.02)

        tasks = [asyncio.create_task(_task(f"s{i}")) for i in range(MAX_CONCURRENT + 2)]
        await asyncio.gather(*tasks)
        assert max_seen_active <= MAX_CONCURRENT
