import { useCallback, useRef } from 'react'
import type { Step } from '../types'

export interface SSECallbacks {
  onChunk?: (chunk: string) => void
  onStep?: (step: Step) => void
  onDone?: () => void
  onError?: (err: string) => void
  onBusy?: (msg: string) => void
}

/**
 * 解析一个 SSE 消息块（可能含多行），派发到对应回调。
 * 支持：chunk | step+done | busy | error | `: ping`（心跳，忽略）
 */
function dispatchSSEMessage(message: string, callbacks: SSECallbacks) {
  for (const line of message.split('\n')) {
    const trimmed = line.trim()
    // SSE 注释心跳，忽略
    if (trimmed.startsWith(':')) continue
    if (!trimmed.startsWith('data:')) continue

    const raw = trimmed.slice(5).trim()
    if (!raw) continue

    let data: Record<string, unknown>
    try {
      data = JSON.parse(raw)
    } catch {
      continue
    }

    if (data.busy) {
      callbacks.onBusy?.(String(data.error ?? '服务繁忙，请稍后再试'))
    } else if (data.error) {
      callbacks.onError?.(String(data.error))
    } else if (data.chunk !== undefined) {
      callbacks.onChunk?.(String(data.chunk))
    } else if (data.done) {
      if (data.step) callbacks.onStep?.(data.step as Step)
      callbacks.onDone?.()
    }
  }
}

async function consumeStream(
  response: Response,
  callbacks: SSECallbacks,
  signal: AbortSignal,
) {
  const reader = response.body?.getReader()
  if (!reader) { callbacks.onError?.('No response body'); return }
  const decoder = new TextDecoder()
  let buffer = ''

  try {
    while (true) {
      if (signal.aborted) break
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })

      // SSE 消息间以双换行分隔
      const messages = buffer.split('\n\n')
      buffer = messages.pop() ?? ''

      for (const msg of messages) {
        if (msg.trim()) dispatchSSEMessage(msg, callbacks)
      }
    }
    if (buffer.trim()) dispatchSSEMessage(buffer, callbacks)
  } catch (err) {
    if (!signal.aborted) callbacks.onError?.(String(err))
  } finally {
    reader.releaseLock()
  }
}

export function useSSE() {
  const controllers = useRef<Map<string, AbortController>>(new Map())

  /** 取消指定 key 的进行中请求 */
  const abort = useCallback((key: string) => {
    controllers.current.get(key)?.abort()
    controllers.current.delete(key)
  }, [])

  const streamGet = useCallback(async (
    url: string,
    callbacks: SSECallbacks,
    key = url,
  ) => {
    const ctrl = new AbortController()
    controllers.current.set(key, ctrl)
    try {
      const res = await fetch(url, {
        method: 'GET',
        headers: { Accept: 'text/event-stream' },
        signal: ctrl.signal,
      })
      if (!res.ok) { callbacks.onError?.(`HTTP ${res.status}`); return }
      await consumeStream(res, callbacks, ctrl.signal)
    } catch (err) {
      if ((err as Error).name !== 'AbortError') callbacks.onError?.(String(err))
    } finally {
      controllers.current.delete(key)
    }
  }, [])

  const streamPost = useCallback(async (
    url: string,
    body: object,
    callbacks: SSECallbacks,
    key = url,
  ) => {
    const ctrl = new AbortController()
    controllers.current.set(key, ctrl)
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
        body: JSON.stringify(body),
        signal: ctrl.signal,
      })
      if (!res.ok) { callbacks.onError?.(`HTTP ${res.status}`); return }
      await consumeStream(res, callbacks, ctrl.signal)
    } catch (err) {
      if ((err as Error).name !== 'AbortError') callbacks.onError?.(String(err))
    } finally {
      controllers.current.delete(key)
    }
  }, [])

  return { streamGet, streamPost, abort }
}
