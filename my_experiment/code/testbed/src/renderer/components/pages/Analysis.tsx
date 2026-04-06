import React, { useRef, useMemo, useState, useCallback, useEffect } from 'react'
import { BrainCircuit, Square, Trash2, Settings, KeyRound, CheckCircle2, XCircle, Info, PlayCircle, Loader2 } from 'lucide-react'
import ModelSelector from '../shared/ModelSelector'
import { useNavigate } from 'react-router-dom'
import { useAnalysisStore, type BatchValidationResult } from '../../store/analysisStore'
import { useSettingsStore } from '../../store/settingsStore'
import { useExperimentStore } from '../../store/experimentStore'
import { createWebSocket } from '../../api/client'
import { api } from '../../api/client'
import MarkdownRenderer from '../shared/MarkdownRenderer'
import { matchScenario, SCENARIOS, type ExpectedAnomaly, type DebugScenario } from '../../data/debugScenarios'

function checkAnomalyFound(analysisText: string, label: string): boolean {
  const lower = analysisText.toLowerCase()
  // Check exact label match
  if (lower.includes(label.toLowerCase())) return true
  // Check partial matches for common LLM paraphrasing
  const words = label.toLowerCase().split(/\s+/)
  if (words.length >= 2) {
    // Check if all significant words appear within a reasonable proximity
    return words.every(w => lower.includes(w))
  }
  return false
}

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
    clear,
    // Batch validation from store (persists across tab navigation)
    batchValidating,
    batchCurrentIdx,
    batchResults,
    batchLiveText,
    setBatchValidating,
    setBatchCurrentIdx,
    setBatchResults,
    updateBatchResult,
    setBatchLiveText,
    appendBatchLiveText,
    resetBatch,
  } = useAnalysisStore()

  const { apiKey, models, debugMode } = useSettingsStore()
  const { status: expStatus } = useExperimentStore()
  const wsRef = useRef<WebSocket | null>(null)
  const batchAbortRef = useRef(false)
  const batchWsRef = useRef<WebSocket | null>(null)
  const liveScrollRef = useRef<HTMLDivElement>(null)
  const navigate = useNavigate()
  const [detailsOpenIdx, setDetailsOpenIdx] = useState<number | null>(null)

  // Auto-scroll the live analysis text
  useEffect(() => {
    if (liveScrollRef.current && batchValidating) {
      liveScrollRef.current.scrollTop = liveScrollRef.current.scrollHeight
    }
  }, [batchLiveText, batchValidating])

  /** Analyze a single scenario via WebSocket and return the analysis text */
  const analyzeScenario = useCallback((outputDir: string, dataName: string): Promise<string> => {
    return new Promise((resolve) => {
      let text = ''
      let resolved = false
      const done = () => { if (!resolved) { resolved = true; resolve(text) } }

      const ws = createWebSocket('/api/analysis/ws/stream')
      batchWsRef.current = ws

      ws.onopen = () => {
        ws.send(JSON.stringify({
          output_dir: outputDir,
          data_name: dataName,
          model: selectedModel,
          api_key: apiKey
        }))
      }
      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data)
          if (msg.chunk) {
            text += msg.chunk
            appendBatchLiveText(msg.chunk)
          }
          if (msg.done) { ws.close(); done() }
        } catch {
          text += event.data
          appendBatchLiveText(event.data)
        }
      }
      ws.onerror = () => done()
      ws.onclose = () => done()
    })
  }, [selectedModel, apiKey, appendBatchLiveText])

  /** Run validation across all 7 scenarios */
  const handleValidateAll = useCallback(async () => {
    if (!apiKey) return
    batchAbortRef.current = false
    setBatchValidating(true)

    const dataName = expStatus.data_name || 'test'

    const initResults: BatchValidationResult[] = SCENARIOS.map(s => ({
      scenarioId: s.id,
      scenarioName: s.name,
      paper: s.paper,
      status: 'pending' as const,
      primaryFound: 0, primaryTotal: 0,
      totalFound: 0, total: 0, details: [],
      analysisText: ''
    }))
    setBatchResults(initResults)

    for (let i = 0; i < SCENARIOS.length; i++) {
      if (batchAbortRef.current) break
      const s = SCENARIOS[i]
      setBatchCurrentIdx(i)
      setBatchLiveText('')

      updateBatchResult(i, { status: 'running' })

      const outputDir = `${s.outputDirPattern}/output_1`

      try {
        const summary = await api<{ summary: string }>('/api/analysis/summary', {
          method: 'POST',
          body: JSON.stringify({ output_dir: outputDir, data_name: dataName })
        })

        if (!summary.summary || summary.summary.includes('not found') || summary.summary.length < 50) {
          updateBatchResult(i, { status: 'skipped' })
          continue
        }

        const llmText = await analyzeScenario(outputDir, dataName)

        const details = s.expectedAnomalies.map(a => ({
          label: a.label,
          found: checkAnomalyFound(llmText, a.label),
          severity: a.severity
        }))

        const primary = details.filter(d => d.severity === 'primary')
        updateBatchResult(i, {
          status: 'done',
          primaryFound: primary.filter(d => d.found).length,
          primaryTotal: primary.length,
          totalFound: details.filter(d => d.found).length,
          total: details.length,
          details,
          analysisText: llmText
        })
      } catch {
        updateBatchResult(i, { status: 'error' })
      }
    }

    setBatchValidating(false)
    setBatchCurrentIdx(-1)
  }, [apiKey, selectedModel, expStatus.data_name, analyzeScenario, setBatchValidating, setBatchCurrentIdx, setBatchResults, updateBatchResult, setBatchLiveText])

  const scenario = useMemo(() => {
    if (!debugMode || !expStatus.output_dir) return null
    return matchScenario(expStatus.output_dir)
  }, [debugMode, expStatus.output_dir])

  const validationResults = useMemo(() => {
    if (!scenario || !analysisText || streaming) return null
    const results = scenario.expectedAnomalies.map(a => ({
      ...a,
      found: checkAnomalyFound(analysisText, a.label)
    }))
    const primary = results.filter(r => r.severity === 'primary')
    const primaryFound = primary.filter(r => r.found).length
    const total = results.length
    const totalFound = results.filter(r => r.found).length
    return { results, primaryFound, primaryTotal: primary.length, totalFound, total }
  }, [scenario, analysisText, streaming])

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
          <h2 className="text-2xl font-bold text-[#f4f4f4]">LLM Analysis</h2>
          <p className="text-sm text-[#c6c6c6] mt-1">
            Analyze experiment results with AI-powered insights
          </p>
        </div>
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center max-w-md">
            <KeyRound size={48} className="mx-auto mb-4 text-[#6f6f6f] opacity-60" />
            <h3 className="text-lg font-semibold text-[#f4f4f4] mb-2">API Key Required</h3>
            <p className="text-sm text-[#c6c6c6] mb-5">
              Set up your OpenRouter API key in Settings to use LLM analysis. You can get one at{' '}
              <span className="text-accent">openrouter.ai</span>.
            </p>
            <button
              onClick={() => navigate('/settings')}
              className="px-5 py-2.5 bg-accent hover:bg-accent-hover text-[#f4f4f4] rounded-none text-sm font-medium inline-flex items-center gap-2"
            >
              <Settings size={16} /> Go to Settings
            </button>
          </div>
        </div>
      </div>
    )
  }

  const layerColors: Record<string, string> = {
    application: 'bg-purple-500/20 text-purple-300 border-purple-500/30',
    network: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
    transport: 'bg-amber-500/20 text-amber-300 border-amber-500/30'
  }

  return (
    <div className="flex flex-col">
      <div className="mb-4">
        <h2 className="text-2xl font-bold text-[#f4f4f4]">LLM Analysis</h2>
        <p className="text-sm text-[#c6c6c6] mt-1">
          Analyze experiment results with AI-powered insights
        </p>
      </div>

      {/* Controls */}
      <div className="bg-surface-secondary border border-[#393939] rounded-none p-4 mb-4">
        <div className="flex items-center gap-3">
          {models.length > 0 ? (
            <ModelSelector value={selectedModel} onChange={setSelectedModel} models={models} />
          ) : (
            <span className="text-sm text-[#c6c6c6]">
              Fetch models in <button onClick={() => navigate('/settings')} className="text-accent hover:underline">Settings</button> first
            </span>
          )}

          {!streaming ? (
            <button
              onClick={handleAnalyze}
              disabled={!canAnalyze}
              className="px-5 py-2 bg-accent hover:bg-accent-hover disabled:opacity-50 text-[#f4f4f4] rounded-none text-sm font-medium flex items-center gap-2"
            >
              <BrainCircuit size={16} /> Analyze Results
            </button>
          ) : (
            <button
              onClick={handleStop}
              className="px-5 py-2 bg-danger hover:bg-red-600 text-[#f4f4f4] rounded-none text-sm font-medium flex items-center gap-2"
            >
              <Square size={16} /> Stop
            </button>
          )}

          <button
            onClick={clear}
            disabled={streaming}
            className="px-4 py-2 bg-surface-tertiary hover:bg-[#525252] disabled:opacity-50 text-[#f4f4f4] rounded-none text-sm font-medium flex items-center gap-2"
          >
            <Trash2 size={14} /> Clear
          </button>

          {!expStatus.output_dir && (
            <span className="text-xs text-warning">Run an experiment first</span>
          )}

          {/* Validate All button — debug mode only */}
          {debugMode && !batchValidating && (
            <button
              onClick={handleValidateAll}
              disabled={!apiKey || streaming}
              className="ml-auto px-4 py-2 bg-surface-tertiary hover:bg-[#353535] disabled:opacity-50 text-[#f4f4f4] text-sm font-medium flex items-center gap-2"
            >
              <PlayCircle size={14} /> Validate All 7
            </button>
          )}
          {debugMode && batchValidating && (
            <button
              onClick={() => {
                batchAbortRef.current = true
                try { batchWsRef.current?.close() } catch {}
                resetBatch()
              }}
              className="ml-auto px-4 py-2 bg-danger hover:bg-red-700 text-[#f4f4f4] text-sm font-medium flex items-center gap-2"
            >
              <Square size={14} /> Stop Validation
            </button>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4" style={{ minHeight: '280px' }}>
        {/* Analysis (2/3) */}
        <div className="lg:col-span-2 bg-surface-secondary border border-[#393939] rounded-none overflow-hidden flex flex-col" style={{ maxHeight: '50vh' }}>
          <div className="px-4 py-3 border-b border-[#393939] flex items-center justify-between shrink-0">
            <h3 className="text-sm font-medium text-[#c6c6c6]">
              {batchValidating && batchCurrentIdx >= 0
                ? `Analyzing: ${SCENARIOS[batchCurrentIdx]?.name ?? ''} (${batchCurrentIdx + 1}/${SCENARIOS.length})`
                : 'Analysis'}
            </h3>
            {batchValidating && (
              <span className="flex items-center gap-1.5 text-xs text-accent">
                <Loader2 size={12} className="animate-spin" /> Streaming...
              </span>
            )}
          </div>
          <div ref={liveScrollRef} className="flex-1 overflow-auto p-4">
            {/* Show batch live stream when batch validating */}
            {batchValidating && batchLiveText ? (
              <>
                <MarkdownRenderer content={batchLiveText} />
                <span className="inline-block w-2 h-4 bg-accent animate-pulse ml-0.5" />
              </>
            ) : analysisText ? (
              <MarkdownRenderer content={analysisText} />
            ) : (
              <p className="text-sm text-[#6f6f6f] italic">
                Click "Analyze Results" to start AI analysis...
              </p>
            )}
            {streaming && !batchValidating && (
              <span className="inline-block w-2 h-4 bg-accent animate-pulse ml-0.5" />
            )}
          </div>
        </div>

        {/* Summary (1/3) */}
        <div className="bg-surface-secondary border border-[#393939] rounded-none overflow-hidden flex flex-col" style={{ maxHeight: '50vh' }}>
          <div className="px-4 py-3 border-b border-[#393939]">
            <h3 className="text-sm font-medium text-[#c6c6c6]">Summary Statistics</h3>
          </div>
          <div className="flex-1 overflow-auto p-4">
            {summaryText ? (
              <pre className="text-xs font-mono text-[#c6c6c6] whitespace-pre-wrap leading-relaxed">
                {summaryText}
              </pre>
            ) : (
              <p className="text-sm text-[#6f6f6f] italic">
                Statistics will appear here after analysis starts...
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Debug Mode: Ground Truth Validation */}
      {debugMode && analysisText && !streaming && validationResults && scenario && (
        <div className="mt-4 bg-surface-secondary border border-[#393939] rounded-none overflow-hidden">
          <div className="px-4 py-3 border-b border-[#393939] flex items-center justify-between">
            <div>
              <h3 className="text-sm font-medium text-[#f4f4f4]">Ground Truth Validation</h3>
              <p className="text-xs text-[#6f6f6f] mt-0.5">
                Scenario: <span className="text-[#c6c6c6]">{scenario.name}</span>
              </p>
            </div>
            <div className="flex items-center gap-3">
              <div className="text-right">
                <p className="text-xs text-[#6f6f6f]">Primary Accuracy</p>
                <p className={`text-lg font-bold ${
                  validationResults.primaryFound === validationResults.primaryTotal
                    ? 'text-emerald-400'
                    : validationResults.primaryFound > 0 ? 'text-amber-400' : 'text-red-400'
                }`}>
                  {validationResults.primaryFound}/{validationResults.primaryTotal}
                </p>
              </div>
              <div className="text-right">
                <p className="text-xs text-[#6f6f6f]">Total</p>
                <p className="text-lg font-bold text-[#c6c6c6]">
                  {validationResults.totalFound}/{validationResults.total}
                </p>
              </div>
            </div>
          </div>
          <div className="p-4">
            <p className="text-xs text-[#6f6f6f] mb-3">{scenario.description}</p>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-[#6f6f6f] border-b border-[#393939]">
                  <th className="text-left pb-2 font-medium">Expected Anomaly</th>
                  <th className="text-left pb-2 font-medium">Layer</th>
                  <th className="text-left pb-2 font-medium">Severity</th>
                  <th className="text-center pb-2 font-medium">Found</th>
                </tr>
              </thead>
              <tbody>
                {validationResults.results.map((r, i) => (
                  <tr key={i} className="border-b border-[#393939]/50">
                    <td className="py-2">
                      <span className="text-[#f4f4f4]">{r.label}</span>
                      <p className="text-[10px] text-[#6f6f6f] mt-0.5">{r.description}</p>
                    </td>
                    <td className="py-2">
                      <span className={`text-[10px] px-1.5 py-0.5 rounded border ${layerColors[r.layer]}`}>
                        {r.layer}
                      </span>
                    </td>
                    <td className="py-2">
                      <span className={`text-xs ${r.severity === 'primary' ? 'text-[#f4f4f4] font-medium' : 'text-[#6f6f6f]'}`}>
                        {r.severity}
                      </span>
                    </td>
                    <td className="py-2 text-center">
                      {r.found ? (
                        <CheckCircle2 size={16} className="inline text-emerald-400" />
                      ) : (
                        <XCircle size={16} className={`inline ${r.severity === 'primary' ? 'text-red-400' : 'text-[#525252]'}`} />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Debug Mode: No matching scenario info */}
      {debugMode && analysisText && !streaming && !scenario && expStatus.output_dir && (
        <div className="mt-4 bg-surface-secondary border border-[#393939] rounded-none p-4">
          <div className="flex items-start gap-2">
            <Info size={16} className="text-[#6f6f6f] mt-0.5 shrink-0" />
            <div>
              <p className="text-xs text-[#c6c6c6]">
                Debug mode is enabled but no matching scenario found for output directory{' '}
                <span className="font-mono text-[#c6c6c6]">{expStatus.output_dir}</span>.
              </p>
              <p className="text-xs text-[#6f6f6f] mt-1">
                Use a recognized pattern in your output_dir:{' '}
                <span className="font-mono text-[#c6c6c6]">bandwidth_constrained</span>,{' '}
                <span className="font-mono text-[#c6c6c6]">packet_loss</span>,{' '}
                <span className="font-mono text-[#c6c6c6]">cpu_limited</span>,{' '}
                <span className="font-mono text-[#c6c6c6]">bursty_network</span>
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Batch Validation Results — all 7 scenarios */}
      {debugMode && batchResults.length > 0 && (
        <div className="mt-4 bg-surface-secondary border border-[#393939] overflow-hidden">
          <div className="px-4 py-3 border-b border-[#393939] flex items-center justify-between">
            <div>
              <h3 className="text-sm font-medium text-[#f4f4f4]">
                All Scenarios Validation
                {batchValidating && (
                  <span className="ml-2 text-xs text-[#c6c6c6] font-normal">
                    Analyzing {batchCurrentIdx + 1}/{SCENARIOS.length}...
                  </span>
                )}
              </h3>
              <p className="text-xs text-[#6f6f6f] mt-0.5">
                Model: <span className="text-[#c6c6c6] font-mono">{selectedModel}</span>
              </p>
            </div>
            {(() => {
              const done = batchResults.filter(r => r.status === 'done')
              const overallPrimaryFound = done.reduce((s, r) => s + r.primaryFound, 0)
              const overallPrimaryTotal = done.reduce((s, r) => s + r.primaryTotal, 0)
              const overallTotalFound = done.reduce((s, r) => s + r.totalFound, 0)
              const overallTotal = done.reduce((s, r) => s + r.total, 0)
              if (done.length === 0) return null
              return (
                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <p className="text-[10px] text-[#6f6f6f]">Primary Accuracy</p>
                    <p className={`text-xl font-semibold ${
                      overallPrimaryTotal > 0 && overallPrimaryFound === overallPrimaryTotal
                        ? 'text-success' : overallPrimaryFound > 0 ? 'text-warning' : 'text-danger'
                    }`}>
                      {overallPrimaryFound}/{overallPrimaryTotal}
                      {overallPrimaryTotal > 0 && (
                        <span className="text-xs font-normal text-[#c6c6c6] ml-1">
                          ({Math.round(overallPrimaryFound / overallPrimaryTotal * 100)}%)
                        </span>
                      )}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] text-[#6f6f6f]">Total Accuracy</p>
                    <p className="text-xl font-semibold text-[#c6c6c6]">
                      {overallTotalFound}/{overallTotal}
                      {overallTotal > 0 && (
                        <span className="text-xs font-normal text-[#6f6f6f] ml-1">
                          ({Math.round(overallTotalFound / overallTotal * 100)}%)
                        </span>
                      )}
                    </p>
                  </div>
                </div>
              )
            })()}
          </div>
          <div className="p-4">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-[#6f6f6f] border-b border-[#393939]">
                  <th className="text-left pb-2 font-medium w-8">#</th>
                  <th className="text-left pb-2 font-medium">Scenario</th>
                  <th className="text-left pb-2 font-medium">Paper</th>
                  <th className="text-center pb-2 font-medium">Status</th>
                  <th className="text-center pb-2 font-medium">Primary</th>
                  <th className="text-center pb-2 font-medium">Total</th>
                  <th className="text-left pb-2 font-medium">Details</th>
                </tr>
              </thead>
              <tbody>
                {batchResults.map((r, i) => (
                  <React.Fragment key={r.scenarioId}>
                    <tr className="border-b border-[#393939]/50">
                      <td className="py-2 text-xs text-[#6f6f6f]">{i + 1}</td>
                      <td className="py-2 text-[#f4f4f4]">{r.scenarioName}</td>
                      <td className="py-2 text-xs text-[#6f6f6f] font-mono">{r.paper}</td>
                      <td className="py-2 text-center">
                        {r.status === 'pending' && <span className="text-xs text-[#6f6f6f]">—</span>}
                        {r.status === 'running' && <Loader2 size={14} className="inline text-accent animate-spin" />}
                        {r.status === 'done' && <CheckCircle2 size={14} className="inline text-success" />}
                        {r.status === 'skipped' && <span className="text-xs text-[#6f6f6f]">Skip</span>}
                        {r.status === 'error' && <XCircle size={14} className="inline text-danger" />}
                      </td>
                      <td className="py-2 text-center">
                        {r.status === 'done' ? (
                          <span className={`font-medium ${r.primaryFound === r.primaryTotal ? 'text-success' : 'text-warning'}`}>
                            {r.primaryFound}/{r.primaryTotal}
                          </span>
                        ) : '—'}
                      </td>
                      <td className="py-2 text-center">
                        {r.status === 'done' ? (
                          <span className="text-[#c6c6c6]">{r.totalFound}/{r.total}</span>
                        ) : '—'}
                      </td>
                      <td className="py-2">
                        <div className="space-y-1">
                          {r.status === 'done' && (
                            <>
                              {r.details.map((d, j) => (
                                <div key={j} className="flex items-center gap-1.5">
                                  {d.found ? (
                                    <CheckCircle2 size={12} className="text-success shrink-0" />
                                  ) : (
                                    <XCircle size={12} className={`shrink-0 ${d.severity === 'primary' ? 'text-danger' : 'text-[#525252]'}`} />
                                  )}
                                  <span className={`text-[10px] ${d.found ? 'text-[#f4f4f4]' : d.severity === 'primary' ? 'text-danger/80' : 'text-[#6f6f6f]'}`}>
                                    {d.label}
                                  </span>
                                  <span className={`text-[8px] ${d.severity === 'primary' ? 'text-[#c6c6c6]' : 'text-[#525252]'}`}>
                                    ({d.severity})
                                  </span>
                                </div>
                              ))}
                              <button
                                onClick={() => setDetailsOpenIdx(detailsOpenIdx === i ? null : i)}
                                className="text-[9px] text-accent hover:underline mt-1"
                              >
                                {detailsOpenIdx === i ? 'Hide LLM response' : 'View LLM response'}
                              </button>
                            </>
                          )}
                          {r.status === 'skipped' && (
                            <span className="text-[9px] text-[#6f6f6f]">No experiment data</span>
                          )}
                        </div>
                      </td>
                    </tr>
                    {/* Expandable details panel — same format as Ground Truth Validation */}
                    {detailsOpenIdx === i && r.status === 'done' && (() => {
                      const scenData = SCENARIOS.find(s => s.id === r.scenarioId)
                      return (
                      <tr>
                        <td colSpan={7} className="p-0">
                          <div className="bg-[#1a1a1a] border-b border-[#393939]">
                            {/* Ground Truth table — matches the single-experiment validation panel */}
                            <div className="px-4 py-3 border-b border-[#393939]/50">
                              <div className="flex items-center justify-between mb-3">
                                <p className="text-xs text-[#c6c6c6] font-medium">
                                  Ground Truth: {r.scenarioName}
                                </p>
                                <div className="flex items-center gap-3 text-xs">
                                  <span className="text-[#6f6f6f]">Primary: <span className={r.primaryFound === r.primaryTotal ? 'text-success font-medium' : 'text-warning font-medium'}>{r.primaryFound}/{r.primaryTotal}</span></span>
                                  <span className="text-[#6f6f6f]">Total: <span className="text-[#c6c6c6] font-medium">{r.totalFound}/{r.total}</span></span>
                                </div>
                              </div>
                              <table className="w-full text-sm">
                                <thead>
                                  <tr className="text-[10px] text-[#6f6f6f] border-b border-[#393939]">
                                    <th className="text-left pb-1.5 font-medium">Expected Anomaly</th>
                                    <th className="text-left pb-1.5 font-medium">Layer</th>
                                    <th className="text-left pb-1.5 font-medium">Severity</th>
                                    <th className="text-center pb-1.5 font-medium">Found</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {(scenData?.expectedAnomalies ?? []).map((a, j) => {
                                    const detail = r.details.find(d => d.label === a.label)
                                    const found = detail?.found ?? false
                                    return (
                                      <tr key={j} className="border-b border-[#393939]/30">
                                        <td className="py-1.5">
                                          <span className="text-xs text-[#f4f4f4]">{a.label}</span>
                                          <p className="text-[9px] text-[#6f6f6f] mt-0.5">{a.description}</p>
                                        </td>
                                        <td className="py-1.5">
                                          <span className={`text-[9px] px-1.5 py-0.5 border ${layerColors[a.layer]}`}>
                                            {a.layer}
                                          </span>
                                        </td>
                                        <td className="py-1.5">
                                          <span className={`text-xs ${a.severity === 'primary' ? 'text-[#f4f4f4] font-medium' : 'text-[#6f6f6f]'}`}>
                                            {a.severity}
                                          </span>
                                        </td>
                                        <td className="py-1.5 text-center">
                                          {found ? (
                                            <CheckCircle2 size={14} className="inline text-success" />
                                          ) : (
                                            <XCircle size={14} className={`inline ${a.severity === 'primary' ? 'text-danger' : 'text-[#525252]'}`} />
                                          )}
                                        </td>
                                      </tr>
                                    )
                                  })}
                                </tbody>
                              </table>
                            </div>
                            {/* LLM Response */}
                            <div className="px-4 py-3">
                              <p className="text-[10px] text-[#6f6f6f] font-medium mb-2">LLM Response</p>
                              <div className="max-h-64 overflow-auto bg-[#262626] p-3 border border-[#393939]">
                                <MarkdownRenderer content={r.analysisText} />
                              </div>
                            </div>
                          </div>
                        </td>
                      </tr>
                      )
                    })()}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
