import { useRef, useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Send, Loader2, Bot, User, MessageSquare } from 'lucide-react'
import { MathContent } from './MathContent'
import { useSessionStore, STEP_TYPE_ICONS } from '../store/sessionStore'
import { useSSE } from '../hooks/useSSE'
import type { ChatMessage } from '../types'

interface Props {
  referenceStepIndex: number | null
  onClearReference: () => void
  onStartNewProblem: () => void
}

const QUICK_PROMPTS = [
  { label: '为什么？', text: '请解释这一步的原理' },
  { label: '换一种方法', text: '能换一种解法吗？' },
  { label: '更详细', text: '请把这步说得更详细一点' },
  { label: '更简洁', text: '请简化一下' },
  { label: '知识点总结', text: '帮我总结本题涉及的知识点' },
]

export function ChatPanel({ referenceStepIndex, onClearReference, onStartNewProblem }: Props) {
  const {
    session, steps, chatMessages, isChatLoading, chatStreamingText,
    addChatMessage, setChatLoading, appendChatStreamingText, clearChatStreamingText, appendStep, setComplete,
  } = useSessionStore()
  const { streamPost } = useSSE()
  const [input, setInput] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [chatMessages.length, chatStreamingText])

  // Auto-fill when step reference changes
  useEffect(() => {
    if (referenceStepIndex !== null && inputRef.current) {
      inputRef.current.focus()
    }
  }, [referenceStepIndex])

  const sendMessage = async (text: string) => {
    if (!session || !text.trim() || isChatLoading) return

    const userMsg: ChatMessage = {
      role: 'user',
      content: text.trim(),
      timestamp: Date.now(),
      referenced_step_index: referenceStepIndex ?? undefined,
    }
    addChatMessage(userMsg)
    setInput('')
    onClearReference()
    setChatLoading(true)
    clearChatStreamingText()

    let fullText = ''

    await streamPost('/api/chat', {
      session_id: session.session_id,
      message: text.trim(),
      referenced_step_index: referenceStepIndex,
    }, {
      onChunk: (chunk) => {
        fullText += chunk
        appendChatStreamingText(chunk)
      },
      onStep: (step) => {
        appendStep(step)
        if (step.is_final) setComplete(true)
      },
      onDone: () => {
        const assistantMsg: ChatMessage = {
          role: 'assistant',
          content: fullText,
          timestamp: Date.now(),
        }
        addChatMessage(assistantMsg)
        clearChatStreamingText()
        setChatLoading(false)
      },
      onError: (err) => {
        const errMsg: ChatMessage = {
          role: 'assistant',
          content: `抱歉，出现了错误：${err}`,
          timestamp: Date.now(),
        }
        addChatMessage(errMsg)
        clearChatStreamingText()
        setChatLoading(false)
      },
    })
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage(input)
    }
  }

  const refStep = referenceStepIndex !== null
    ? steps.find(s => s.step_index === referenceStepIndex)
    : null

  if (!session) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-center p-6 text-gray-400">
        <MessageSquare className="w-10 h-10 mb-3 opacity-30" />
        <p className="text-sm">开始解题后，可在此提问</p>
      </div>
    )
  }

  // Strip JSON from assistant messages for display
  const cleanContent = (content: string) => {
    // Remove JSON code blocks
    let cleaned = content.replace(/```json[\s\S]*?```/g, '').trim()
    // Remove bare JSON objects if the whole response is JSON
    if (cleaned.startsWith('{') && cleaned.includes('"step_type"')) {
      const jsonStart = cleaned.indexOf('{')
      if (jsonStart === 0) {
        cleaned = ''
      } else {
        cleaned = cleaned.substring(0, jsonStart).trim()
      }
    }
    return cleaned || '（已生成新步骤，请查看右侧步骤区）'
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex-shrink-0 px-4 py-2.5 border-b border-gray-100 space-y-2">
        <div className="flex items-center gap-2">
          <MessageSquare className="w-4 h-4 text-brand-500" />
          <span className="text-sm font-medium text-gray-700">对话</span>
          <span className="text-xs text-gray-400">（可追问、换方法、总结）</span>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => sendMessage('请保留当前解法记录，并给我一种新的解法。')}
            disabled={isChatLoading}
            className="text-xs px-3 py-1.5 rounded-full border border-sky-200 bg-sky-50 text-sky-700 hover:bg-sky-100 transition-all disabled:opacity-50"
          >
            新解法
          </button>
          <button
            onClick={() => onStartNewProblem()}
            disabled={isChatLoading}
            className="text-xs px-3 py-1.5 rounded-full border border-brand-200 bg-brand-50 text-brand-700 hover:bg-brand-100 transition-all disabled:opacity-50"
          >
            新问题
          </button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3">
        {chatMessages.length === 0 && (
          <div className="text-center py-4">
            <p className="text-xs text-gray-400 mb-3">快速提问：</p>
            <div className="flex flex-wrap gap-2 justify-center">
              {QUICK_PROMPTS.map((p) => (
                <button
                  key={p.label}
                  onClick={() => sendMessage(p.text)}
                  disabled={isChatLoading}
                  className="text-xs px-3 py-1.5 rounded-full border border-gray-200 bg-white hover:bg-brand-50 hover:border-brand-300 hover:text-brand-700 transition-all"
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>
        )}

        <AnimatePresence>
          {chatMessages.map((msg, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className={`flex gap-2 ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}
            >
              <div className={`w-7 h-7 rounded-full flex-shrink-0 flex items-center justify-center text-xs ${
                msg.role === 'user' ? 'bg-brand-500 text-white' : 'bg-gray-100 text-gray-600'
              }`}>
                {msg.role === 'user' ? <User className="w-3.5 h-3.5" /> : <Bot className="w-3.5 h-3.5" />}
              </div>
              <div data-testid={`chat-message-${msg.role}`} className={`max-w-[85%] ${msg.role === 'user' ? 'items-end' : 'items-start'} flex flex-col gap-1`}>
                {/* Reference badge */}
                {msg.role === 'user' && msg.referenced_step_index !== null && msg.referenced_step_index !== undefined && (
                  <span className="text-xs text-brand-500 bg-brand-50 px-2 py-0.5 rounded-full border border-brand-200 self-end">
                    关于第 {msg.referenced_step_index + 1} 步
                  </span>
                )}
                <div className={`rounded-2xl px-3.5 py-2.5 text-sm ${
                  msg.role === 'user'
                    ? 'bg-brand-500 text-white rounded-tr-sm'
                    : 'bg-white border border-gray-200 text-gray-700 rounded-tl-sm shadow-sm'
                }`}>
                  {msg.role === 'user' ? (
                    <span>{msg.content}</span>
                  ) : (
                    <MathContent content={cleanContent(msg.content)} className="text-sm" />
                  )}
                </div>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>

        {/* Streaming response */}
        {isChatLoading && chatStreamingText && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex gap-2"
          >
            <div className="w-7 h-7 rounded-full flex-shrink-0 flex items-center justify-center bg-gray-100 text-gray-600">
              <Bot className="w-3.5 h-3.5" />
            </div>
            <div className="max-w-[85%] bg-white border border-gray-200 rounded-2xl rounded-tl-sm shadow-sm px-3.5 py-2.5">
              <MathContent content={cleanContent(chatStreamingText)} className="text-sm" />
              <span className="inline-block w-1 h-4 bg-brand-400 ml-0.5 animate-pulse" />
            </div>
          </motion.div>
        )}

        {isChatLoading && !chatStreamingText && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex gap-2"
          >
            <div className="w-7 h-7 rounded-full flex-shrink-0 flex items-center justify-center bg-gray-100">
              <Bot className="w-3.5 h-3.5 text-gray-600" />
            </div>
            <div className="bg-white border border-gray-200 rounded-2xl rounded-tl-sm px-3.5 py-2.5 flex items-center gap-1">
              {[0, 1, 2].map(i => (
                <span key={i} className="w-1.5 h-1.5 bg-gray-300 rounded-full animate-bounce"
                  style={{ animationDelay: `${i * 0.15}s` }} />
              ))}
            </div>
          </motion.div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Reference indicator */}
      <AnimatePresence>
        {refStep && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="flex-shrink-0 overflow-hidden"
          >
            <div data-testid="chat-reference-badge" className="mx-3 mb-1 flex items-center gap-2 bg-brand-50 border border-brand-200 rounded-lg px-3 py-1.5">
              <span className="text-xs">{STEP_TYPE_ICONS[refStep.step_type]}</span>
              <span className="text-xs text-brand-700 flex-1 truncate">
                引用：{refStep.title}
              </span>
              <button onClick={onClearReference} className="text-brand-400 hover:text-brand-600">
                <X className="w-3 h-3" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Input */}
      <div className="flex-shrink-0 px-3 pb-3 pt-1">
        <div className="flex gap-2 items-end bg-white border-2 border-gray-200 focus-within:border-brand-400 rounded-xl transition-colors px-3 py-2">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="提问或追问… (Enter 发送，Shift+Enter 换行)"
            rows={2}
            className="flex-1 resize-none outline-none text-sm text-gray-700 placeholder-gray-400 bg-transparent leading-relaxed"
            disabled={isChatLoading}
          />
          <button
            onClick={() => sendMessage(input)}
            disabled={!input.trim() || isChatLoading}
            className={`flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center transition-all ${
              input.trim() && !isChatLoading
                ? 'bg-brand-500 text-white hover:bg-brand-600 active:scale-90'
                : 'bg-gray-100 text-gray-300 cursor-not-allowed'
            }`}
          >
            {isChatLoading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Send className="w-4 h-4" />
            )}
          </button>
        </div>
      </div>
    </div>
  )
}

// Missing import
function X({ className }: { className: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
  )
}
