import React, { useRef, useState } from 'react'
import { Bot, Square, Check, X, CheckCheck, XCircle, Play, Hammer, RefreshCw, KeyRound, Settings, FileCode, Brain } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useCodeAgentStore } from '../../store/codeAgentStore'
import { useSettingsStore } from '../../store/settingsStore'
import { useExperimentStore } from '../../store/experimentStore'
import { useAnalysisStore } from '../../store/analysisStore'
import { createWebSocket, api } from '../../api/client'
import MarkdownRenderer from '../shared/MarkdownRenderer'
import ModelSelector from '../shared/ModelSelector'
import ReactDiffViewer, { DiffMethod } from 'react-diff-viewer-continued'

const STEP_LABELS = ['Anomaly Analysis', 'Deep Dive', 'Code Changes']

/** Memoized suggestion card — diff viewer only renders when expanded */
const SuggestionCard = React.memo(function SuggestionCard({
  suggestion, store, streaming
}: {
  suggestion: { id: string; file: string; description: string; oldCode: string; newCode: string; accepted: boolean }
  store: any
  streaming: boolean
}) {
  const [expanded, setExpanded] = useState(!streaming) // collapsed during streaming

  return (
    <div className={`bg-surface-secondary border rounded-none overflow-hidden ${
      suggestion.accepted ? 'border-success/50' : 'border-[#393939]'
    }`}>
      <div
        className="flex items-center justify-between px-4 py-3 border-b border-[#393939] bg-surface-tertiary/30 cursor-pointer"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-[#6f6f6f]">{expanded ? '▼' : '▶'}</span>
          <div>
            <span className="text-sm font-mono text-[#f4f4f4]">{suggestion.file}</span>
            {suggestion.description && (
              <p className="text-xs text-[#c6c6c6] mt-0.5">{suggestion.description}</p>
            )}
          </div>
        </div>
        <button
          onClick={(e) => { e.stopPropagation(); store.toggleSuggestion(suggestion.id) }}
          className={`px-3 py-1.5 rounded-none text-xs font-medium flex items-center gap-1.5 transition-colors ${
            suggestion.accepted
              ? 'bg-success/20 text-success hover:bg-success/30'
              : 'bg-surface-tertiary text-[#c6c6c6] hover:bg-[#525252]'
          }`}
        >
          {suggestion.accepted ? <Check size={12} /> : <X size={12} />}
          {suggestion.accepted ? 'Accepted' : 'Accept'}
        </button>
      </div>
      {expanded && (
        <div className="text-xs">
          <ReactDiffViewer
            oldValue={suggestion.oldCode}
            newValue={suggestion.newCode}
            splitView={false}
            useDarkTheme={true}
            compareMethod={DiffMethod.LINES}
            styles={{
              variables: {
                dark: {
                  diffViewerBackground: '#1e293b',
                  addedBackground: '#064e3b33',
                  removedBackground: '#7f1d1d33',
                  addedColor: '#6ee7b7',
                  removedColor: '#fca5a5',
                  wordAddedBackground: '#064e3b66',
                  wordRemovedBackground: '#7f1d1d66'
                }
              }
            }}
          />
        </div>
      )}
    </div>
  )
})

function StepIndicator({ currentStep, message }: { currentStep: number; message: string }) {
  return (
    <div className="bg-surface-secondary border border-[#393939] rounded-none p-3 mb-4">
      <div className="flex items-center gap-4 text-xs">
        {[1, 2, 3].map((step) => (
          <div
            key={step}
            className={`flex items-center gap-1.5 ${
              currentStep === step ? 'text-accent' :
              currentStep > step ? 'text-success' : 'text-[#6f6f6f]'
            }`}
          >
            <span
              className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
                currentStep === step ? 'bg-accent text-[#f4f4f4]' :
                currentStep > step ? 'bg-success/20 text-success' : 'bg-[#393939]'
              }`}
            >
              {currentStep > step ? '\u2713' : step}
            </span>
            {STEP_LABELS[step - 1]}
          </div>
        ))}
      </div>
      {message && (
        <p className="text-xs text-[#c6c6c6] mt-2 flex items-center gap-1.5">
          {currentStep > 0 && currentStep <= 3 && (
            <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
          )}
          {message}
        </p>
      )}
    </div>
  )
}

export default function CodeAgent() {
  const store = useCodeAgentStore()
  const { apiKey, models } = useSettingsStore()
  const { selectedModel, setSelectedModel } = useAnalysisStore()
  const navigate = useNavigate()
  const { status: expStatus } = useExperimentStore()
  const wsRef = useRef<WebSocket | null>(null)
  const [buildOutput, setBuildOutput] = useState('')
  const [confirmDialog, setConfirmDialog] = useState<{
    branchName: string
    files: string[]
  } | null>(null)

  const handleAnalyze = () => {
    if (!apiKey || !expStatus.output_dir || !expStatus.data_name) return
    store.reset()
    store.setStreaming(true)

    // Find context_length for selected model
    const modelInfo = models.find((m) => m.id === selectedModel)
    const contextLength = modelInfo?.context_length ?? 128000

    const ws = createWebSocket('/api/agent/ws/stream')
    wsRef.current = ws

    ws.onopen = () => {
      ws.send(JSON.stringify({
        output_dir: expStatus.output_dir,
        data_name: expStatus.data_name,
        model: selectedModel,
        api_key: apiKey,
        context_length: contextLength,
      }))
    }

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data)
        switch (msg.type) {
          case 'status':
            store.setCurrentStep(msg.step, msg.message)
            break
          case 'thinking':
            store.appendThinking(msg.chunk)
            break
          case 'analysis':
            store.appendAnalysis(msg.chunk)
            break
          case 'summary':
            store.setSummary(msg.text, msg.found_files, msg.missing_files, msg.output_dir, msg.data_name)
            break
          case 'files_read':
            store.setFilesRead(msg.files)
            break
          case 'suggestion':
            store.addSuggestion({
              id: msg.id,
              file: msg.file,
              diff: msg.diff,
              oldCode: msg.old_code,
              newCode: msg.new_code,
              description: msg.description,
              accepted: false,
            })
            break
          case 'error':
            store.appendAnalysis(`\n\n**Error:** ${msg.message}\n`)
            store.setStreaming(false)
            break
          case 'done':
            store.setCurrentStep(0, '')
            store.setStreaming(false)
            break
        }
      } catch {
        store.appendAnalysis(event.data)
      }
    }

    ws.onclose = () => store.setStreaming(false)
    ws.onerror = () => store.setStreaming(false)
  }

  const handleStop = () => {
    wsRef.current?.close()
    store.setStreaming(false)
  }

  const handleConfirmAndTest = async () => {
    const accepted = store.suggestions.filter((s) => s.accepted)
    if (accepted.length === 0) return

    // Fetch the branch name preview and show confirmation dialog
    try {
      const preview = await api<{ branch_name: string }>('/api/agent/preview-branch')
      setConfirmDialog({
        branchName: preview.branch_name,
        files: accepted.map((s) => s.file),
      })
    } catch (err) {
      setBuildOutput(`Failed to preview branch: ${err}`)
    }
  }

  const handleConfirmApply = async () => {
    setConfirmDialog(null)
    const accepted = store.suggestions.filter((s) => s.accepted)

    try {
      const result = await api<{ success: boolean; branch: string }>('/api/agent/apply-patches', {
        method: 'POST',
        body: JSON.stringify({
          patches: accepted.map((s) => ({ file: s.file, diff: s.diff }))
        })
      })
      store.setBranchName(result.branch)
      store.setPatchesApplied(true)
    } catch (err) {
      setBuildOutput(`Failed to apply patches: ${err}`)
      return
    }

    store.setBuildStatus({ running: true, success: null, output: '' })
    setBuildOutput('')

    const ws = createWebSocket('/api/agent/ws/build')
    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data)
        if (msg.output) {
          setBuildOutput((prev) => prev + msg.output)
          store.setBuildStatus({ output: msg.output })
        }
        if (msg.type === 'done') {
          store.setBuildStatus({ running: false, success: msg.success })
        }
      } catch {
        setBuildOutput((prev) => prev + event.data)
      }
    }
    ws.onclose = () => store.setBuildStatus({ running: false })
  }

  const handleAskLLMFix = () => {
    const modelInfo = models.find((m) => m.id === selectedModel)
    const contextLength = modelInfo?.context_length ?? 128000

    store.setStreaming(true)
    const ws = createWebSocket('/api/agent/ws/stream')
    wsRef.current = ws
    ws.onopen = () => {
      ws.send(JSON.stringify({
        type: 'fix-build',
        build_output: buildOutput,
        output_dir: expStatus.output_dir,
        data_name: expStatus.data_name,
        model: selectedModel,
        api_key: apiKey,
        context_length: contextLength,
      }))
    }
    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data)
        switch (msg.type) {
          case 'status': store.setCurrentStep(msg.step, msg.message); break
          case 'thinking': store.appendThinking(msg.chunk); break
          case 'analysis': store.appendAnalysis(msg.chunk); break
          case 'files_read': store.setFilesRead(msg.files); break
          case 'suggestion':
            store.addSuggestion({
              id: msg.id, file: msg.file, diff: msg.diff,
              oldCode: msg.old_code, newCode: msg.new_code,
              description: msg.description, accepted: false,
            })
            break
          case 'done':
            store.setCurrentStep(0, '')
            store.setStreaming(false)
            break
        }
      } catch { /* ignore */ }
    }
    ws.onclose = () => store.setStreaming(false)
  }

  const [experimentLogs, setExperimentLogs] = useState('')
  const experimentWsRef = useRef<WebSocket | null>(null)
  const experimentLogRef = useRef<HTMLPreElement>(null)

  const handleRunExperiment = async () => {
    store.setExperimentRunning(true)
    setExperimentLogs('')

    // Stream logs via the shared experiment WebSocket
    const ws = createWebSocket('/api/experiment/ws/output')
    experimentWsRef.current = ws
    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data)
        if (msg.source && msg.text) setExperimentLogs(prev => prev + msg.text)
      } catch {
        setExperimentLogs(prev => prev + event.data)
      }
    }
    const scrollTimer = setInterval(() => {
      if (experimentLogRef.current) experimentLogRef.current.scrollTop = experimentLogRef.current.scrollHeight
    }, 300)

    try {
      const result = await api<{ compare_dir: string }>('/api/agent/run-experiment', {
        method: 'POST',
        body: JSON.stringify({
          output_dir: expStatus.output_dir,
          data_name: expStatus.data_name
        })
      })
      store.setCompareDir(result.compare_dir)
      store.setBaselineDir(expStatus.output_dir)
    } catch (err) {
      setBuildOutput(`Experiment failed: ${err}`)
    } finally {
      store.setExperimentRunning(false)
      clearInterval(scrollTimer)
      try { ws.close() } catch {}
    }
  }

  const handleStopExperiment = async () => {
    try { experimentWsRef.current?.close() } catch {}
    try { await api('/api/experiment/stop', { method: 'POST' }) } catch {}
    store.setExperimentRunning(false)
  }

  const acceptedCount = store.suggestions.filter((s) => s.accepted).length
  const canAnalyze = apiKey && expStatus.output_dir && !store.streaming

  if (!apiKey) {
    return (
      <div className="h-full flex flex-col">
        <div className="mb-4">
          <h2 className="text-2xl font-bold text-[#f4f4f4]">AI Code Agent</h2>
          <p className="text-sm text-[#c6c6c6] mt-1">AI-powered code suggestions with automated testing</p>
        </div>
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center max-w-md">
            <KeyRound size={48} className="mx-auto mb-4 text-[#6f6f6f] opacity-60" />
            <h3 className="text-lg font-semibold text-[#f4f4f4] mb-2">API Key Required</h3>
            <p className="text-sm text-[#c6c6c6] mb-5">
              Set up your OpenRouter API key in Settings to use the Code Agent.
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

  return (
    <div className="h-full flex flex-col">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-[#f4f4f4]">AI Code Agent</h2>
          <p className="text-sm text-[#c6c6c6] mt-1">AI-powered code suggestions with automated testing</p>
        </div>
        {store.branchName && (
          <span className="text-xs bg-accent/20 text-accent px-3 py-1.5 rounded-pill font-mono">
            {store.branchName}
          </span>
        )}
      </div>

      {/* Controls */}
      <div className="bg-surface-secondary border border-[#393939] rounded-none p-4 mb-4">
        <div className="flex items-center gap-3 flex-wrap">
          {models.length > 0 && (
            <ModelSelector value={selectedModel} onChange={setSelectedModel} models={models} />
          )}

          {!store.streaming ? (
            <button
              onClick={handleAnalyze}
              disabled={!canAnalyze}
              className="px-5 py-2 bg-accent hover:bg-accent-hover disabled:opacity-50 text-[#f4f4f4] rounded-none text-sm font-medium flex items-center gap-2"
            >
              <Bot size={16} /> Analyze & Suggest Changes
            </button>
          ) : (
            <button
              onClick={handleStop}
              className="px-5 py-2 bg-danger hover:bg-red-600 text-[#f4f4f4] rounded-none text-sm font-medium flex items-center gap-2"
            >
              <Square size={16} /> Stop
            </button>
          )}

          {store.suggestions.length > 0 && (
            <>
              <button onClick={store.acceptAll} className="px-3 py-2 bg-surface-tertiary hover:bg-[#525252] text-[#f4f4f4] rounded-none text-xs font-medium flex items-center gap-1.5">
                <CheckCheck size={14} /> Accept All
              </button>
              <button onClick={store.rejectAll} className="px-3 py-2 bg-surface-tertiary hover:bg-[#525252] text-[#f4f4f4] rounded-none text-xs font-medium flex items-center gap-1.5">
                <XCircle size={14} /> Reject All
              </button>
              <button
                onClick={handleConfirmAndTest}
                disabled={acceptedCount === 0 || store.buildStatus.running}
                className="px-5 py-2 bg-success hover:bg-green-600 disabled:opacity-50 text-[#f4f4f4] rounded-none text-sm font-medium flex items-center gap-2"
              >
                <Hammer size={16} /> Confirm & Test ({acceptedCount})
              </button>
            </>
          )}

          {store.buildStatus.success === false && (
            <button
              onClick={handleAskLLMFix}
              className="px-4 py-2 bg-warning hover:bg-amber-600 text-[#f4f4f4] rounded-none text-sm font-medium flex items-center gap-2"
            >
              <RefreshCw size={14} /> Ask LLM to Fix
            </button>
          )}

          {store.buildStatus.success === true && !store.experimentRunning && (
            <button
              onClick={handleRunExperiment}
              className="px-5 py-2 bg-accent hover:bg-accent-hover text-[#f4f4f4] rounded-none text-sm font-medium flex items-center gap-2"
            >
              <Play size={16} /> Run Experiment
            </button>
          )}
          {store.experimentRunning && (
            <button
              onClick={handleStopExperiment}
              className="px-5 py-2 bg-danger hover:bg-red-700 text-[#f4f4f4] rounded-none text-sm font-medium flex items-center gap-2"
            >
              <Square size={16} /> Stop Experiment
            </button>
          )}
        </div>
      </div>

      {/* Experiment log panel — streams ffmpeg/decode/WebRTC output */}
      {(store.experimentRunning || experimentLogs) && (
        <div className="bg-surface-secondary border border-[#393939] mb-4">
          <div className="px-4 py-2 border-b border-[#393939] flex items-center justify-between">
            <div className="flex items-center gap-2">
              {store.experimentRunning && <span className="w-2 h-2 rounded-full bg-accent animate-pulse" />}
              <span className="text-xs font-medium text-[#c6c6c6]">
                {store.experimentRunning ? 'Experiment Running...' : 'Experiment Complete'}
              </span>
            </div>
            {!store.experimentRunning && experimentLogs && (
              <button onClick={() => setExperimentLogs('')} className="text-[9px] text-[#6f6f6f] hover:text-[#c6c6c6]">Clear</button>
            )}
          </div>
          <pre ref={experimentLogRef} className="overflow-auto p-3 text-[10px] font-mono text-[#c6c6c6] leading-relaxed whitespace-pre-wrap" style={{ maxHeight: '200px' }}>
            {experimentLogs || 'Starting experiment...'}
          </pre>
        </div>
      )}

      {/* Content */}
      <div className="flex-1 min-h-0 flex gap-4 overflow-hidden">
        {/* Analysis + Suggestions */}
        <div className="flex-1 overflow-auto space-y-4">
          {/* Step progress indicator */}
          {store.streaming && store.currentStep > 0 && (
            <StepIndicator currentStep={store.currentStep} message={store.stepMessage} />
          )}

          {/* Summary Statistics (collapsible) */}
          {store.summaryText && (
            <details className="bg-surface-secondary border border-[#393939] rounded-none">
              <summary className="px-4 py-2.5 cursor-pointer text-xs text-[#c6c6c6] hover:text-[#c6c6c6] flex items-center gap-2">
                <FileCode size={14} />
                Summary Statistics
                <span className="ml-auto flex gap-2">
                  {store.summaryFoundFiles.length > 0 && (
                    <span className="text-success">{store.summaryFoundFiles.length} found</span>
                  )}
                  {store.summaryMissingFiles.length > 0 && (
                    <span className="text-warning">{store.summaryMissingFiles.length} missing</span>
                  )}
                </span>
              </summary>
              <div className="px-4 pb-3 space-y-2">
                <div className="text-[10px] font-mono text-[#6f6f6f]">
                  <span className="text-[#c6c6c6]">dir:</span> {store.summaryOutputDir}
                  <span className="text-[#c6c6c6] ml-3">data:</span> {store.summaryDataName}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {store.summaryFoundFiles.map((f) => (
                    <span key={f} className="text-[10px] font-mono bg-success/10 text-success px-2 py-0.5 rounded">{f}</span>
                  ))}
                  {store.summaryMissingFiles.map((f) => (
                    <span key={f} className="text-[10px] font-mono bg-warning/10 text-warning px-2 py-0.5 rounded">{f}</span>
                  ))}
                </div>
                <pre className="text-xs font-mono text-[#c6c6c6] whitespace-pre-wrap leading-relaxed max-h-64 overflow-auto">
                  {store.summaryText}
                </pre>
              </div>
            </details>
          )}

          {/* Thinking / Reasoning (collapsible) */}
          {store.thinkingContent && (
            <details
              open={store.thinkingVisible}
              onToggle={(e) => store.setThinkingVisible((e.target as HTMLDetailsElement).open)}
              className="bg-surface-secondary border border-amber-900/30 rounded-none"
            >
              <summary className="px-4 py-2.5 cursor-pointer text-xs text-amber-400/70 hover:text-amber-300 flex items-center gap-2">
                <Brain size={14} />
                Model Reasoning ({Math.round(store.thinkingContent.length / 3.5)} tokens)
              </summary>
              <div className="px-4 pb-3 text-xs text-[#6f6f6f] font-mono whitespace-pre-wrap max-h-64 overflow-auto leading-relaxed">
                {store.thinkingContent}
                {store.streaming && (
                  <span className="inline-block w-1.5 h-3 bg-amber-500/60 animate-pulse ml-0.5" />
                )}
              </div>
            </details>
          )}

          {/* Files analyzed chips */}
          {store.filesRead.length > 0 && (
            <div className="bg-surface-secondary border border-[#393939] rounded-none p-3">
              <h4 className="text-xs font-medium text-[#c6c6c6] mb-2 flex items-center gap-1.5">
                <FileCode size={12} /> Files Analyzed ({store.filesRead.length})
              </h4>
              <div className="flex flex-wrap gap-1.5">
                {store.filesRead.map((f) => (
                  <span
                    key={f}
                    className="text-[10px] font-mono bg-[#393939]/50 px-2 py-0.5 rounded text-[#c6c6c6]"
                  >
                    {f}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Analysis markdown */}
          {store.analysisMarkdown && (
            <div className="bg-surface-secondary border border-[#393939] rounded-none p-4">
              <MarkdownRenderer content={
                store.analysisMarkdown
                  .replace(/<files_needed>[\s\S]*?<\/files_needed>/g, '')
                  .replace(/<files_needed>[\s\S]*$/g, '')
                  .replace(/<code_change[\s\S]*?<\/code_change>/g, '')
                  .replace(/<code_change[\s\S]*$/g, '')
                  .trim()
              } />
              {store.streaming && (
                <span className="inline-block w-2 h-4 bg-accent animate-pulse ml-0.5" />
              )}
            </div>
          )}

          {/* Code suggestions — diff viewer is collapsible to prevent UI freeze */}
          {store.suggestions.map((suggestion) => (
            <SuggestionCard key={suggestion.id} suggestion={suggestion} store={store} streaming={store.streaming} />
          ))}

          {/* Empty state */}
          {!store.analysisMarkdown && store.suggestions.length === 0 && !store.streaming && (
            <div className="flex items-center justify-center h-full text-[#6f6f6f]">
              <div className="text-center">
                <Bot size={48} className="mx-auto mb-3 opacity-40" />
                <p className="text-sm">Click "Analyze & Suggest Changes" to start</p>
                <p className="text-xs mt-1">The AI will analyze your experiment, understand the codebase, and suggest improvements</p>
              </div>
            </div>
          )}
        </div>

        {/* Build output (shown when building or built) */}
        {(buildOutput || store.buildStatus.running) && (
          <div className="w-96 bg-surface-secondary border border-[#393939] rounded-none overflow-hidden flex flex-col">
            <div className="px-4 py-3 border-b border-[#393939] flex items-center justify-between">
              <h3 className="text-sm font-medium text-[#c6c6c6]">Build Output</h3>
              {store.buildStatus.running && (
                <span className="text-xs text-accent animate-pulse">Building...</span>
              )}
              {store.buildStatus.success === true && (
                <span className="text-xs text-success">Build Succeeded</span>
              )}
              {store.buildStatus.success === false && (
                <span className="text-xs text-danger">Build Failed</span>
              )}
            </div>
            <pre className="flex-1 overflow-auto p-3 text-xs font-mono text-[#c6c6c6] leading-relaxed">
              {buildOutput || 'Waiting for build output...'}
            </pre>
          </div>
        )}
      </div>

      {/* Confirmation dialog */}
      {confirmDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-surface-secondary border border-[#393939] rounded-none shadow-2xl w-full max-w-md mx-4">
            <div className="px-5 py-4 border-b border-[#393939]">
              <h3 className="text-base font-semibold text-[#f4f4f4]">Create Branch & Apply Patches</h3>
            </div>
            <div className="px-5 py-4 space-y-3">
              <div>
                <p className="text-xs text-[#c6c6c6] mb-1">Branch name</p>
                <p className="text-sm font-mono text-accent bg-surface rounded-none px-3 py-2 border border-[#393939]">
                  {confirmDialog.branchName}
                </p>
              </div>
              <div>
                <p className="text-xs text-[#c6c6c6] mb-1">Files to patch ({confirmDialog.files.length})</p>
                <div className="space-y-1 max-h-32 overflow-auto">
                  {confirmDialog.files.map((f) => (
                    <p key={f} className="text-xs font-mono text-[#c6c6c6] bg-surface rounded px-2 py-1 border border-[#393939]">
                      {f}
                    </p>
                  ))}
                </div>
              </div>
            </div>
            <div className="px-5 py-3 border-t border-[#393939] flex justify-end gap-2">
              <button
                onClick={() => setConfirmDialog(null)}
                className="px-4 py-2 bg-surface-tertiary hover:bg-[#525252] text-[#f4f4f4] rounded-none text-sm font-medium"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmApply}
                className="px-4 py-2 bg-accent hover:bg-accent-hover text-[#f4f4f4] rounded-none text-sm font-medium"
              >
                Create Branch & Apply
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
