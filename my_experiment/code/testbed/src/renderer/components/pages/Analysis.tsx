import React, { useRef } from 'react'
import { BrainCircuit, Square, Trash2, Settings, KeyRound } from 'lucide-react'
import ModelSelector from '../shared/ModelSelector'
import { useNavigate } from 'react-router-dom'
import { useAnalysisStore } from '../../store/analysisStore'
import { useSettingsStore } from '../../store/settingsStore'
import { useExperimentStore } from '../../store/experimentStore'
import { createWebSocket } from '../../api/client'
import { api } from '../../api/client'
import MarkdownRenderer from '../shared/MarkdownRenderer'

export default function Analysis() {
  const {
    streaming,
    analysisText,
    summaryText,
    selectedModel,
    setStreaming,
    appendChunk,
    setSummaryText,
    setSelectedModel,
    clear
  } = useAnalysisStore()

  const { apiKey, models } = useSettingsStore()
  const { status: expStatus } = useExperimentStore()
  const wsRef = useRef<WebSocket | null>(null)
  const navigate = useNavigate()

  const handleAnalyze = async () => {
    if (!apiKey || !expStatus.output_dir || !expStatus.data_name) return
    clear()
    setStreaming(true)

    // First fetch summary
    try {
      const summary = await api<{ summary: string }>('/api/analysis/summary', {
        method: 'POST',
        body: JSON.stringify({
          output_dir: expStatus.output_dir,
          data_name: expStatus.data_name
        })
      })
      setSummaryText(summary.summary)
    } catch (err) {
      setSummaryText(`Error fetching summary: ${err}`)
    }

    // Stream analysis via WebSocket
    const ws = createWebSocket('/api/analysis/ws/stream')
    wsRef.current = ws

    ws.onopen = () => {
      ws.send(JSON.stringify({
        output_dir: expStatus.output_dir,
        data_name: expStatus.data_name,
        model: selectedModel,
        api_key: apiKey
      }))
    }

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data)
        if (msg.chunk) appendChunk(msg.chunk)
        if (msg.done) setStreaming(false)
      } catch {
        appendChunk(event.data)
      }
    }

    ws.onclose = () => setStreaming(false)
    ws.onerror = () => setStreaming(false)
  }

  const handleStop = () => {
    wsRef.current?.close()
    setStreaming(false)
  }

  const canAnalyze = apiKey && models.length > 0 && expStatus.output_dir && expStatus.data_name && !streaming

  if (!apiKey) {
    return (
      <div className="h-full flex flex-col">
        <div className="mb-4">
          <h2 className="text-2xl font-bold text-white">LLM Analysis</h2>
          <p className="text-sm text-slate-400 mt-1">
            Analyze experiment results with AI-powered insights
          </p>
        </div>
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center max-w-md">
            <KeyRound size={48} className="mx-auto mb-4 text-slate-500 opacity-60" />
            <h3 className="text-lg font-semibold text-white mb-2">API Key Required</h3>
            <p className="text-sm text-slate-400 mb-5">
              Set up your OpenRouter API key in Settings to use LLM analysis. You can get one at{' '}
              <span className="text-accent">openrouter.ai</span>.
            </p>
            <button
              onClick={() => navigate('/settings')}
              className="px-5 py-2.5 bg-accent hover:bg-accent-hover text-white rounded-lg text-sm font-medium inline-flex items-center gap-2"
            >
              <Settings size={16} /> Go to Settings
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col">
      <div className="mb-4">
        <h2 className="text-2xl font-bold text-white">LLM Analysis</h2>
        <p className="text-sm text-slate-400 mt-1">
          Analyze experiment results with AI-powered insights
        </p>
      </div>

      {/* Controls */}
      <div className="bg-surface-secondary border border-slate-700 rounded-xl p-4 mb-4">
        <div className="flex items-center gap-3">
          {models.length > 0 ? (
            <ModelSelector value={selectedModel} onChange={setSelectedModel} models={models} />
          ) : (
            <span className="text-sm text-slate-400">
              Fetch models in <button onClick={() => navigate('/settings')} className="text-accent hover:underline">Settings</button> first
            </span>
          )}

          {!streaming ? (
            <button
              onClick={handleAnalyze}
              disabled={!canAnalyze}
              className="px-5 py-2 bg-accent hover:bg-accent-hover disabled:opacity-50 text-white rounded-lg text-sm font-medium flex items-center gap-2"
            >
              <BrainCircuit size={16} /> Analyze Results
            </button>
          ) : (
            <button
              onClick={handleStop}
              className="px-5 py-2 bg-danger hover:bg-red-600 text-white rounded-lg text-sm font-medium flex items-center gap-2"
            >
              <Square size={16} /> Stop
            </button>
          )}

          <button
            onClick={clear}
            disabled={streaming}
            className="px-4 py-2 bg-surface-tertiary hover:bg-slate-600 disabled:opacity-50 text-slate-200 rounded-lg text-sm font-medium flex items-center gap-2"
          >
            <Trash2 size={14} /> Clear
          </button>

          {!expStatus.output_dir && (
            <span className="text-xs text-warning">Run an experiment first</span>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Analysis (2/3) */}
        <div className="lg:col-span-2 bg-surface-secondary border border-slate-700 rounded-xl overflow-hidden flex flex-col">
          <div className="px-4 py-3 border-b border-slate-700">
            <h3 className="text-sm font-medium text-slate-300">Analysis</h3>
          </div>
          <div className="flex-1 overflow-auto p-4">
            {analysisText ? (
              <MarkdownRenderer content={analysisText} />
            ) : (
              <p className="text-sm text-slate-500 italic">
                Click "Analyze Results" to start AI analysis...
              </p>
            )}
            {streaming && (
              <span className="inline-block w-2 h-4 bg-accent animate-pulse ml-0.5" />
            )}
          </div>
        </div>

        {/* Summary (1/3) */}
        <div className="bg-surface-secondary border border-slate-700 rounded-xl overflow-hidden flex flex-col">
          <div className="px-4 py-3 border-b border-slate-700">
            <h3 className="text-sm font-medium text-slate-300">Summary Statistics</h3>
          </div>
          <div className="flex-1 overflow-auto p-4">
            {summaryText ? (
              <pre className="text-xs font-mono text-slate-400 whitespace-pre-wrap leading-relaxed">
                {summaryText}
              </pre>
            ) : (
              <p className="text-sm text-slate-500 italic">
                Statistics will appear here after analysis starts...
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
