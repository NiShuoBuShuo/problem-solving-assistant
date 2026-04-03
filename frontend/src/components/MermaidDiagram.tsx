import { useEffect, useRef, useState } from 'react'

let mermaidLoaded = false
let mermaidPromise: Promise<typeof import('mermaid')> | null = null

/** Lazy-load mermaid only once. */
function loadMermaid() {
  if (!mermaidPromise) {
    mermaidPromise = import('mermaid').then((mod) => {
      if (!mermaidLoaded) {
        mod.default.initialize({
          startOnLoad: false,
          theme: 'base',
          themeVariables: {
            primaryColor: '#eff6ff',
            primaryTextColor: '#1e3a5f',
            primaryBorderColor: '#3b82f6',
            lineColor: '#6b7280',
            secondaryColor: '#f0fdf4',
            tertiaryColor: '#faf5ff',
            fontFamily: 'system-ui, sans-serif',
            fontSize: '13px',
          },
          flowchart: { curve: 'basis', htmlLabels: false },
          sequence: { useMaxWidth: true },
        })
        mermaidLoaded = true
      }
      return mod
    })
  }
  return mermaidPromise
}

let idCounter = 0
function nextId() {
  return `mermaid-${++idCounter}`
}

interface Props {
  source: string
  caption?: string
}

export function MermaidDiagram({ source, caption }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [state, setState] = useState<'loading' | 'rendered' | 'error'>('loading')
  const [, setErrorMsg] = useState('')
  const diagramId = useRef(nextId())

  useEffect(() => {
    let cancelled = false
    setState('loading')

    loadMermaid()
      .then(async (mod) => {
        if (cancelled || !containerRef.current) return
        try {
          const { svg } = await mod.default.render(diagramId.current, source.trim())
          if (cancelled || !containerRef.current) return
          containerRef.current.innerHTML = svg
          // Make the SVG responsive
          const svgEl = containerRef.current.querySelector('svg')
          if (svgEl) {
            svgEl.style.maxWidth = '100%'
            svgEl.style.height = 'auto'
          }
          setState('rendered')
        } catch (err) {
          if (!cancelled) {
            setErrorMsg(String(err))
            setState('error')
          }
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setErrorMsg(String(err))
          setState('error')
        }
      })

    return () => { cancelled = true }
  }, [source])

  if (state === 'error') {
    return (
      <div className="rounded-lg border border-red-100 bg-red-50 px-3 py-2">
        <p className="text-xs text-red-600 font-medium mb-1">图表渲染失败</p>
        <pre className="text-xs text-red-500 whitespace-pre-wrap break-all">{source}</pre>
      </div>
    )
  }

  return (
    <div className="flex flex-col items-center gap-2">
      {state === 'loading' && (
        <div className="text-xs text-gray-400 animate-pulse py-4">加载图表中…</div>
      )}
      <div
        ref={containerRef}
        className="w-full overflow-x-auto rounded-lg"
        style={{ display: state === 'rendered' ? 'block' : 'none' }}
      />
      {caption && state === 'rendered' && (
        <p className="text-xs text-gray-500">{caption}</p>
      )}
    </div>
  )
}
