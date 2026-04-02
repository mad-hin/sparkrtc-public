import React, { useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeHighlight from 'rehype-highlight'
import { Copy, Check } from 'lucide-react'

interface MarkdownRendererProps {
  content: string
  className?: string
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    await navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <button
      onClick={handleCopy}
      className="absolute top-2 right-2 p-1.5 rounded-md bg-slate-700/80 hover:bg-slate-600 text-slate-300 hover:text-white transition-colors"
      title="Copy code"
    >
      {copied ? <Check size={14} /> : <Copy size={14} />}
    </button>
  )
}

export default function MarkdownRenderer({ content, className = '' }: MarkdownRendererProps) {
  return (
    <div className={`prose prose-invert prose-sm max-w-none ${className}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeHighlight]}
        components={{
          pre({ children, ...props }) {
            // Extract text content for copy button
            const codeEl = React.Children.toArray(children).find(
              (child): child is React.ReactElement =>
                React.isValidElement(child) && child.type === 'code'
            )
            const codeText =
              codeEl && typeof codeEl.props.children === 'string'
                ? codeEl.props.children
                : ''

            return (
              <div className="relative group">
                <pre
                  {...props}
                  className="bg-surface-secondary border border-slate-700 rounded-lg p-4 overflow-x-auto"
                >
                  {children}
                </pre>
                <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                  <CopyButton text={codeText} />
                </div>
              </div>
            )
          },
          table({ children, ...props }) {
            return (
              <div className="overflow-x-auto">
                <table {...props} className="border-collapse border border-slate-700">
                  {children}
                </table>
              </div>
            )
          },
          th({ children, ...props }) {
            return (
              <th {...props} className="border border-slate-700 bg-surface-tertiary px-3 py-2 text-left text-xs font-medium text-slate-300">
                {children}
              </th>
            )
          },
          td({ children, ...props }) {
            return (
              <td {...props} className="border border-slate-700 px-3 py-2 text-sm text-slate-300">
                {children}
              </td>
            )
          }
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  )
}
