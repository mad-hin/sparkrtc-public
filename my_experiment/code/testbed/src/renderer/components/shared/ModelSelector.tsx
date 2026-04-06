import React, { useState, useRef, useEffect } from 'react'
import { ChevronDown, Search } from 'lucide-react'
import type { OpenRouterModel } from '../../api/types'

interface ModelSelectorProps {
  value: string
  onChange: (modelId: string) => void
  models: OpenRouterModel[]
  className?: string
}

export default function ModelSelector({ value, onChange, models, className = '' }: ModelSelectorProps) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const selected = models.find((m) => m.id === value)

  const filtered = search
    ? models.filter(
        (m) =>
          m.name.toLowerCase().includes(search.toLowerCase()) ||
          m.id.toLowerCase().includes(search.toLowerCase())
      )
    : models

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
        setSearch('')
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  // Focus search input when opened
  useEffect(() => {
    if (open && inputRef.current) {
      inputRef.current.focus()
    }
  }, [open])

  const handleSelect = (modelId: string) => {
    onChange(modelId)
    setOpen(false)
    setSearch('')
  }

  const ctxLabel = (ctx: number) => {
    if (ctx >= 1000000) return `${(ctx / 1000000).toFixed(1)}M`
    if (ctx >= 1000) return `${Math.round(ctx / 1000)}k`
    return String(ctx)
  }

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      {/* Trigger button */}
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 bg-surface border border-[#393939] rounded-none px-3 py-2 text-sm text-[#f4f4f4] min-w-[280px] hover:border-[#525252] transition-colors"
      >
        <span className="flex-1 text-left truncate">
          {selected ? selected.name : value || 'Select a model...'}
        </span>
        {selected && (
          <span className="text-[10px] font-mono text-[#6f6f6f] shrink-0">
            {ctxLabel(selected.context_length)}
          </span>
        )}
        <ChevronDown size={14} className={`text-[#c6c6c6] transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute z-50 mt-1 w-full min-w-[350px] bg-surface-secondary border border-[#393939] rounded-none shadow-xl overflow-hidden">
          {/* Search input */}
          <div className="flex items-center gap-2 px-3 py-2 border-b border-[#393939]">
            <Search size={14} className="text-[#6f6f6f] shrink-0" />
            <input
              ref={inputRef}
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search models..."
              className="flex-1 bg-transparent text-sm text-[#f4f4f4] placeholder-[#6f6f6f] outline-none"
            />
          </div>

          {/* Model list */}
          <div className="max-h-64 overflow-auto">
            {filtered.length > 0 ? (
              filtered.map((m) => (
                <button
                  key={m.id}
                  onClick={() => handleSelect(m.id)}
                  className={`w-full flex items-center justify-between px-3 py-2 text-left text-sm transition-colors ${
                    m.id === value
                      ? 'bg-accent/15 text-accent'
                      : 'text-[#c6c6c6] hover:bg-surface-tertiary/50'
                  }`}
                >
                  <span className="truncate">{m.name}</span>
                  <span className="text-[10px] font-mono text-[#6f6f6f] shrink-0 ml-2">
                    {ctxLabel(m.context_length)} ctx
                  </span>
                </button>
              ))
            ) : (
              <div className="px-3 py-4 text-xs text-[#6f6f6f] text-center">
                No models match "{search}"
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
