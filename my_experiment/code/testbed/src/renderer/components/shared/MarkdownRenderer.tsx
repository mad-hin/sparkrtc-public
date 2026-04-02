import React, { useState, useMemo } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeHighlight from 'rehype-highlight'
import { Copy, Check, FileCode } from 'lucide-react'

interface MarkdownRendererProps {
  content: string
  className?: string
}

interface CodeChangeBlock {
  file: string
  description?: string
  code: string
}

interface ContentSegment {
  type: 'markdown' | 'code_change'
  content: string
  codeChange?: CodeChangeBlock
}

// Split content into markdown segments and code_change blocks
function parseContent(content: string): ContentSegment[] {
  const segments: ContentSegment[] = []
  const codeChangeRegex = /<code_change\s+file="([^"]+)"(?:\s+description="([^"]*)")?\s*>([\s\S]*?)<\/code_change>/g
  
  let lastIndex = 0
  let match
  
  while ((match = codeChangeRegex.exec(content)) !== null) {
    // Add markdown segment before this code_change
    if (match.index > lastIndex) {
      const mdContent = content.slice(lastIndex, match.index).trim()
      if (mdContent) {
        segments.push({ type: 'markdown', content: mdContent })
      }
    }
    
    // Add code_change segment
    segments.push({
      type: 'code_change',
      content: '',
      codeChange: {
        file: match[1],
        description: match[2] || undefined,
        code: match[3].trim()
      }
    })
    
    lastIndex = match.index + match[0].length
  }
  
  // Add remaining markdown content
  if (lastIndex < content.length) {
    const mdContent = content.slice(lastIndex).trim()
    if (mdContent) {
      segments.push({ type: 'markdown', content: mdContent })
    }
  }
  
  return segments
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

// Render diff with proper line coloring
function DiffRenderer({ code }: { code: string }) {
  const lines = code.split('\n')
  
  return (
    <pre className="bg-slate-900 border border-slate-700 rounded-lg p-4 overflow-x-auto text-xs font-mono">
      {lines.map((line, i) => {
        let lineClass = 'text-slate-300'
        let bgClass = ''
        
        if (line.startsWith('+++') || line.startsWith('---')) {
          lineClass = 'text-slate-400'
        } else if (line.startsWith('@@')) {
          lineClass = 'text-cyan-400'
        } else if (line.startsWith('+')) {
          lineClass = 'text-green-400'
          bgClass = 'bg-green-900/20'
        } else if (line.startsWith('-')) {
          lineClass = 'text-red-400'
          bgClass = 'bg-red-900/20'
        }
        
        return (
          <div key={i} className={`${bgClass} ${lineClass}`}>
            {line || ' '}
          </div>
        )
      })}
    </pre>
  )
}

// Code change block component (bypasses markdown parsing)
function CodeChangeRenderer({ codeChange }: { codeChange: CodeChangeBlock }) {
  return (
    <div className="my-4">
      <div className="flex items-center gap-2 mb-1">
        <FileCode size={14} className="text-blue-400" />
        <span className="font-semibold text-slate-200">{codeChange.file}</span>
      </div>
      {codeChange.description && (
        <p className="text-sm text-slate-400 mb-2 italic">{codeChange.description}</p>
      )}
      <div className="relative group">
        <DiffRenderer code={codeChange.code} />
        <div className="opacity-0 group-hover:opacity-100 transition-opacity">
          <CopyButton text={codeChange.code} />
        </div>
      </div>
    </div>
  )
}

// Markdown segment renderer
function MarkdownSegment({ content }: { content: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      rehypePlugins={[rehypeHighlight]}
      components={{
        pre({ children, ...props }) {
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
  )
}

export default function MarkdownRenderer({ content, className = '' }: MarkdownRendererProps) {
  const segments = useMemo(() => parseContent(content), [content])
  
  return (
    <div className={`prose prose-invert prose-sm max-w-none ${className}`}>
      {segments.map((segment, i) => (
        <React.Fragment key={i}>
          {segment.type === 'markdown' ? (
            <MarkdownSegment content={segment.content} />
          ) : segment.codeChange ? (
            <CodeChangeRenderer codeChange={segment.codeChange} />
          ) : null}
        </React.Fragment>
      ))}
    </div>
  )
}
