import { useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Upload, Image, X, Loader2, BookOpen, AlertCircle } from 'lucide-react'
import { MathContent } from './MathContent'
import { useSessionStore, SUBJECT_LABELS, SUBJECT_COLORS } from '../store/sessionStore'

interface Props {
  onSolve: () => void
  onStartNewProblem: () => void
  isSolving: boolean
  error: string | null
}

export function ProblemPanel({ onSolve, onStartNewProblem, isSolving, error }: Props) {
  const {
    session, problemText, problemImages,
    setProblemText, addProblemImage, removeProblemImage, resetSession,
  } = useSessionStore()

  const fileInputRef = useRef<HTMLInputElement>(null)
  const [dragOver, setDragOver] = useState(false)
  const [previewMode, setPreviewMode] = useState(false)

  const handleFileChange = (files: FileList | null) => {
    if (!files) return
    Array.from(files).forEach((file) => {
      if (!file.type.startsWith('image/')) return
      const reader = new FileReader()
      reader.onload = (e) => {
        if (e.target?.result) addProblemImage(e.target.result as string)
      }
      reader.readAsDataURL(file)
    })
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    handleFileChange(e.dataTransfer.files)
  }

  const canSolve = (problemText.trim() || problemImages.length > 0) && !isSolving

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex-shrink-0 flex items-center justify-between px-4 py-3 border-b border-gray-100">
        <div className="flex items-center gap-2">
          <BookOpen className="w-5 h-5 text-brand-500" />
          <h2 className="font-semibold text-gray-800">题目</h2>
          {session && (
            <span className={`text-xs px-2 py-0.5 rounded-full border ${SUBJECT_COLORS[session.subject]}`}>
              {SUBJECT_LABELS[session.subject]}
            </span>
          )}
        </div>
        {session && (
          <div className="flex items-center gap-3">
            <button
              onClick={() => { resetSession(); setPreviewMode(false) }}
              className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
            >
              重新解题
            </button>
            <button
              onClick={() => { onStartNewProblem(); setPreviewMode(false) }}
              className="text-xs text-brand-500 hover:text-brand-700 transition-colors"
            >
              新问题
            </button>
          </div>
        )}
      </div>

      {/* Problem Content */}
      <div className="flex-1 overflow-y-auto">
        {!session ? (
          // Input Mode
          <div className="p-4 space-y-3">
            {/* Text Input */}
            <div className="relative">
              <textarea
                value={problemText}
                onChange={(e) => setProblemText(e.target.value)}
                placeholder="在此粘贴或输入题目内容…&#10;&#10;支持：文字、公式（LaTeX）&#10;例：已知函数 f(x) = x² - 2x + 1，求 f(2) 的值"
                className="w-full min-h-[160px] resize-none rounded-xl border-2 border-gray-200 focus:border-brand-400 focus:outline-none px-4 py-3 text-sm text-gray-700 bg-gray-50 focus:bg-white transition-colors placeholder-gray-400 leading-relaxed"
                disabled={isSolving}
              />
              {problemText && (
                <button
                  onClick={() => setProblemText('')}
                  className="absolute top-2 right-2 p-1 rounded-full bg-gray-200 hover:bg-gray-300 transition-colors"
                >
                  <X className="w-3 h-3 text-gray-500" />
                </button>
              )}
            </div>

            {/* Image Upload */}
            <div
              onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              className={`relative rounded-xl border-2 border-dashed transition-all duration-200 cursor-pointer ${
                dragOver ? 'border-brand-400 bg-brand-50' : 'border-gray-200 hover:border-brand-300 hover:bg-gray-50'
              }`}
              onClick={() => fileInputRef.current?.click()}
            >
              <div className="flex items-center justify-center gap-2 py-3 px-4">
                <Image className="w-4 h-4 text-gray-400" />
                <span className="text-sm text-gray-400">上传题目图片（可选，支持拖拽）</span>
                <Upload className="w-3.5 h-3.5 text-gray-400" />
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={(e) => handleFileChange(e.target.files)}
              />
            </div>

            {/* Image Previews */}
            <AnimatePresence>
              {problemImages.length > 0 && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="flex flex-wrap gap-2"
                >
                  {problemImages.map((img, i) => (
                    <div key={i} className="relative group">
                      <img
                        src={img}
                        alt={`图片 ${i + 1}`}
                        className="w-20 h-20 object-cover rounded-lg border-2 border-gray-200"
                      />
                      <button
                        onClick={(e) => { e.stopPropagation(); removeProblemImage(i) }}
                        className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-500 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <X className="w-3 h-3 text-white" />
                      </button>
                    </div>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>

            {/* Error */}
            <AnimatePresence>
              {error && (
                <motion.div
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="flex items-center gap-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2"
                >
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  {error}
                </motion.div>
              )}
            </AnimatePresence>

            {/* Solve Button */}
            <button
              onClick={onSolve}
              disabled={!canSolve}
              className={`w-full py-3 rounded-xl font-semibold text-sm transition-all duration-200 flex items-center justify-center gap-2 ${
                canSolve
                  ? 'bg-gradient-to-r from-brand-500 to-brand-600 text-white shadow-md hover:shadow-lg hover:from-brand-600 hover:to-brand-700 active:scale-95'
                  : 'bg-gray-100 text-gray-400 cursor-not-allowed'
              }`}
            >
              {isSolving ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  分析题目中…
                </>
              ) : (
                '开始解题 →'
              )}
            </button>
          </div>
        ) : (
          // Display Mode
          <div className="p-4 space-y-3">
            {/* Toggle between raw and rendered */}
            <div className="flex items-center justify-between">
              <span className="text-xs text-gray-400">题目内容</span>
              <button
                onClick={() => setPreviewMode(!previewMode)}
                className="text-xs text-brand-500 hover:text-brand-700 transition-colors"
              >
                {previewMode ? '显示原文' : '渲染预览'}
              </button>
            </div>

            {problemText && (
              <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3">
                {previewMode ? (
                  <MathContent content={problemText} />
                ) : (
                  <pre className="text-sm text-gray-700 whitespace-pre-wrap font-sans leading-relaxed">
                    {problemText}
                  </pre>
                )}
              </div>
            )}

            {problemImages.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {problemImages.map((img, i) => (
                  <img
                    key={i}
                    src={img}
                    alt={`图片 ${i + 1}`}
                    className="max-w-full rounded-lg border border-gray-200 cursor-zoom-in"
                    onClick={() => window.open(img, '_blank')}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
