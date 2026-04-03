import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ChevronDown, ChevronUp, BookOpen, FileText } from 'lucide-react'
import { MathContent } from './MathContent'
import { TikzDiagram } from './TikzDiagram'
import { MermaidDiagram } from './MermaidDiagram'
import { STEP_TYPE_LABELS, STEP_TYPE_ICONS } from '../store/sessionStore'
import type { Step } from '../types'

interface Props {
  step: Step
  isActive: boolean
  isExpanded: boolean
  onToggle: () => void
  onAskAbout: (stepIndex: number) => void
}

export function StepCard({ step, isActive, isExpanded, onToggle, onAskAbout }: Props) {
  const [showCitations, setShowCitations] = useState(false)
  const [showDetails, setShowDetails] = useState(false)

  const typeLabel = STEP_TYPE_LABELS[step.step_type] || step.step_type
  const typeIcon = STEP_TYPE_ICONS[step.step_type] || '•'
  const hasCitations = step.content.citations.length > 0
  const hasDiagram = Boolean(step.content.diagram_svg || step.content.diagram_tikz || step.content.diagram_mermaid)
  const hasDetails = Boolean(step.content.details)
  const diagramUrl = step.content.diagram_svg
    ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(step.content.diagram_svg)}`
    : null

  const cardBg = step.step_type === 'final_answer'
    ? 'bg-gradient-to-r from-green-50 to-emerald-50 border-green-200'
    : step.step_type === 'verification'
    ? 'bg-orange-50 border-orange-200'
    : step.step_type === 'summary'
    ? 'bg-purple-50 border-purple-200'
    : step.step_type === 'alternative'
    ? 'bg-sky-50 border-sky-200'
    : isActive
    ? 'bg-brand-50 border-brand-300'
    : 'bg-white border-gray-200'

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: 'easeOut' }}
      className={`rounded-xl border-2 shadow-sm overflow-hidden ${cardBg} transition-colors duration-200`}
      data-testid="step-card"
      data-step-index={step.step_index}
    >
      {/* Header */}
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-black/5 transition-colors"
      >
        <span className="text-xl flex-shrink-0">{typeIcon}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span data-testid="step-type-label" className="text-xs font-medium text-gray-400 uppercase tracking-wide">
              {typeLabel}
            </span>
            {step.method_name && (
              <span className="text-xs px-2 py-0.5 bg-sky-100 text-sky-700 rounded-full border border-sky-200">
                {step.method_name}
              </span>
            )}
          </div>
          <h3 data-testid="step-title" className="font-semibold text-gray-800 text-sm truncate">{step.title}</h3>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {step.is_final && (
            <span className="text-xs px-2 py-0.5 bg-green-100 text-green-700 rounded-full border border-green-200">
              完成
            </span>
          )}
          {isExpanded ? (
            <ChevronUp className="w-4 h-4 text-gray-400" />
          ) : (
            <ChevronDown className="w-4 h-4 text-gray-400" />
          )}
        </div>
      </button>

      {/* Content */}
      <AnimatePresence initial={false}>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="overflow-hidden"
          >
            <div data-testid="step-content" className="px-4 pb-4 space-y-3">
              {step.content.key_point && (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-3">
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-emerald-700">
                    核心答案
                  </div>
                  <div className="mt-1 text-sm font-medium text-emerald-900">
                    <MathContent content={step.content.key_point} className="text-sm" />
                  </div>
                </div>
              )}

              {/* Explanation */}
              <MathContent content={step.content.explanation} className="text-sm" />

              {hasDetails && (
                <div className="rounded-xl border border-gray-200 bg-white/80">
                  <button
                    onClick={() => setShowDetails(!showDetails)}
                    className="w-full flex items-center justify-between px-3.5 py-2.5 text-left text-xs font-medium text-gray-500 hover:text-gray-700"
                  >
                    <span>详细过程</span>
                    {showDetails ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                  </button>
                  <AnimatePresence initial={false}>
                    {showDetails && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="overflow-hidden px-3.5 pb-3"
                      >
                        <MathContent content={step.content.details!} className="text-sm" />
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              )}

              {/* Formula block */}
              {step.content.formula && (
                <div className="bg-white/70 rounded-lg border border-gray-100 px-4 py-3 text-center">
                  <MathContent content={`$$${step.content.formula}$$`} className="text-base" />
                </div>
              )}

              {hasDiagram && (
                <div className="rounded-xl border border-gray-200 bg-white/80 px-3 py-3">
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 mb-2">
                    图示
                  </div>
                  <div className="max-h-[420px] overflow-auto rounded-lg">
                    {diagramUrl ? (
                      <img
                        src={diagramUrl}
                        alt={step.content.diagram_caption || `${step.title} 图示`}
                        className="mx-auto max-w-full h-auto rounded-lg border border-gray-100 bg-white"
                      />
                    ) : step.content.diagram_tikz ? (
                      <TikzDiagram source={step.content.diagram_tikz} />
                    ) : step.content.diagram_mermaid ? (
                      <MermaidDiagram source={step.content.diagram_mermaid} caption={step.content.diagram_caption} />
                    ) : null}
                  </div>
                  {step.content.diagram_caption && !step.content.diagram_mermaid && (
                    <div className="mt-2 text-xs text-gray-500">
                      {step.content.diagram_caption}
                    </div>
                  )}
                </div>
              )}

              {/* Conclusion */}
              {step.content.conclusion && (
                <div className="flex items-start gap-2 bg-white/80 rounded-lg px-3 py-2 border border-gray-100">
                  <span className="text-green-500 mt-0.5">✓</span>
                  <MathContent content={step.content.conclusion} className="text-sm font-medium" />
                </div>
              )}

              {/* Citations toggle */}
              {hasCitations && (
                <div>
                  <button
                    onClick={() => setShowCitations(!showCitations)}
                    className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-600 transition-colors"
                  >
                    <BookOpen className="w-3.5 h-3.5" />
                    <span>依据来源 ({step.content.citations.length})</span>
                    {showCitations ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                  </button>

                  <AnimatePresence>
                    {showCitations && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="mt-2 space-y-1.5"
                      >
                        {step.content.citations.map((c, i) => (
                          <div
                            key={i}
                            className={`flex items-start gap-2 text-xs rounded-lg px-3 py-2 ${
                              c.type === 'in_problem'
                                ? 'bg-blue-50 text-blue-700 border border-blue-100'
                                : 'bg-amber-50 text-amber-700 border border-amber-100'
                            }`}
                          >
                            <FileText className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                            <div>
                              <span className="font-medium">
                                {c.type === 'in_problem' ? '题内依据' : '背景知识'}
                                {c.source && `（${c.source}）`}：
                              </span>
                              <MathContent content={c.text} className="inline text-xs" />
                            </div>
                          </div>
                        ))}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              )}

              {/* Ask about this step */}
              <button
                onClick={() => onAskAbout(step.step_index)}
                className="text-xs text-brand-500 hover:text-brand-700 underline underline-offset-2 transition-colors"
              >
                对这一步有疑问？点此提问
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}
