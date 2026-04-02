import React, { useRef, useState } from 'react'
import { Bot, Square, Check, X, CheckCheck, XCircle, Play, Hammer, RefreshCw, KeyRound, Settings } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useCodeAgentStore } from '../../store/codeAgentStore'
import { useSettingsStore } from '../../store/settingsStore'
import { useExperimentStore } from '../../store/experimentStore'
import { useAnalysisStore } from '../../store/analysisStore'
import { createWebSocket, api } from '../../api/client'
import MarkdownRenderer from '../shared/MarkdownRenderer'
import ReactDiffViewer, { DiffMethod } from 'react-diff-viewer-continued'

export default function CodeAgent() {
  const store = useCodeAgentStore()
  const { apiKey } = useSettingsStore()
  const { selectedModel } = useAnalysisStore()
  const navigate = useNavigate()
  const { status: expStatus } = useExperimentStore()
  const wsRef = useRef<WebSocket | null>(null)
  const [buildOutput, setBuildOutput] = useState('')

  const handleAnalyze = () => {
    if (!apiKey || !expStatus.output_dir || !expStatus.data_name) return
    store.reset()
    store.setStreaming(true)

    const ws = createWebSocket('/api/agent/ws/stream')
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
        if (msg.type === 'analysis') {
          store.appendAnalysis(msg.chunk)
        } else if (msg.type === 'suggestion') {
          store.addSuggestion({
            id: msg.id,
            file: msg.file,
            diff: msg.diff,
            oldCode: msg.old_code,
            newCode: msg.new_code,
            description: msg.description,
            accepted: false
          })
        } else if (msg.type === 'done') {
          store.setStreaming(false)
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

    // Apply patches
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

    // Build
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

  const handleAskLLMFix = async () => {
    try {
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
          api_key: apiKey
        }))
      }
      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data)
          if (msg.type === 'analysis') store.appendAnalysis(msg.chunk)
          else if (msg.type === 'suggestion') {
            store.addSuggestion({
              id: msg.id, file: msg.file, diff: msg.diff,
              oldCode: msg.old_code, newCode: msg.new_code,
              description: msg.description, accepted: false
            })
          } else if (msg.type === 'done') store.setStreaming(false)
        } catch { /* ignore */ }
      }
      ws.onclose = () => store.setStreaming(false)
    } catch (err) {
      store.setStreaming(false)
    }
  }

  const handleRunExperiment = async () => {
    store.setExperimentRunning(true)
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
    }
  }

  const acceptedCount = store.suggestions.filter((s) => s.accepted).length
  const canAnalyze = apiKey && expStatus.output_dir && !store.streaming

  if (!apiKey) {
    return (
      <div className="h-full flex flex-col">
        <div className="mb-4">
          <h2 className="text-2xl font-bold text-white">AI Code Agent</h2>
          <p className="text-sm text-slate-400 mt-1">
            AI-powered code suggestions with automated testing
          </p>
        </div>
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center max-w-md">
            <KeyRound size={48} className="mx-auto mb-4 text-slate-500 opacity-60" />
            <h3 className="text-lg font-semibold text-white mb-2">API Key Required</h3>
            <p className="text-sm text-slate-400 mb-5">
              Set up your OpenRouter API key in Settings to use the Code Agent.
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
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white">AI Code Agent</h2>
          <p className="text-sm text-slate-400 mt-1">
            AI-powered code suggestions with automated testing
          </p>
        </div>
        {store.branchName && (
          <span className="text-xs bg-accent/20 text-accent px-3 py-1.5 rounded-full font-mono">
            {store.branchName}
          </span>
        )}
      </div>

      {/* Controls */}
      <div className="bg-surface-secondary border border-slate-700 rounded-xl p-4 mb-4">
        <div className="flex items-center gap-3 flex-wrap">
          {!store.streaming ? (
            <button
              onClick={handleAnalyze}
              disabled={!canAnalyze}
              className="px-5 py-2 bg-accent hover:bg-accent-hover disabled:opacity-50 text-white rounded-lg text-sm font-medium flex items-center gap-2"
            >
              <Bot size={16} /> Analyze & Suggest Changes
            </button>
          ) : (
            <button
              onClick={handleStop}
              className="px-5 py-2 bg-danger hover:bg-red-600 text-white rounded-lg text-sm font-medium flex items-center gap-2"
            >
              <Square size={16} /> Stop
            </button>
          )}

          {store.suggestions.length > 0 && (
            <>
              <button onClick={store.acceptAll} className="px-3 py-2 bg-surface-tertiary hover:bg-slate-600 text-slate-200 rounded-lg text-xs font-medium flex items-center gap-1.5">
                <CheckCheck size={14} /> Accept All
              </button>
              <button onClick={store.rejectAll} className="px-3 py-2 bg-surface-tertiary hover:bg-slate-600 text-slate-200 rounded-lg text-xs font-medium flex items-center gap-1.5">
                <XCircle size={14} /> Reject All
              </button>
              <button
                onClick={handleConfirmAndTest}
                disabled={acceptedCount === 0 || store.buildStatus.running}
                className="px-5 py-2 bg-success hover:bg-green-600 disabled:opacity-50 text-white rounded-lg text-sm font-medium flex items-center gap-2"
              >
                <Hammer size={16} /> Confirm & Test ({acceptedCount})
              </button>
            </>
          )}

          {store.buildStatus.success === false && (
            <>
              <button
                onClick={handleAskLLMFix}
                className="px-4 py-2 bg-warning hover:bg-amber-600 text-white rounded-lg text-sm font-medium flex items-center gap-2"
              >
                <RefreshCw size={14} /> Ask LLM to Fix
              </button>
            </>
          )}

          {store.buildStatus.success === true && !store.experimentRunning && (
            <button
              onClick={handleRunExperiment}
              className="px-5 py-2 bg-accent hover:bg-accent-hover text-white rounded-lg text-sm font-medium flex items-center gap-2"
            >
              <Play size={16} /> Run Experiment
            </button>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 min-h-0 flex gap-4 overflow-hidden">
        {/* Analysis + Suggestions */}
        <div className="flex-1 overflow-auto space-y-4">
          {/* Analysis markdown */}
          {store.analysisMarkdown && (
            <div className="bg-surface-secondary border border-slate-700 rounded-xl p-4">
              <MarkdownRenderer content={store.analysisMarkdown} />
              {store.streaming && (
                <span className="inline-block w-2 h-4 bg-accent animate-pulse ml-0.5" />
              )}
            </div>
          )}

          {/* Code suggestions */}
          {store.suggestions.map((suggestion) => (
            <div
              key={suggestion.id}
              className={`bg-surface-secondary border rounded-xl overflow-hidden ${
                suggestion.accepted ? 'border-success/50' : 'border-slate-700'
              }`}
            >
              <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700 bg-surface-tertiary/30">
                <div>
                  <span className="text-sm font-mono text-slate-200">{suggestion.file}</span>
                  {suggestion.description && (
                    <p className="text-xs text-slate-400 mt-0.5">{suggestion.description}</p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => store.toggleSuggestion(suggestion.id)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors ${
                      suggestion.accepted
                        ? 'bg-success/20 text-success hover:bg-success/30'
                        : 'bg-surface-tertiary text-slate-300 hover:bg-slate-600'
                    }`}
                  >
                    {suggestion.accepted ? <Check size={12} /> : <X size={12} />}
                    {suggestion.accepted ? 'Accepted' : 'Accept'}
                  </button>
                </div>
              </div>
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
            </div>
          ))}

          {!store.analysisMarkdown && store.suggestions.length === 0 && !store.streaming && (
            <div className="flex items-center justify-center h-full text-slate-500">
              <div className="text-center">
                <Bot size={48} className="mx-auto mb-3 opacity-40" />
                <p className="text-sm">Click "Analyze & Suggest Changes" to start</p>
                <p className="text-xs mt-1">The AI will analyze your experiment and suggest code improvements</p>
              </div>
            </div>
          )}
        </div>

        {/* Build output (shown when building or built) */}
        {(buildOutput || store.buildStatus.running) && (
          <div className="w-96 bg-surface-secondary border border-slate-700 rounded-xl overflow-hidden flex flex-col">
            <div className="px-4 py-3 border-b border-slate-700 flex items-center justify-between">
              <h3 className="text-sm font-medium text-slate-300">Build Output</h3>
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
            <pre className="flex-1 overflow-auto p-3 text-xs font-mono text-slate-400 leading-relaxed">
              {buildOutput || 'Waiting for build output...'}
            </pre>
          </div>
        )}
      </div>
    </div>
  )
}
