import { useRef, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ChevronRight, CheckCircle, Loader2, Sparkles, WifiOff } from 'lucide-react'
import { StepCard } from './StepCard'
import { MathContent } from './MathContent'
import { useSessionStore, SUBJECT_LABELS, SUBJECT_COLORS } from '../store/sessionStore'
import { useSSE } from '../hooks/useSSE'
import type { Step } from '../types'

interface Props {
  onAskAbout: (stepIndex: number) => void
}

function buildSolutionDigest(steps: Step[]) {
  const seen = new Set<string>()
  const items: Array<{ label: string; text: string; strong?: boolean }> = []

  for (const step of steps) {
    const primary = step.content.key_point?.trim()
    const fallback =
      step.step_type === 'final_answer' || step.step_type === 'stage_conclusion'
        ? step.content.conclusion?.trim()
        : ''
    const text = primary || fallback
    if (!text) continue

    const normalized = text.replace(/\s+/g, ' ').trim()
    if (!normalized || seen.has(normalized)) continue
    seen.add(normalized)

    items.push({
      label: step.step_type === 'final_answer' ? '最终答案' : step.title,
      text,
      strong: step.step_type === 'final_answer',
    })
  }

  return items
}

// ── 闪烁光标 ─────────────────────────────────────────────
function Cursor() {
  return (
    <span
      className="inline-block w-[2px] h-[1em] bg-brand-500 ml-0.5 align-middle"
      style={{ animation: 'blink 1s step-end infinite' }}
    />
  )
}

// ── 繁忙 / 错误 Toast ─────────────────────────────────────
function BusyToast({ message, onClose }: { message: string; onClose: () => void }) {
  useEffect(() => {
    const t = setTimeout(onClose, 6000)
    return () => clearTimeout(t)
  }, [onClose])

  return (
    <motion.div
      initial={{ opacity: 0, y: -14, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -14, scale: 0.95 }}
      data-testid="busy-toast"
      className="absolute top-3 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2
                 bg-amber-50 border border-amber-300 text-amber-800 text-sm
                 px-4 py-2.5 rounded-xl shadow-lg max-w-sm w-max"
    >
      <WifiOff className="w-4 h-4 flex-shrink-0 text-amber-500" />
      <span className="leading-snug">{message}</span>
      <button onClick={onClose} className="ml-1 text-amber-400 hover:text-amber-700 text-base leading-none">✕</button>
    </motion.div>
  )
}

// ── 流式预览卡片 ──────────────────────────────────────────
function StreamingCard({ text, hasContent }: { text: string; hasContent: boolean }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      data-testid="streaming-card"
      className="rounded-xl border-2 border-dashed border-brand-200 bg-gradient-to-br from-brand-50 to-white p-4 shadow-sm"
    >
      <div className="flex items-center gap-2 mb-3">
        <Loader2 className="w-3.5 h-3.5 text-brand-500 animate-spin" />
        <span className="text-xs font-semibold text-brand-500 tracking-wide uppercase">
          正在生成…
        </span>
      </div>

      {hasContent ? (
        <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap break-words">
          {text}
          <Cursor />
        </p>
      ) : (
        /* 三点跳动 — 纯 CSS */
        <div className="flex items-center gap-1">
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="w-1.5 h-1.5 rounded-full bg-brand-400 inline-block"
              style={{ animation: `bounce 1.2s ease-in-out ${i * 0.2}s infinite` }}
            />
          ))}
          <span className="text-xs text-gray-400 ml-2">模型思考中…</span>
        </div>
      )}
    </motion.div>
  )
}

// ── 主面板 ────────────────────────────────────────────────
export function StepPanel({ onAskAbout }: Props) {
  const {
    session, steps, isLoadingStep, isComplete,
    streamingExplanation, streamingRaw,
    expandedSteps, activeStepIndex, busyMessage,
    appendStep, setLoadingStep, setComplete,
    appendStreamingChunk, clearStreaming,
    toggleExpandStep, setBusyMessage,
  } = useSessionStore()

  const { streamGet } = useSSE()
  const bottomRef = useRef<HTMLDivElement>(null)
  const autoStartedSessionRef = useRef<string | null>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [steps.length, streamingRaw.length])

  const handleNextStep = useCallback(async () => {
    if (!session || isLoadingStep || isComplete) return

    setLoadingStep(true)
    clearStreaming()

    await streamGet(
      `/api/next-step/${session.session_id}`,
      {
        onChunk:  (chunk) => appendStreamingChunk(chunk),
        onStep:   (step) => {
          appendStep(step)
          if (step.is_final) setComplete(true)
        },
        onBusy:   (msg) => {
          setBusyMessage(msg)
          setLoadingStep(false)
          clearStreaming()
        },
        onError:  (err) => {
          setBusyMessage(err.length > 60 ? err.slice(0, 60) + '…' : err)
          clearStreaming()
          setLoadingStep(false)
        },
        onDone:   () => setLoadingStep(false),
      },
      `next-step-${session.session_id}`,
    )

    // 兜底：确保 loading 状态被清除
    setLoadingStep(false)
  }, [
    session, isLoadingStep, isComplete, streamGet,
    setLoadingStep, clearStreaming, appendStreamingChunk,
    appendStep, setComplete, setBusyMessage,
  ])

  useEffect(() => {
    if (!session) {
      autoStartedSessionRef.current = null
      return
    }
    if (steps.length > 0 || isLoadingStep || isComplete) return
    if (autoStartedSessionRef.current === session.session_id) return

    autoStartedSessionRef.current = session.session_id
    void handleNextStep()
  }, [session, steps.length, isLoadingStep, isComplete, handleNextStep])

  if (!session) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-center p-8 text-gray-400">
        <div className="text-6xl mb-4">📝</div>
        <p className="text-lg font-medium text-gray-500">解题步骤将在此显示</p>
        <p className="text-sm mt-2">在左侧输入题目并点击"开始解题"</p>
      </div>
    )
  }

  const subjectColor = SUBJECT_COLORS[session.subject] || SUBJECT_COLORS.unknown
  const subjectLabel = SUBJECT_LABELS[session.subject] || '未知'
  const hasStreamingContent = streamingExplanation.length > 0
  const solutionDigest = buildSolutionDigest(steps)

  return (
    <div className="h-full flex flex-col relative">

      {/* 繁忙 / 错误 Toast */}
      <AnimatePresence>
        {busyMessage && (
          <BusyToast key="busy" message={busyMessage} onClose={() => setBusyMessage('')} />
        )}
      </AnimatePresence>

      {/* Header */}
      <div className="flex-shrink-0 px-4 py-3 border-b border-gray-100 bg-white">
        <div className="flex items-center gap-2 flex-wrap">
          <span data-testid="subject-badge" className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${subjectColor}`}>
            {subjectLabel}
          </span>
          {session.problem_type && (
            <span className="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded-full">
              {session.problem_type}
            </span>
          )}
          <div className="ml-auto flex items-center gap-2">
            {isLoadingStep && (
              <span className="flex items-center gap-1 text-xs text-brand-500">
                <Loader2 className="w-3 h-3 animate-spin" /> 生成中
              </span>
            )}
            {isComplete && (
              <span className="flex items-center gap-1 text-xs text-green-600 bg-green-50 px-2 py-1 rounded-full border border-green-200">
                <CheckCircle className="w-3 h-3" /> 解题完成
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Steps List */}
      <div className="flex-1 min-h-0 px-4 py-3">
        <div className="h-full rounded-2xl border border-gray-200 bg-gray-50/70 overflow-hidden">
          <div className="h-full overflow-y-auto px-3 py-3 space-y-3 scrollbar-thin">
            {solutionDigest.length > 0 && (
              <div className="rounded-2xl border border-emerald-200 bg-gradient-to-br from-emerald-50 to-white px-4 py-3 shadow-sm">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-emerald-600" />
                  <div className="text-sm font-semibold text-emerald-900">题解摘要</div>
                </div>
                <div className="mt-3 space-y-2">
                  {solutionDigest.map((item, index) => (
                    <div
                      key={`${item.label}-${index}`}
                      className={`rounded-xl border px-3 py-2.5 ${
                        item.strong
                          ? 'border-emerald-300 bg-emerald-100/80'
                          : 'border-emerald-100 bg-white/80'
                      }`}
                    >
                      <div className="text-[11px] font-semibold uppercase tracking-wide text-emerald-700">
                        {item.label}
                      </div>
                      <MathContent content={item.text} className="mt-1 text-sm text-emerald-950 leading-relaxed" />
                    </div>
                  ))}
                </div>
              </div>
            )}

            <AnimatePresence initial={false}>
              {steps.map((step) => (
                <StepCard
                  key={`${step.step_index}-${step.method_index}`}
                  step={step}
                  isActive={step.step_index === activeStepIndex}
                  isExpanded={expandedSteps.has(step.step_index)}
                  onToggle={() => toggleExpandStep(step.step_index)}
                  onAskAbout={onAskAbout}
                />
              ))}
            </AnimatePresence>

            {/* 流式预览（loading 时显示） */}
            <AnimatePresence>
              {isLoadingStep && (
                <StreamingCard
                  text={streamingExplanation}
                  hasContent={hasStreamingContent}
                />
              )}
            </AnimatePresence>

            <div ref={bottomRef} />
          </div>
        </div>
      </div>

      {/* Next Step Button */}
      <div className="flex-shrink-0 px-4 py-3 border-t border-gray-100 bg-white">
        {!isComplete ? (
          <button
            onClick={handleNextStep}
            disabled={isLoadingStep}
            className={`w-full flex items-center justify-center gap-2 py-3 px-6 rounded-xl font-semibold text-sm transition-all duration-200 ${
              isLoadingStep
                ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                : 'bg-gradient-to-r from-brand-500 to-brand-600 text-white shadow-md hover:shadow-lg hover:from-brand-600 hover:to-brand-700 active:scale-95'
            }`}
          >
            {isLoadingStep
              ? <><Loader2 className="w-4 h-4 animate-spin" /> 生成中…</>
              : <><span>下一步</span><ChevronRight className="w-4 h-4" /></>
            }
          </button>
        ) : (
          <div data-testid="complete-banner" className="flex items-center justify-center gap-2 py-3 px-6 rounded-xl bg-green-50 border border-green-200">
            <Sparkles className="w-4 h-4 text-green-500" />
            <span className="text-sm font-medium text-green-700">解题完成！可在对话区继续提问</span>
          </div>
        )}
      </div>
    </div>
  )
}
