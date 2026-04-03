"""
并发控制与任务队列管理
- MAX_CONCURRENT: 同时处理的模型请求数
- MAX_QUEUE:      等待队列深度上限，超出返回 busy
"""

import asyncio
import logging
import time
from contextlib import asynccontextmanager
from typing import Optional

logger = logging.getLogger("queue")

MAX_CONCURRENT = 4   # 同时跑的模型调用数
MAX_QUEUE      = 12  # 排队等待上限

_semaphore: Optional[asyncio.Semaphore] = None
_queue_depth: int = 0           # 当前排队+运行中的任务数
_active: int = 0                # 当前正在运行的任务数


def _get_semaphore() -> asyncio.Semaphore:
    global _semaphore
    if _semaphore is None:
        _semaphore = asyncio.Semaphore(MAX_CONCURRENT)
    return _semaphore


def queue_stats() -> dict:
    return {
        "active": _active,
        "queued": max(0, _queue_depth - _active),
        "max_concurrent": MAX_CONCURRENT,
        "max_queue": MAX_QUEUE,
    }


def is_busy() -> bool:
    return _queue_depth >= MAX_QUEUE


@asynccontextmanager
async def task_slot(session_id: str = "", allow_wait: bool = True):
    """
    申请一个任务槽位。
    - 队列满 → 立即 raise BusyError
    - 等待中 → 排队直到拿到 semaphore
    - allow_wait=False → 仅在有空闲执行槽位时立即执行，否则直接 raise BusyError
    - 退出时 → 释放槽位并记录耗时
    """
    global _queue_depth, _active

    if _queue_depth >= MAX_QUEUE:
        logger.warning(
            "Queue full (depth=%d, active=%d) session=%s",
            _queue_depth, _active, session_id
        )
        raise BusyError(f"服务繁忙（队列已满 {_queue_depth}/{MAX_QUEUE}），请稍后再试")

    semaphore = _get_semaphore()
    if not allow_wait and semaphore.locked():
        logger.info("Task skipped without waiting  active=%d depth=%d session=%s", _active, _queue_depth, session_id)
        raise BusyError("当前无空闲执行槽位")

    _queue_depth += 1
    start = time.perf_counter()
    logger.debug("Task queued  depth=%d session=%s", _queue_depth, session_id)
    acquired = False

    try:
        await semaphore.acquire()
        acquired = True
        _active += 1
        wait_ms = int((time.perf_counter() - start) * 1000)
        logger.info(
            "Task started  active=%d depth=%d wait=%dms session=%s",
            _active, _queue_depth, wait_ms, session_id,
        )
        yield
    finally:
        if acquired:
            semaphore.release()
            _active = max(0, _active - 1)
        _queue_depth = max(0, _queue_depth - 1)
        elapsed_ms = int((time.perf_counter() - start) * 1000)
        logger.info(
            "Task finished active=%d depth=%d total=%dms session=%s",
            _active, _queue_depth, elapsed_ms, session_id,
        )


class BusyError(Exception):
    pass
