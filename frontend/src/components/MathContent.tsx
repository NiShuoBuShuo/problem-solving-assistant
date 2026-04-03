import ReactMarkdown from 'react-markdown'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'
import type { Components } from 'react-markdown'

interface Props {
  content: string
  className?: string
}

const components: Components = {
  p: ({ children }) => <p className="mb-2 last:mb-0 leading-relaxed">{children}</p>,
  strong: ({ children }) => <strong className="font-semibold text-gray-900">{children}</strong>,
  em: ({ children }) => <em className="italic text-gray-700">{children}</em>,
  ul: ({ children }) => <ul className="list-disc list-inside space-y-1 my-2">{children}</ul>,
  ol: ({ children }) => <ol className="list-decimal list-inside space-y-1 my-2">{children}</ol>,
  li: ({ children }) => <li className="text-gray-700">{children}</li>,
  blockquote: ({ children }) => (
    <blockquote className="border-l-4 border-brand-300 pl-3 my-2 text-gray-600 italic">
      {children}
    </blockquote>
  ),
  code: ({ children, className }) => {
    const isBlock = className?.includes('language-')
    if (isBlock) {
      return (
        <pre className="bg-gray-50 rounded-lg p-3 overflow-x-auto my-2 text-sm">
          <code>{children}</code>
        </pre>
      )
    }
    return (
      <code className="bg-gray-100 rounded px-1 py-0.5 text-sm font-mono text-gray-800">
        {children}
      </code>
    )
  },
}

export function MathContent({ content, className = '' }: Props) {
  return (
    <div className={`prose prose-sm max-w-none text-gray-700 ${className}`}>
      <ReactMarkdown
        remarkPlugins={[remarkMath]}
        rehypePlugins={[rehypeKatex]}
        components={components}
      >
        {content}
      </ReactMarkdown>
    </div>
  )
}
