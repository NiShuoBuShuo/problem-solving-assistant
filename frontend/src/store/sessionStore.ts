import { create } from 'zustand'
import type { Session, Step, ChatMessage } from '../types'

interface SessionStore {
  // Session
  session: Session | null
  problemText: string
  problemImages: string[]

  // Steps
  steps: Step[]
  isLoadingStep: boolean
  isComplete: boolean
  /** 流式接收到的原始文本（用于实时预览，appendStep 后自动清空） */
  streamingRaw: string
  /** 从 streamingRaw 中提取的 explanation 字段（便于前端直接显示） */
  streamingExplanation: string

  // Chat
  chatMessages: ChatMessage[]
  isChatLoading: boolean
  chatStreamingText: string

  // UI
  activeStepIndex: number | null
  expandedSteps: Set<number>
  /** 繁忙提示（非空时显示 Toast） */
  busyMessage: string

  // Actions
  setProblemText: (text: string) => void
  addProblemImage: (dataUrl: string) => void
  removeProblemImage: (index: number) => void
  setSession: (session: Session) => void
  resetSession: () => void
  startNewProblem: () => void

  appendStep: (step: Step) => void
  setLoadingStep: (v: boolean) => void
  setComplete: (v: boolean) => void
  /** 追加一个 chunk 到 streamingRaw，并同步更新 streamingExplanation */
  appendStreamingChunk: (chunk: string) => void
  clearStreaming: () => void

  addChatMessage: (msg: ChatMessage) => void
  setChatLoading: (v: boolean) => void
  appendChatStreamingText: (chunk: string) => void
  clearChatStreamingText: () => void

  setActiveStep: (index: number | null) => void
  toggleExpandStep: (index: number) => void
  setBusyMessage: (msg: string) => void
}

/** 从不完整的 JSON 字符串中尽量提取 preview 字段内容 */
function extractPreviewText(raw: string): string {
  const m = raw.match(/"(?:key_point|explanation)"\s*:\s*"((?:[^"\\]|\\.)*)/s)
  if (!m) return ''
  return m[1]
    .replace(/\\n/g, '\n')
    .replace(/\\"/g, '"')
    .replace(/\\t/g, '\t')
    .replace(/\\\\/g, '\\')
}

export const useSessionStore = create<SessionStore>((set) => ({
  session: null,
  problemText: '',
  problemImages: [],
  steps: [],
  isLoadingStep: false,
  isComplete: false,
  streamingRaw: '',
  streamingExplanation: '',
  chatMessages: [],
  isChatLoading: false,
  chatStreamingText: '',
  activeStepIndex: null,
  expandedSteps: new Set(),
  busyMessage: '',

  setProblemText: (text) => set({ problemText: text }),
  addProblemImage: (dataUrl) => set((s) => ({ problemImages: [...s.problemImages, dataUrl] })),
  removeProblemImage: (index) => set((s) => ({
    problemImages: s.problemImages.filter((_, i) => i !== index),
  })),
  setSession: (session) => set({ session }),

  resetSession: () => set({
    session: null,
    steps: [],
    isLoadingStep: false,
    isComplete: false,
    streamingRaw: '',
    streamingExplanation: '',
    chatMessages: [],
    isChatLoading: false,
    chatStreamingText: '',
    activeStepIndex: null,
    expandedSteps: new Set(),
    busyMessage: '',
  }),

  startNewProblem: () => set({
    session: null,
    problemText: '',
    problemImages: [],
    steps: [],
    isLoadingStep: false,
    isComplete: false,
    streamingRaw: '',
    streamingExplanation: '',
    chatMessages: [],
    isChatLoading: false,
    chatStreamingText: '',
    activeStepIndex: null,
    expandedSteps: new Set(),
    busyMessage: '',
  }),

  appendStep: (step) => set((s) => ({
    steps: [...s.steps, step],
    activeStepIndex: step.step_index,
    expandedSteps: new Set([...s.expandedSteps, step.step_index]),
    streamingRaw: '',
    streamingExplanation: '',
  })),

  setLoadingStep: (v) => set({ isLoadingStep: v }),
  setComplete: (v) => set({ isComplete: v }),

  appendStreamingChunk: (chunk) => set((s) => {
    const raw = s.streamingRaw + chunk
    return {
      streamingRaw: raw,
      streamingExplanation: extractPreviewText(raw),
    }
  }),

  clearStreaming: () => set({ streamingRaw: '', streamingExplanation: '' }),

  addChatMessage: (msg) => set((s) => ({ chatMessages: [...s.chatMessages, msg] })),
  setChatLoading: (v) => set({ isChatLoading: v }),
  appendChatStreamingText: (chunk) => set((s) => ({
    chatStreamingText: s.chatStreamingText + chunk,
  })),
  clearChatStreamingText: () => set({ chatStreamingText: '' }),

  setActiveStep: (index) => set({ activeStepIndex: index }),
  toggleExpandStep: (index) => set((s) => {
    const next = new Set(s.expandedSteps)
    if (next.has(index)) { next.delete(index) } else { next.add(index) }
    return { expandedSteps: next }
  }),

  setBusyMessage: (msg) => set({ busyMessage: msg }),
}))

// ── 常量 ──────────────────────────────────────────────────

export const SUBJECT_LABELS: Record<string, string> = {
  math: '数学', physics: '物理', chemistry: '化学',
  biology: '生物', chinese: '语文', english: '英语', unknown: '未知',
}

export const SUBJECT_COLORS: Record<string, string> = {
  math:      'bg-indigo-100 text-indigo-700 border-indigo-200',
  physics:   'bg-cyan-100 text-cyan-700 border-cyan-200',
  chemistry: 'bg-green-100 text-green-700 border-green-200',
  biology:   'bg-lime-100 text-lime-700 border-lime-200',
  chinese:   'bg-red-100 text-red-700 border-red-200',
  english:   'bg-amber-100 text-amber-700 border-amber-200',
  unknown:   'bg-gray-100 text-gray-600 border-gray-200',
}

export const STEP_TYPE_LABELS: Record<string, string> = {
  problem_type:    '题型识别',
  understanding:   '题意理解',
  known_conditions:'已知条件',
  target:          '求解目标',
  approach:        '解题思路',
  derivation:      '推导过程',
  stage_conclusion:'阶段结论',
  final_answer:    '最终答案',
  verification:    '检查验证',
  summary:         '知识点总结',
  alternative:     '其他解法',
  explanation:     '步骤解释',
}

export const STEP_TYPE_ICONS: Record<string, string> = {
  problem_type:    '🏷️',
  understanding:   '🔍',
  known_conditions:'📋',
  target:          '🎯',
  approach:        '💡',
  derivation:      '📐',
  stage_conclusion:'✅',
  final_answer:    '🎉',
  verification:    '🔄',
  summary:         '📚',
  alternative:     '🔀',
  explanation:     '💬',
}
