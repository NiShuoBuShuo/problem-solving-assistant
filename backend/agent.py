"""
核心 Agent 逻辑
- 支持 Anthropic / OpenAI 兼容接口
- 全程流式 SSE（含心跳 keep-alive）
- asyncio.wait_for 超时保护
- 完整 logging
"""

import asyncio
import json
import logging
import os
import re
import string
import time
import uuid
from pathlib import Path
from typing import AsyncGenerator, Optional

import anthropic
import openai

from models import (
    Citation, CitationType, PrefetchedStep, SessionState, Step, StepContent, StepType, Subject,
)
from skills import DETECT_SUBJECT_PROMPT, build_system_prompt, get_loader
from queue_manager import BusyError, task_slot

logger = logging.getLogger("agent")

# ── 配置 ───────────────────────────────────────────────────
API_TYPE    = os.getenv("API_TYPE", "anthropic").lower()
MODEL       = os.getenv("MODEL", "claude-sonnet-4-6")
API_BASE_URL = (os.getenv("API_BASE_URL") or os.getenv("OPENAI_API_BASE_URL") or "").strip()

MODEL_TIMEOUT   = int(os.getenv("MODEL_TIMEOUT", "120"))   # 单次流式调用总超时（秒）
HEARTBEAT_INTERVAL = 8                                      # SSE 心跳间隔（秒）

# ── 客户端（懒加载）────────────────────────────────────────
_anthropic_client: "Optional[anthropic.AsyncAnthropic]" = None
_openai_client:    "Optional[openai.AsyncOpenAI]"        = None


def _env_flag(name: str, default: bool = False) -> bool:
    raw = os.getenv(name)
    if raw is None:
        return default
    return raw.strip().lower() in {"1", "true", "yes", "on"}


def _openai_extra_body() -> Optional[dict]:
    """
    DashScope 等兼容端点支持 enable_thinking。
    - 显式配置 OPENAI_ENABLE_THINKING 时，以配置为准
    - DashScope 默认关闭 thinking，避免首包过慢
    """
    configured = os.getenv("OPENAI_ENABLE_THINKING")
    base_url = (os.getenv("API_BASE_URL") or os.getenv("OPENAI_API_BASE_URL") or API_BASE_URL).strip()
    if configured is not None:
        return {"enable_thinking": _env_flag("OPENAI_ENABLE_THINKING", False)}
    if "dashscope.aliyuncs.com" in base_url:
        return {"enable_thinking": False}
    return None


def _openai_request_kwargs(system: str, messages: list[dict], max_tokens: int, stream: bool = False) -> dict:
    kwargs = {
        "model": MODEL,
        "max_tokens": max_tokens,
        "messages": [{"role": "system", "content": system}] + messages,
    }
    extra_body = _openai_extra_body()
    if extra_body:
        kwargs["extra_body"] = extra_body
    if stream:
        kwargs["stream"] = True
    return kwargs


def _get_anthropic() -> anthropic.AsyncAnthropic:
    global _anthropic_client
    if _anthropic_client is None:
        kwargs: dict = {"api_key": os.getenv("ANTHROPIC_API_KEY")}
        if API_BASE_URL:
            kwargs["base_url"] = API_BASE_URL
        _anthropic_client = anthropic.AsyncAnthropic(**kwargs)
        logger.info("Anthropic client ready  base_url=%s", API_BASE_URL or "(default)")
    return _anthropic_client


def _get_openai() -> openai.AsyncOpenAI:
    global _openai_client
    if _openai_client is None:
        api_key = os.getenv("OPENAI_API_KEY") or os.getenv("ANTHROPIC_API_KEY", "")
        kwargs: dict = {"api_key": api_key}
        if API_BASE_URL:
            kwargs["base_url"] = API_BASE_URL
        _openai_client = openai.AsyncOpenAI(**kwargs)
        thinking = _openai_extra_body()
        logger.info(
            "OpenAI-compat client ready  model=%s  base_url=%s  thinking=%s",
            MODEL,
            API_BASE_URL,
            "(provider default)" if not thinking else thinking.get("enable_thinking"),
        )
    return _openai_client


# ── 会话存储 ────────────────────────────────────────────────
sessions: dict[str, SessionState] = {}
prefetch_tasks: dict[str, asyncio.Task] = {}


def _session_store_enabled() -> bool:
    return _env_flag("PERSIST_SESSIONS", True)


def _session_store_path() -> Path:
    raw = os.getenv("SESSION_STORE_PATH", "data/sessions.json")
    path = Path(raw)
    if not path.is_absolute():
        path = Path(__file__).resolve().parent / path
    return path


def _session_runtime_stats() -> dict:
    return {
        "sessions": len(sessions),
        "prefetched_steps": sum(len(s.prefetched_steps) for s in sessions.values()),
        "persistence": _session_store_enabled(),
        "session_store_path": str(_session_store_path()),
        "prefetch_limit": _prefetch_limit(),
    }


def _save_sessions_to_disk() -> None:
    if not _session_store_enabled():
        return

    store_path = _session_store_path()
    store_path.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "sessions": {
            sid: session.model_dump(mode="json")
            for sid, session in sessions.items()
        }
    }

    tmp_path = store_path.with_suffix(store_path.suffix + ".tmp")
    tmp_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    tmp_path.replace(store_path)


def load_sessions_from_disk() -> None:
    sessions.clear()
    if not _session_store_enabled():
        logger.info("Session persistence disabled")
        return

    store_path = _session_store_path()
    if not store_path.exists():
        logger.info("Session store not found  path=%s", store_path)
        return

    try:
        raw = json.loads(store_path.read_text(encoding="utf-8"))
        restored = 0
        for sid, data in raw.get("sessions", {}).items():
            session = SessionState.model_validate(data)
            session.prefetched_steps.clear()
            session.prefetch_generation = 0
            sessions[sid] = session
            restored += 1
        logger.info("Sessions restored  count=%d path=%s", restored, store_path)
    except Exception:
        logger.exception("Failed to restore sessions  path=%s", store_path)


# ── JSON / Step 工具函数 ────────────────────────────────────

def _extract_json(text: str) -> dict:
    text = text.strip()
    m = re.search(r"```(?:json)?\s*([\s\S]*?)```", text)
    if m:
        text = m.group(1).strip()
    s, e = text.find("{"), text.rfind("}")
    if s != -1 and e != -1:
        candidate = text[s:e + 1]
        repaired = _repair_json_string_escapes(candidate)
        if repaired != candidate:
            logger.warning("Repaired JSON escapes before parsing")
        return json.loads(repaired)
    raise ValueError(f"No JSON in response (first 200): {text[:200]}")


def _repair_json_string_escapes(text: str) -> str:
    """
    修复模型常见的字符串损坏问题：
    例：
    - \\angle / \\triangle / \\cdot / \\frac
    - \\text 被 JSON 当成 \\t + ext，虽然不一定报错，但内容会被悄悄破坏
    - 字符串里混入裸双引号
    - 字符串里混入裸换行 / 制表符
    - 末尾字符串未闭合
    """
    out: list[str] = []
    in_string = False
    i = 0
    n = len(text)

    while i < n:
        ch = text[i]

        if not in_string:
            out.append(ch)
            if ch == '"':
                backslashes = 0
                j = i - 1
                while j >= 0 and text[j] == "\\":
                    backslashes += 1
                    j -= 1
                if backslashes % 2 == 0:
                    in_string = True
            i += 1
            continue

        if ch == '"':
            backslashes = 0
            j = i - 1
            while j >= 0 and text[j] == "\\":
                backslashes += 1
                j -= 1
            if backslashes % 2 == 0:
                k = i + 1
                while k < n and text[k] in " \t\r\n":
                    k += 1
                next_sig = text[k] if k < n else ""
                if next_sig in {",", "}", "]", ":"} or not next_sig:
                    out.append(ch)
                    in_string = False
                else:
                    out.append('\\"')
            else:
                out.append(ch)
            i += 1
            continue

        if ch == "\n":
            out.append("\\n")
            i += 1
            continue

        if ch == "\r":
            out.append("\\r")
            i += 1
            continue

        if ch == "\t":
            out.append("\\t")
            i += 1
            continue

        if ch in "}]" and not text[i + 1:].strip():
            out.append('"')
            in_string = False
            continue

        if ch != "\\":
            out.append(ch)
            i += 1
            continue

        if i + 1 >= n:
            out.append("\\\\")
            i += 1
            continue

        nxt = text[i + 1]
        next2 = text[i + 2] if i + 2 < n else ""

        if nxt in {'"', "\\", "/"}:
            out.append("\\")
            out.append(nxt)
            i += 2
            continue

        if nxt == "u" and i + 5 < n and all(c in "0123456789abcdefABCDEF" for c in text[i + 2:i + 6]):
            out.append(text[i:i + 6])
            i += 6
            continue

        if nxt in {"b", "f", "n", "r", "t"} and next2 not in string.ascii_letters:
            out.append("\\")
            out.append(nxt)
            i += 2
            continue

        out.append("\\\\")
        i += 1

    if in_string:
        out.append('"')

    return "".join(out)


def _prefetch_limit() -> int:
    try:
        return max(0, int(os.getenv("PREFETCH_STEPS", "0")))
    except ValueError:
        return 0


def _parse_step(data: dict, step_index: int, method_index: int = 0) -> Step:
    citations = []
    for c in data.get("citations", []):
        try:
            citations.append(Citation(
                type=CitationType(c.get("type", "background")),
                text=c.get("text", ""),
                source=c.get("source"),
            ))
        except Exception:
            pass
    try:
        step_type = StepType(data.get("step_type", "derivation"))
    except ValueError:
        step_type = StepType.DERIVATION

    return Step(
        step_index=step_index,
        step_type=step_type,
        title=data.get("title", f"步骤 {step_index + 1}"),
        content=StepContent(
            explanation=data.get("explanation", ""),
            key_point=data.get("key_point") or None,
            details=data.get("details") or None,
            formula=data.get("formula") or None,
            conclusion=data.get("conclusion") or None,
            diagram_svg=data.get("diagram_svg") or None,
            diagram_tikz=data.get("diagram_tikz") or None,
            diagram_caption=data.get("diagram_caption") or None,
            citations=citations,
        ),
        is_final=data.get("is_final", False),
        method_index=method_index,
        method_name=data.get("method_name") or None,
    )


def _next_step_prompt(steps: list[Step]) -> Optional[str]:
    if not steps:
        return None
    step_no = len(steps) + 1
    completed = "、".join(f"{i+1}.{s.title}" for i, s in enumerate(steps))
    return f"继续，请输出下一步（第{step_no}步）。已完成：{completed}。只输出一个步骤的 JSON。"


def _commit_step(session: SessionState, step: Step, raw_response: str) -> Step:
    prompt = _next_step_prompt(session.steps)
    if prompt:
        session.messages.append({"role": "user", "content": prompt})

    committed = step.model_copy(update={"step_index": len(session.steps)})
    session.steps.append(committed)
    session.messages.append({"role": "assistant", "content": raw_response})
    session.current_step_index = committed.step_index

    if committed.is_final:
        session.is_complete = True
        session.prefetched_steps.clear()

    _save_sessions_to_disk()
    return committed


def _cancel_prefetch_task(session_id: str) -> None:
    task = prefetch_tasks.pop(session_id, None)
    if task and not task.done():
        task.cancel()


def _invalidate_prefetch(session: SessionState) -> None:
    session.prefetch_generation += 1
    session.prefetched_steps.clear()
    _cancel_prefetch_task(session.session_id)


def _close_prefetch_task(task: asyncio.Task) -> None:
    for sid, current in list(prefetch_tasks.items()):
        if current is task:
            prefetch_tasks.pop(sid, None)
            break


async def _generate_step_once(
    system_prompt: str,
    messages: list[dict],
    step_index: int,
    method_index: int,
) -> tuple[str, Step]:
    full_response = ""
    async for chunk in _stream_with_heartbeat(system_prompt, messages, max_tokens=1500):
        if chunk == "__TIMEOUT__":
            raise TimeoutError(f"模型响应超时（>{MODEL_TIMEOUT}s）")
        if isinstance(chunk, str) and chunk.startswith("__ERROR__:"):
            raise RuntimeError(chunk[10:])
        if isinstance(chunk, str) and chunk.startswith(": "):
            continue
        full_response += chunk
    data = _extract_json(full_response)
    return full_response, _parse_step(data, step_index, method_index)


async def _run_prefetch(session_id: str, generation: int) -> None:
    session = sessions.get(session_id)
    if not session or session.is_complete:
        return

    limit = _prefetch_limit()
    if limit <= 0:
        return

    try:
        async with task_slot(f"{session_id}:prefetch", allow_wait=False):
            session = sessions.get(session_id)
            if not session or session.is_complete or session.prefetch_generation != generation:
                return

            system_prompt = build_system_prompt(session.subject.value, session.problem_type)
            working_messages = list(session.messages)
            working_steps = list(session.steps)

            for item in session.prefetched_steps:
                prompt = _next_step_prompt(working_steps)
                if prompt:
                    working_messages.append({"role": "user", "content": prompt})
                working_messages.append({"role": "assistant", "content": item.raw_response})
                working_steps.append(item.step)

            while (
                len(session.prefetched_steps) < limit
                and not session.is_complete
                and session.prefetch_generation == generation
            ):
                prompt = _next_step_prompt(working_steps)
                if prompt:
                    working_messages.append({"role": "user", "content": prompt})

                step_index = len(working_steps)
                raw_response, step = await _generate_step_once(
                    system_prompt,
                    working_messages,
                    step_index=step_index,
                    method_index=session.current_method,
                )

                if session.prefetch_generation != generation:
                    return

                session.prefetched_steps.append(PrefetchedStep(step=step, raw_response=raw_response))
                working_messages.append({"role": "assistant", "content": raw_response})
                working_steps.append(step)
                _save_sessions_to_disk()

                logger.info(
                    "Prefetched step %d  title=%s  final=%s session=%s",
                    step.step_index + 1,
                    step.title,
                    step.is_final,
                    session_id,
                )

                if step.is_final:
                    break

    except BusyError:
        logger.debug("Prefetch skipped due to busy executor  session=%s", session_id)
    except asyncio.CancelledError:
        logger.debug("Prefetch cancelled  session=%s", session_id)
        raise
    except Exception:
        logger.exception("Prefetch failed  session=%s", session_id)


def _schedule_prefetch(session_id: str) -> None:
    session = sessions.get(session_id)
    if not session or session.is_complete:
        return
    if _prefetch_limit() <= 0:
        return
    if len(session.prefetched_steps) >= _prefetch_limit():
        return
    existing = prefetch_tasks.get(session_id)
    if existing and not existing.done():
        return

    task = asyncio.create_task(_run_prefetch(session_id, session.prefetch_generation))
    task.add_done_callback(_close_prefetch_task)
    prefetch_tasks[session_id] = task


# ── 图片块构造 ──────────────────────────────────────────────

def _img_anthropic(img_b64: str) -> dict:
    if img_b64.startswith("data:"):
        header, data = img_b64.split(",", 1)
        media_type = header.split(":")[1].split(";")[0]
    else:
        data, media_type = img_b64, "image/jpeg"
    return {"type": "image", "source": {"type": "base64", "media_type": media_type, "data": data}}


def _img_openai(img_b64: str) -> dict:
    if not img_b64.startswith("data:"):
        img_b64 = f"data:image/jpeg;base64,{img_b64}"
    return {"type": "image_url", "image_url": {"url": img_b64}}


def _img(img_b64: str) -> dict:
    return _img_openai(img_b64) if API_TYPE == "openai" else _img_anthropic(img_b64)


# ── 流式生成核心（带心跳）──────────────────────────────────

async def _stream_with_heartbeat(
    system: str,
    messages: list[dict],
    max_tokens: int = 1500,
) -> AsyncGenerator[str, None]:
    """
    将模型的流式输出与 SSE 心跳合并：
      - 模型有输出时 yield 文本 chunk
      - 超过 HEARTBEAT_INTERVAL 秒无输出时 yield ": ping"（SSE 注释，前端忽略）
      - 整体受 MODEL_TIMEOUT 约束
    """
    # 选择生成器
    if API_TYPE == "openai":
        gen = _raw_stream_openai(system, messages, max_tokens)
    else:
        gen = _raw_stream_anthropic(system, messages, max_tokens)

    # 用 asyncio.Queue 桥接，以便心跳 task 与消费者并行
    q: asyncio.Queue = asyncio.Queue()

    async def _producer():
        async def _drain():
            async for chunk in gen:
                await q.put(chunk)

        try:
            await asyncio.wait_for(_drain(), timeout=MODEL_TIMEOUT)
        except asyncio.TimeoutError:
            await q.put("__TIMEOUT__")
        except Exception as exc:
            await q.put(f"__ERROR__:{exc}")
        finally:
            await q.put(None)  # 结束标志

    producer_task = asyncio.create_task(_producer())
    last_data = time.monotonic()

    try:
        while True:
            try:
                item = await asyncio.wait_for(q.get(), timeout=HEARTBEAT_INTERVAL)
            except asyncio.TimeoutError:
                # 心跳
                yield ": ping"
                logger.debug("SSE heartbeat sent")
                continue

            if item is None:
                break
            if item == "__TIMEOUT__":
                logger.warning("Model timeout after %ds", MODEL_TIMEOUT)
                yield "__TIMEOUT__"
                break
            if isinstance(item, str) and item.startswith("__ERROR__:"):
                yield item
                break

            last_data = time.monotonic()
            yield item
    finally:
        producer_task.cancel()
        try:
            await producer_task
        except asyncio.CancelledError:
            pass


async def _raw_stream_anthropic(
    system: str, messages: list[dict], max_tokens: int
) -> AsyncGenerator[str, None]:
    client = _get_anthropic()
    async with client.messages.stream(
        model=MODEL,
        max_tokens=max_tokens,
        system=system,
        messages=messages,
    ) as stream:
        async for chunk in stream.text_stream:
            yield chunk


async def _raw_stream_openai(
    system: str, messages: list[dict], max_tokens: int
) -> AsyncGenerator[str, None]:
    """
    使用底层 create(..., stream=True) 而非 .stream() 高阶封装，
    兼容 DashScope / 智谱 / Ollama 等所有 OpenAI 兼容端点。
    """
    client = _get_openai()
    response = await client.chat.completions.create(
        **_openai_request_kwargs(system, messages, max_tokens, stream=True),
    )
    async for chunk in response:
        choices = getattr(chunk, "choices", None)
        if not choices:
            continue
        delta = choices[0].delta
        delta_content = getattr(delta, "content", None)
        if delta_content:
            yield delta_content


# ── 非流式补全 ──────────────────────────────────────────────

async def _complete(system: str, messages: list[dict], max_tokens: int = 512) -> str:
    if API_TYPE == "openai":
        client = _get_openai()
        resp = await asyncio.wait_for(
            client.chat.completions.create(**_openai_request_kwargs(system, messages, max_tokens)),
            timeout=MODEL_TIMEOUT,
        )
        return resp.choices[0].message.content or ""
    else:
        client = _get_anthropic()
        resp = await asyncio.wait_for(
            client.messages.create(model=MODEL, max_tokens=max_tokens, system=system, messages=messages),
            timeout=MODEL_TIMEOUT,
        )
        return resp.content[0].text


# ── SSE 帧工具 ─────────────────────────────────────────────

def _sse(payload: dict) -> str:
    return f"data: {json.dumps(payload, ensure_ascii=False)}\n\n"


# ── 会话创建 ────────────────────────────────────────────────

async def detect_subject(problem_text: str, images: list[str]) -> dict:
    content: list[dict] = [_img(i) for i in images[:3]]
    content.append({"type": "text", "text": f"题目内容：\n{problem_text}"})
    try:
        text = await _complete(DETECT_SUBJECT_PROMPT, [{"role": "user", "content": content}])
        return _extract_json(text)
    except Exception as exc:
        logger.warning("detect_subject failed: %s", exc)
        return {"subject": "unknown", "problem_type": "未知题型", "grade_level": "不确定", "brief": problem_text[:20]}


async def create_session(problem_text: str, images: list[str]) -> SessionState:
    t0 = time.perf_counter()
    meta = await detect_subject(problem_text, images)
    subject_str = meta.get("subject", "unknown")
    try:
        subject = Subject(subject_str)
    except ValueError:
        subject = Subject.UNKNOWN

    content: list[dict] = [_img(i) for i in images[:3]]
    content.append({
        "type": "text",
        "text": (
            "请帮我分步解答以下题目。\n\n"
            f"**题目**：\n{problem_text}\n\n"
            "请先输出第一步（题型识别），只输出一个步骤的 JSON。后续步骤等我点击【下一步】再继续。"
        ),
    })

    session = SessionState(
        session_id=str(uuid.uuid4()),
        problem_text=problem_text,
        images=images,
        subject=subject,
        problem_type=meta.get("problem_type", ""),
        messages=[{"role": "user", "content": content}],
        steps=[],
        current_step_index=0,
    )
    sessions[session.session_id] = session
    _save_sessions_to_disk()
    logger.info(
        "Session created  id=%s subject=%s type=%s  detect=%.0fms",
        session.session_id, subject_str, session.problem_type,
        (time.perf_counter() - t0) * 1000,
    )
    return session


# ── 下一步生成（SSE）──────────────────────────────────────

async def generate_next_step(session_id: str) -> AsyncGenerator[str, None]:
    session = sessions.get(session_id)
    if not session:
        yield _sse({"error": "会话不存在"})
        return
    if session.is_complete:
        yield _sse({"error": "解题已完成"})
        return

    if session.prefetched_steps:
        item = session.prefetched_steps.pop(0)
        committed = _commit_step(session, item.step, item.raw_response)
        logger.info("Served prefetched step %d  session=%s", committed.step_index + 1, session_id)
        if not committed.is_final:
            _schedule_prefetch(session_id)
        yield _sse({"step": committed.model_dump(), "done": True, "cached": True})
        return

    _invalidate_prefetch(session)

    system_prompt = build_system_prompt(session.subject.value, session.problem_type)
    step_no = len(session.steps) + 1

    logger.info("Generating step %d  session=%s", step_no, session_id)
    t0 = time.perf_counter()
    full_response = ""

    try:
        async for chunk in _stream_with_heartbeat(system_prompt, session.messages):
            if chunk == "__TIMEOUT__":
                yield _sse({"error": f"模型响应超时（>{MODEL_TIMEOUT}s），请重试"})
                return
            if chunk.startswith("__ERROR__:"):
                yield _sse({"error": chunk[10:]})
                return
            if chunk.startswith(": "):
                # SSE 注释心跳，直接透传给前端（保持连接）
                yield f"{chunk}\n\n"
                continue

            full_response += chunk
            yield _sse({"chunk": chunk})

        if not full_response.strip():
            yield _sse({"error": "模型未返回内容"})
            return

        data = _extract_json(full_response)
        step = _parse_step(data, len(session.steps), session.current_method)
        step = _commit_step(session, step, full_response)

        elapsed = int((time.perf_counter() - t0) * 1000)
        logger.info(
            "Step %d done  title=%s  is_final=%s  elapsed=%dms session=%s",
            step_no, step.title, step.is_final, elapsed, session_id,
        )
        if not step.is_final:
            _schedule_prefetch(session_id)
        yield _sse({"step": step.model_dump(), "done": True})

    except Exception as exc:
        logger.exception("generate_next_step error  session=%s", session_id)
        yield _sse({"error": f"生成失败：{exc}"})


# ── 对话处理（SSE）────────────────────────────────────────

async def handle_chat(
    session_id: str,
    user_message: str,
    referenced_step_index: Optional[int],
) -> AsyncGenerator[str, None]:
    session = sessions.get(session_id)
    if not session:
        yield _sse({"error": "会话不存在"})
        return

    _invalidate_prefetch(session)

    system_prompt = build_system_prompt(session.subject.value, session.problem_type)
    step_ref = f"第{referenced_step_index + 1}步" if referenced_step_index is not None else "当前步骤"

    is_alt     = any(kw in user_message for kw in ["换", "另一种", "其他方法", "多解法", "第二种"])
    is_summary = any(kw in user_message for kw in ["总结", "知识点", "归纳"])
    is_explain = any(kw in user_message for kw in ["为什么", "怎么来", "解释", "不明白", "不懂"])

    if is_alt:
        session.current_method += 1
        prompt = (
            f"用户请求另一种解法（解法{session.current_method + 1}）。\n"
            "请保留当前解法记录，不要覆盖已有步骤。\n"
            f"请先用1-2句话说明新解法与原解法的区别，然后输出新解法第一步的 JSON。\n"
            f"新步骤加入 \"method_name\": \"解法{session.current_method + 1}\"，"
            f"method_index: {session.current_method}。"
        )
    elif is_summary:
        prompt = "用户请求知识点总结。请输出 step_type 为 summary 的步骤 JSON，涵盖本题所有知识点。"
    elif is_explain:
        prompt = (
            f"用户在{step_ref}提问：{user_message}\n"
            "请简洁解释该步骤的原理或推理依据，不需要输出 JSON，直接文字回答。"
        )
    else:
        prompt = (
            f"用户在{step_ref}说：{user_message}\n"
            "请根据上下文回应。如需生成新步骤则输出步骤 JSON；否则直接文字回答。"
        )

    session.messages.append({"role": "user", "content": prompt})
    logger.info("Chat  session=%s  msg=%s", session_id, user_message[:40])

    full_response = ""
    new_step = None

    try:
        async for chunk in _stream_with_heartbeat(system_prompt, session.messages):
            if chunk == "__TIMEOUT__":
                yield _sse({"error": f"模型响应超时（>{MODEL_TIMEOUT}s），请重试"})
                return
            if chunk.startswith("__ERROR__:"):
                yield _sse({"error": chunk[10:]})
                return
            if chunk.startswith(": "):
                yield f"{chunk}\n\n"
                continue

            full_response += chunk
            yield _sse({"chunk": chunk})

        session.messages.append({"role": "assistant", "content": full_response})

        if "{" in full_response and "step_type" in full_response:
            try:
                data = _extract_json(full_response)
                if "step_type" in data:
                    new_step = _parse_step(data, len(session.steps), session.current_method)
                    session.steps.append(new_step)
                    session.current_step_index = new_step.step_index
                    if new_step.is_final:
                        session.is_complete = True
            except Exception:
                pass

        _save_sessions_to_disk()

        result: dict = {"done": True}
        if new_step:
            result["step"] = new_step.model_dump()
            if not new_step.is_final:
                _schedule_prefetch(session_id)
        yield _sse(result)

    except Exception as exc:
        logger.exception("handle_chat error  session=%s", session_id)
        yield _sse({"error": f"对话失败：{exc}"})


def get_session(session_id: str) -> Optional[SessionState]:
    return sessions.get(session_id)


def runtime_stats() -> dict:
    stats = _session_runtime_stats()
    try:
        stats["skills"] = get_loader().list_skills()
    except Exception:
        pass
    return stats


load_sessions_from_disk()
