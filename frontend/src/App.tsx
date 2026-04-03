import { useState } from 'react'
import { ProblemPanel } from './components/ProblemPanel'
import { StepPanel } from './components/StepPanel'
import { ChatPanel } from './components/ChatPanel'
import { useSessionStore } from './store/sessionStore'

export default function App() {
  const { problemText, problemImages, setSession, startNewProblem } = useSessionStore()
  const [isSolving, setIsSolving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [referenceStepIndex, setReferenceStepIndex] = useState<number | null>(null)

  const handleSolve = async () => {
    if (!problemText.trim() && problemImages.length === 0) {
      setError('请输入题目内容或上传图片')
      return
    }
    setError(null)
    setIsSolving(true)

    try {
      const formData = new FormData()
      formData.append('problem_text', problemText)

      for (const imgDataUrl of problemImages) {
        // Convert data URL to blob
        const res = await fetch(imgDataUrl)
        const blob = await res.blob()
        formData.append('files', blob, 'image.jpg')
      }

      const response = await fetch('/api/solve', {
        method: 'POST',
        body: formData,
      })

      if (!response.ok) {
        let detail = `请求失败（HTTP ${response.status}）`
        try {
          const err = await response.json()
          if (err.detail) detail = err.detail
        } catch { /* empty body or non-JSON */ }
        throw new Error(detail)
      }

      let data: { session_id: string; subject: import('./types').Subject; problem_type: string }
      try {
        data = await response.json()
      } catch {
        throw new Error('服务器返回了无效的响应，请检查后端是否正常运行')
      }
      setSession({
        session_id: data.session_id,
        subject: data.subject,
        problem_type: data.problem_type,
      })
    } catch (err) {
      setError(String(err instanceof Error ? err.message : err))
    } finally {
      setIsSolving(false)
    }
  }

  const handleAskAbout = (stepIndex: number) => {
    setReferenceStepIndex(stepIndex)
    // Scroll to chat panel on mobile
    document.getElementById('chat-panel')?.scrollIntoView({ behavior: 'smooth' })
  }

  const handleStartNewProblem = () => {
    startNewProblem()
    setReferenceStepIndex(null)
    setError(null)
    setIsSolving(false)
  }

  return (
    <div className="h-screen bg-gray-50 flex flex-col overflow-hidden">
      {/* Top nav */}
      <header className="flex-shrink-0 bg-white border-b border-gray-200 px-4 py-3 flex items-center gap-3 shadow-sm">
        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-brand-500 to-brand-700 flex items-center justify-center">
          <span className="text-white text-base font-bold">解</span>
        </div>
        <div>
          <h1 className="text-base font-bold text-gray-900 leading-tight">教学解题助手</h1>
          <p className="text-xs text-gray-400">初高中 · 分步引导 · 可追问</p>
        </div>
        <div className="ml-auto flex items-center gap-1.5">
          {['数学', '物理', '化学', '生物', '语文', '英语'].map((s) => (
            <span key={s} className="hidden sm:inline-block text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">
              {s}
            </span>
          ))}
        </div>
      </header>

      {/* Main layout: three panels */}
      <div className="flex-1 min-h-0 flex overflow-hidden">
        {/* Left column: Problem (top) + Chat (bottom) */}
        <div className="flex flex-col min-h-0 w-[280px] sm:w-[300px] md:w-[380px] lg:w-[420px] flex-shrink-0 border-r border-gray-200 overflow-hidden">
          {/* Problem Panel */}
          <div className="flex-shrink-0" style={{ minHeight: '280px', maxHeight: '50%', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            <div className="flex-1 overflow-hidden bg-white">
              <ProblemPanel
                onSolve={handleSolve}
                onStartNewProblem={handleStartNewProblem}
                isSolving={isSolving}
                error={error}
              />
            </div>
          </div>

          {/* Divider */}
          <div className="flex-shrink-0 h-px bg-gray-200" />

          {/* Chat Panel */}
          <div id="chat-panel" className="flex-1 overflow-hidden bg-white">
            <ChatPanel
              referenceStepIndex={referenceStepIndex}
              onClearReference={() => setReferenceStepIndex(null)}
              onStartNewProblem={handleStartNewProblem}
            />
          </div>
        </div>

        {/* Right column: Step Panel */}
        <div className="flex-1 min-h-0 overflow-hidden bg-[#f5f7fb] p-4 md:p-5">
          <div className="h-full min-h-0 rounded-3xl border border-gray-200 bg-white shadow-sm overflow-hidden">
            <StepPanel onAskAbout={handleAskAbout} />
          </div>
        </div>
      </div>
    </div>
  )
}
