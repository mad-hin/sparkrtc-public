import React, { useState, useEffect, useRef } from 'react'
import { Play, Square, FolderOpen, RefreshCw, Network, Server, Settings, Film, Plus, X, FlaskConical } from 'lucide-react'
import { useExperimentStore } from '../../store/experimentStore'
import { useSettingsStore } from '../../store/settingsStore'
import { createWebSocket, api } from '../../api/client'
import Toggle from '../shared/Toggle'
import { SCENARIOS, type DebugScenario, generateTrace, generateBurstyTrace, generateLossTrace } from '../../data/debugScenarios'

const inputCls = 'w-full bg-surface border border-slate-600 rounded-lg px-2.5 py-1.5 text-xs text-slate-200'
const labelCls = 'block text-[10px] font-medium text-slate-500 mb-1'
const sectionCls = 'bg-surface-secondary border border-slate-700 rounded-xl p-3 space-y-2'

export default function Experiment() {
  const {
    status,
    logs,
    runExperiment,
    stopExperiment,
    clearLogs,
    appendLog,
    setStatus
  } = useExperimentStore()

  // Video
  const [filePath, setFilePath] = useState('')
  const [width, setWidth] = useState(1920)
  const [height, setHeight] = useState(1080)
  const [fps, setFps] = useState(24)
  // Network — intuitive params
  const [enableMahimahi, setEnableMahimahi] = useState(false)
  const [bandwidth, setBandwidth] = useState(12)
  const [delayMs, setDelayMs] = useState(0)
  const [lossRate, setLossRate] = useState(0)
  const [enableLossTrace, setEnableLossTrace] = useState(false)
  // Legacy trace fields (used internally)
  const [traceFile, setTraceFile] = useState('')
  const [traceFiles, setTraceFiles] = useState<string[]>([])
  // Server
  const [serverIp, setServerIp] = useState('127.0.0.1')
  const [port, setPort] = useState(8888)
  // Advanced
  const [fieldTrials, setFieldTrials] = useState('')
  const [outputDir, setOutputDir] = useState(status.output_dir || 'default_run/output_1')
  const [showAdvancedTrace, setShowAdvancedTrace] = useState(false)

  // Create trace form
  const [showCreateTrace, setShowCreateTrace] = useState(false)
  const [newTraceName, setNewTraceName] = useState('')
  const [newTraceContent, setNewTraceContent] = useState('')
  // Loss trace content (editable when loss trace is enabled)
  const [lossTraceContent, setLossTraceContent] = useState('')

  const [activeTab, setActiveTab] = useState<'server' | 'sender' | 'receiver'>('server')
  const [expandedScenario, setExpandedScenario] = useState<string | null>(null)
  // Editable scenario parameters
  const [scenBw, setScenBw] = useState(12)
  const [scenBwLow, setScenBwLow] = useState(1)
  const [scenBurstMs, setScenBurstMs] = useState(500)
  const [scenStallMs, setScenStallMs] = useState(200)
  const [scenLossRate, setScenLossRate] = useState(5)
  const [scenDuration, setScenDuration] = useState(30)
  const logRef = useRef<HTMLPreElement>(null)
  const wsRef = useRef<WebSocket | null>(null)

  const { debugMode } = useSettingsStore()

  // Fetch available trace files on mount
  useEffect(() => {
    api<string[]>('/api/experiment/trace-files')
      .then((files) => {
        setTraceFiles(files)
        if (files.length > 0 && !traceFile) setTraceFile(files[0])
      })
      .catch(() => {})
  }, [])

  /** Load default editable params when a scenario is expanded */
  const loadScenarioDefaults = (id: string) => {
    switch (id) {
      case 'codec_blockage':  setScenBw(12); setScenBwLow(0.5); setScenBurstMs(500); setScenStallMs(200); setScenLossRate(0); setScenDuration(30); break
      case 'frame_overshoot': setScenBw(4); setScenBwLow(4); setScenBurstMs(0); setScenStallMs(0); setScenLossRate(0); setScenDuration(30); break
      case 'cca_late_response': setScenBw(30); setScenBwLow(5); setScenBurstMs(5000); setScenStallMs(5000); setScenLossRate(0); setScenDuration(30); break
      case 'pacing_queuing': setScenBw(20); setScenBwLow(20); setScenBurstMs(0); setScenStallMs(0); setScenLossRate(0); setScenDuration(30); break
      case 'rtx_overshoot':  setScenBw(8); setScenBwLow(8); setScenBurstMs(0); setScenStallMs(0); setScenLossRate(5); setScenDuration(30); break
      case 'latency_rise':   setScenBw(12); setScenBwLow(1); setScenBurstMs(8000); setScenStallMs(3000); setScenLossRate(0); setScenDuration(30); break
      case 'loss_rise':      setScenBw(12); setScenBwLow(12); setScenBurstMs(0); setScenStallMs(0); setScenLossRate(10); setScenDuration(30); break
    }
  }

  /** Create the trace file for a scenario and set up the experiment config */
  const applyScenario = async (scenario: DebugScenario) => {
    const cfg = scenario.experimentConfig

    // Set basic config
    if (cfg.fps) setFps(cfg.fps)
    if (cfg.width) setWidth(cfg.width)
    if (cfg.height) setHeight(cfg.height)
    if (cfg.field_trials !== undefined) setFieldTrials(cfg.field_trials)

    // Set output dir to include scenario pattern
    setOutputDir(`${scenario.outputDirPattern}/output_1`)

    // Network config
    if (cfg.enable_mahimahi !== undefined) setEnableMahimahi(cfg.enable_mahimahi)
    if (cfg.enable_loss_trace !== undefined) setEnableLossTrace(cfg.enable_loss_trace)

    // Set intuitive params from scenario
    setBandwidth(scenBw)
    setDelayMs(0)
    setLossRate(scenLossRate)

    // Generate trace from editable params
    const traceName = `debug_${scenario.id}`
    let traceContent = ''

    if (scenBurstMs > 0 && scenStallMs > 0 && scenBw !== scenBwLow) {
      // Bursty / step-function trace
      traceContent = generateBurstyTrace(scenBw, scenBwLow, scenBurstMs, scenStallMs, scenDuration)
    } else {
      // Constant bandwidth trace
      traceContent = generateTrace(scenBw, scenDuration)
    }

    // Populate the "Create Trace" form so user can review/edit before saving
    setNewTraceName(traceName)
    setNewTraceContent(traceContent)
    setShowCreateTrace(true)

    // Also create it immediately so it's selectable
    try {
      await api('/api/experiment/create-trace', {
        method: 'POST',
        body: JSON.stringify({ name: traceName, content: traceContent })
      })
      const files = await api<string[]>('/api/experiment/trace-files')
      setTraceFiles(files)
      setTraceFile(traceName)
    } catch (err) {
      appendLog('server', `\nFailed to create trace for scenario: ${err}\n`)
    }

    // Create loss trace if needed (separate file at my_experiment/file/loss_trace)
    if (cfg.enable_loss_trace) {
      const lossContent = generateLossTrace(scenLossRate / 100, scenDuration)
      setLossTraceContent(lossContent)
      try {
        await api('/api/experiment/create-loss-trace', {
          method: 'POST',
          body: JSON.stringify({ content: lossContent })
        })
      } catch (err) {
        appendLog('server', `\nFailed to create loss trace: ${err}\n`)
      }
    } else {
      setLossTraceContent('')
    }

    appendLog('server', `\n[Debug] Applied scenario: ${scenario.name} (${scenario.paper})\n`)
    appendLog('server', `[Debug] Output dir: ${scenario.outputDirPattern}/output_1\n`)
    appendLog('server', `[Debug] Network: ${scenario.networkSetup.summary}\n`)
    scenario.networkSetup.metrics.forEach(m => {
      appendLog('server', `[Debug]   ${m.label}: ${m.value}\n`)
    })
    appendLog('server', `[Debug] Config applied to form — edit any parameter before running.\n`)
  }

  const handleSelectFile = async () => {
    const path = await window.electronAPI.openFile({
      filters: [{ name: 'YUV Video', extensions: ['yuv'] }]
    })
    if (path) setFilePath(path)
  }

  const handleCreateTrace = async () => {
    if (!newTraceName.trim() || !newTraceContent.trim()) return
    try {
      await api('/api/experiment/create-trace', {
        method: 'POST',
        body: JSON.stringify({ name: newTraceName.trim(), content: newTraceContent.trim() })
      })
      // Refresh trace list and select the new one
      const files = await api<string[]>('/api/experiment/trace-files')
      setTraceFiles(files)
      setTraceFile(newTraceName.trim().replace(/ /g, '_'))
      setShowCreateTrace(false)
      setNewTraceName('')
      setNewTraceContent('')
    } catch (err) {
      appendLog('server', `\nFailed to create trace: ${err}\n`)
    }
  }

  const SAMPLE_TRACE = `# Mahimahi bandwidth trace format:
# Each line = millisecond timestamp when one 1500-byte packet can be sent.
# Example: constant 12 Mbps for 10 seconds (1 packet/ms)
# Tip: For N Mbps, use interval = 12/N ms between lines.
#
# Delete these comments and paste your trace, or use a generator:
# Constant 12 Mbps (10s):
1
2
3
4
5
6
7
8
9
10`

  /** Auto-generate trace from bandwidth input before running */
  const ensureTrace = async (): Promise<string> => {
    if (!enableMahimahi) return traceFile

    // If user has a manually selected trace and didn't change bandwidth, use it
    if (traceFile && !traceFile.startsWith('auto_')) return traceFile

    // Generate constant-bandwidth trace from the bandwidth input
    const traceName = `auto_${bandwidth}mbps`
    const content = generateTrace(bandwidth, 60)
    try {
      await api('/api/experiment/create-trace', {
        method: 'POST',
        body: JSON.stringify({ name: traceName, content })
      })
      const files = await api<string[]>('/api/experiment/trace-files')
      setTraceFiles(files)
      setTraceFile(traceName)
    } catch (err) {
      appendLog('server', `\nFailed to create trace: ${err}\n`)
    }

    // Generate loss trace if loss rate > 0
    if (lossRate > 0) {
      setEnableLossTrace(true)
      const lossContent = generateLossTrace(lossRate / 100, 60)
      try {
        await api('/api/experiment/create-loss-trace', {
          method: 'POST',
          body: JSON.stringify({ content: lossContent })
        })
      } catch (err) {
        appendLog('server', `\nFailed to create loss trace: ${err}\n`)
      }
    }

    return traceName
  }

  const handleRun = async () => {
    clearLogs()

    // Auto-generate trace from intuitive params
    const resolvedTrace = enableMahimahi ? await ensureTrace() : traceFile

    const ws = createWebSocket('/api/experiment/ws/output')
    wsRef.current = ws

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data)
        if (msg.source && msg.text) {
          appendLog(msg.source, msg.text)
        }
        if (msg.type === 'done') {
          setStatus({
            running: false,
            output_dir: msg.output_dir ?? outputDir,
            data_name: msg.data_name ?? filePath.replace(/^.*[\\/]/, '').replace(/\.yuv$/, ''),
          })
        }
      } catch {
        appendLog('server', event.data)
      }
    }

    ws.onclose = () => {
      const cur = useExperimentStore.getState().status
      if (cur.running) {
        setStatus({ ...cur, running: false })
      }
    }

    try {
      await runExperiment({
        file_path: filePath,
        width,
        height,
        fps,
        output_dir: outputDir,
        enable_mahimahi: enableMahimahi,
        trace_file: resolvedTrace,
        enable_loss_trace: enableLossTrace || lossRate > 0,
        delay_ms: delayMs,
        server_ip: serverIp,
        port,
        field_trials: fieldTrials,
      })
    } catch (err) {
      appendLog('server', `\nError: ${err}\n`)
    }
  }

  const handleStop = async () => {
    wsRef.current?.close()
    await stopExperiment()
  }

  // Auto-scroll log
  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight
    }
  }, [logs, activeTab])

  const tabs = ['server', 'sender', 'receiver'] as const

  return (
    <div className="h-full flex flex-col">
      <div className="mb-3">
        <h2 className="text-2xl font-bold text-white">Experiment</h2>
        <p className="text-sm text-slate-400 mt-1">Configure and run WebRTC streaming experiments</p>
      </div>

      {/* Debug Mode: Controlled Experiment Scenarios */}
      {debugMode && (
        <div className="bg-surface-secondary border border-slate-700 rounded-xl p-3 mb-3">
          <h3 className="text-xs font-semibold text-slate-300 flex items-center gap-1.5 mb-2">
            <FlaskConical size={12} /> Controlled Experiment Scenarios (Profix Paper Dataset)
          </h3>
          <div className="grid grid-cols-2 lg:grid-cols-4 xl:grid-cols-7 gap-1.5">
            {SCENARIOS.map(s => (
              <div key={s.id} className="relative">
                <button
                  onClick={() => { const next = expandedScenario === s.id ? null : s.id; setExpandedScenario(next); if (next) loadScenarioDefaults(s.id) }}
                  className={`w-full text-left px-2 py-1.5 rounded-lg text-[10px] border transition-colors ${
                    expandedScenario === s.id
                      ? 'bg-accent/20 border-accent/50 text-white'
                      : 'bg-surface border-slate-600 text-slate-300 hover:bg-surface-tertiary'
                  }`}
                >
                  <span className="font-medium block truncate">{s.name}</span>
                  <span className="text-[9px] text-slate-500 block truncate">{s.paper}</span>
                </button>
              </div>
            ))}
          </div>

          {/* Expanded scenario detail */}
          {expandedScenario && (() => {
            const s = SCENARIOS.find(sc => sc.id === expandedScenario)
            if (!s) return null
            return (
              <div className="mt-2 border border-slate-600 rounded-lg p-3 bg-surface">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <h4 className="text-xs font-semibold text-white">{s.name} — {s.paper}</h4>
                    <p className="text-[10px] text-slate-400 mt-1">{s.description}</p>
                  </div>
                  <button
                    onClick={() => applyScenario(s)}
                    disabled={status.running || !filePath}
                    className="shrink-0 px-3 py-1.5 bg-accent hover:bg-accent-hover disabled:opacity-50 text-white rounded-lg text-[10px] font-medium flex items-center gap-1"
                  >
                    <Play size={10} /> Apply Config
                  </button>
                </div>

                {/* Editable Network Parameters */}
                <div className="mt-2 grid grid-cols-3 lg:grid-cols-6 gap-2">
                  <div>
                    <label className={labelCls}>BW High (Mbps)</label>
                    <input type="number" value={scenBw} onChange={e => setScenBw(Number(e.target.value))} className={inputCls} step="0.5" min="0.1" />
                  </div>
                  <div>
                    <label className={labelCls}>BW Low (Mbps)</label>
                    <input type="number" value={scenBwLow} onChange={e => setScenBwLow(Number(e.target.value))} className={inputCls} step="0.5" min="0.1" />
                  </div>
                  <div>
                    <label className={labelCls}>Burst (ms)</label>
                    <input type="number" value={scenBurstMs} onChange={e => setScenBurstMs(Number(e.target.value))} className={inputCls} step="100" min="0" />
                  </div>
                  <div>
                    <label className={labelCls}>Stall (ms)</label>
                    <input type="number" value={scenStallMs} onChange={e => setScenStallMs(Number(e.target.value))} className={inputCls} step="100" min="0" />
                  </div>
                  <div>
                    <label className={labelCls}>Loss Rate (%)</label>
                    <input type="number" value={scenLossRate} onChange={e => setScenLossRate(Number(e.target.value))} className={inputCls} step="1" min="0" max="100" />
                  </div>
                  <div>
                    <label className={labelCls}>Duration (s)</label>
                    <input type="number" value={scenDuration} onChange={e => setScenDuration(Number(e.target.value))} className={inputCls} step="5" min="5" />
                  </div>
                </div>
                {/* Paper reference values */}
                <p className="text-[9px] text-slate-500 mt-1.5 italic">{s.networkSetup.summary}</p>

                {/* Expected Anomalies */}
                <div className="mt-2">
                  <span className="text-[9px] text-slate-500 font-medium">Expected Anomalies:</span>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {s.expectedAnomalies.map((a, i) => (
                      <span
                        key={i}
                        className={`text-[9px] px-1.5 py-0.5 rounded border ${
                          a.layer === 'application' ? 'bg-purple-500/15 text-purple-300 border-purple-500/30' :
                          a.layer === 'network' ? 'bg-blue-500/15 text-blue-300 border-blue-500/30' :
                          'bg-amber-500/15 text-amber-300 border-amber-500/30'
                        } ${a.severity === 'secondary' ? 'opacity-60' : ''}`}
                      >
                        {a.label}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            )
          })()}
        </div>
      )}

      <div className="flex-1 min-h-0 flex gap-4">
        {/* Left: Config Panel */}
        <div className="w-1/3 min-w-[300px] max-w-[400px] overflow-y-auto space-y-3 pr-1">

          {/* Video */}
          <section className={sectionCls}>
            <h3 className="text-xs font-semibold text-slate-300 flex items-center gap-1.5"><Film size={12} /> Video</h3>
            <div>
              <label className={labelCls}>YUV File</label>
              <div className="flex gap-1.5">
                <input type="text" value={filePath} readOnly placeholder="Select YUV..."
                  className={`flex-1 ${inputCls}`} />
                <button onClick={handleSelectFile} className="p-1.5 bg-surface-tertiary hover:bg-slate-600 rounded-lg">
                  <FolderOpen size={12} className="text-slate-300" />
                </button>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className={labelCls}>Width</label>
                <input type="number" value={width} onChange={(e) => setWidth(Number(e.target.value))} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Height</label>
                <input type="number" value={height} onChange={(e) => setHeight(Number(e.target.value))} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>FPS</label>
                <input type="number" value={fps} onChange={(e) => setFps(Number(e.target.value))} className={inputCls} />
              </div>
            </div>
          </section>

          {/* Network */}
          <section className={sectionCls}>
            <h3 className="text-xs font-semibold text-slate-300 flex items-center gap-1.5"><Network size={12} /> Network Emulation</h3>
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-slate-400">Enable Network Emulation</span>
              <Toggle checked={enableMahimahi} onChange={setEnableMahimahi} />
            </div>
            {enableMahimahi && (
              <>
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className={labelCls}>Bandwidth (Mbps)</label>
                    <input type="number" value={bandwidth} onChange={e => setBandwidth(Number(e.target.value))}
                      className={inputCls} step="0.5" min="0.1" />
                  </div>
                  <div>
                    <label className={labelCls}>Latency (ms)</label>
                    <input type="number" value={delayMs} onChange={e => setDelayMs(Number(e.target.value))}
                      className={inputCls} step="5" min="0" />
                  </div>
                  <div>
                    <label className={labelCls}>Loss Rate (%)</label>
                    <input type="number" value={lossRate} onChange={e => setLossRate(Number(e.target.value))}
                      className={inputCls} step="1" min="0" max="100" />
                  </div>
                </div>
                <p className="text-[9px] text-slate-500">
                  A constant-bandwidth trace is auto-generated on run. Set latency for base one-way delay (mm-delay).
                </p>

                {/* Advanced: custom trace file */}
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-slate-400">Use Custom Trace File</span>
                  <button
                    onClick={() => setShowAdvancedTrace(!showAdvancedTrace)}
                    className="text-[9px] text-accent hover:underline"
                  >
                    {showAdvancedTrace ? 'Hide' : 'Advanced'}
                  </button>
                </div>
                {showAdvancedTrace && (
                  <div className="border border-slate-600 rounded-lg p-2 space-y-1.5 bg-surface">
                    <div>
                      <label className={labelCls}>Trace File (overrides bandwidth)</label>
                      <select
                        value={traceFile}
                        onChange={(e) => setTraceFile(e.target.value)}
                        className={`flex-1 ${inputCls}`}
                      >
                        <option value="">Auto-generate from bandwidth</option>
                        {traceFiles.map((f) => <option key={f} value={f}>{f}</option>)}
                      </select>
                    </div>
                    <div className="flex gap-1.5">
                      <input
                        type="text"
                        value={newTraceName}
                        onChange={(e) => setNewTraceName(e.target.value)}
                        placeholder="New trace name"
                        className={`flex-1 ${inputCls}`}
                      />
                      <button
                        onClick={() => { setShowCreateTrace(!showCreateTrace); if (!newTraceContent) setNewTraceContent(SAMPLE_TRACE) }}
                        className="p-1.5 bg-surface-tertiary hover:bg-slate-600 rounded-lg"
                        title="Edit raw trace"
                      >
                        {showCreateTrace ? <X size={12} className="text-slate-300" /> : <Plus size={12} className="text-slate-300" />}
                      </button>
                    </div>
                    {showCreateTrace && (
                      <>
                        <textarea
                          value={newTraceContent}
                          onChange={(e) => setNewTraceContent(e.target.value)}
                          rows={4}
                          className={`${inputCls} font-mono resize-none text-[10px] leading-tight`}
                        />
                        <button
                          onClick={handleCreateTrace}
                          disabled={!newTraceName.trim() || !newTraceContent.trim()}
                          className="w-full px-2 py-1 bg-accent hover:bg-accent-hover disabled:opacity-50 text-white rounded text-[10px] font-medium"
                        >
                          Save Trace File
                        </button>
                      </>
                    )}
                  </div>
                )}
              </>
            )}
          </section>

          {/* Server */}
          <section className={sectionCls}>
            <h3 className="text-xs font-semibold text-slate-300 flex items-center gap-1.5"><Server size={12} /> Server</h3>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className={labelCls}>IP Address</label>
                <input type="text" value={serverIp} onChange={(e) => setServerIp(e.target.value)} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Port</label>
                <input type="number" value={port} onChange={(e) => setPort(Number(e.target.value))} className={inputCls} />
              </div>
            </div>
          </section>

          {/* Advanced */}
          <section className={sectionCls}>
            <h3 className="text-xs font-semibold text-slate-300 flex items-center gap-1.5"><Settings size={12} /> Advanced</h3>
            <div>
              <label className={labelCls}>Output Directory</label>
              <input type="text" value={outputDir} onChange={(e) => setOutputDir(e.target.value)}
                placeholder="trace/output_1" className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>WebRTC Field Trials</label>
              <textarea
                value={fieldTrials}
                onChange={(e) => setFieldTrials(e.target.value)}
                rows={2}
                placeholder="Feature/Value/Feature2/Value2/"
                className={`${inputCls} font-mono resize-none`}
              />
            </div>
          </section>

          {/* Actions */}
          <div className="flex gap-2 pt-1 pb-2">
            {!status.running ? (
              <button
                onClick={handleRun}
                disabled={!filePath}
                className="flex-1 px-4 py-2 bg-accent hover:bg-accent-hover disabled:opacity-50 text-white rounded-lg text-sm font-medium flex items-center justify-center gap-2"
              >
                <Play size={14} /> Run Experiment
              </button>
            ) : (
              <button
                onClick={handleStop}
                className="flex-1 px-4 py-2 bg-danger hover:bg-red-600 text-white rounded-lg text-sm font-medium flex items-center justify-center gap-2"
              >
                <Square size={14} /> Stop
              </button>
            )}
            <button
              onClick={clearLogs}
              className="px-4 py-2 bg-surface-tertiary hover:bg-slate-600 text-slate-200 rounded-lg text-sm font-medium flex items-center gap-2"
            >
              <RefreshCw size={14} />
            </button>
          </div>
        </div>

        {/* Right: Log Terminal */}
        <div className="flex-1 min-h-0 bg-surface-secondary border border-slate-700 rounded-xl overflow-hidden flex flex-col">
          <div className="flex border-b border-slate-700">
            {tabs.map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-4 py-2.5 text-sm font-medium capitalize transition-colors ${
                  activeTab === tab
                    ? 'text-accent border-b-2 border-accent bg-surface/50'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {tab}
              </button>
            ))}
          </div>
          <pre
            ref={logRef}
            className="flex-1 overflow-auto p-4 text-xs font-mono text-slate-300 leading-relaxed whitespace-pre-wrap"
          >
            {logs[activeTab] || 'Waiting for output...'}
          </pre>
        </div>
      </div>
    </div>
  )
}
