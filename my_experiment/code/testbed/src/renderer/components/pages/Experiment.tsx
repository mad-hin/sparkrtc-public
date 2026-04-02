import React, { useState, useEffect, useRef } from 'react'
import { Play, Square, FolderOpen, RefreshCw, FileText } from 'lucide-react'
import { useExperimentStore } from '../../store/experimentStore'
import { createWebSocket } from '../../api/client'

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

  const [filePath, setFilePath] = useState('')
  const [width, setWidth] = useState(1920)
  const [height, setHeight] = useState(1080)
  const [fps, setFps] = useState(24)
  const [outputDir, setOutputDir] = useState('default_run/output_1')
  const [activeTab, setActiveTab] = useState<'server' | 'sender' | 'receiver'>('server')
  const logRef = useRef<HTMLPreElement>(null)
  const wsRef = useRef<WebSocket | null>(null)

  const handleSelectFile = async () => {
    const path = await window.electronAPI.openFile({
      filters: [{ name: 'YUV Video', extensions: ['yuv'] }]
    })
    if (path) setFilePath(path)
  }

  const handleSelectOutputDir = async () => {
    const path = await window.electronAPI.openDirectory()
    if (path) setOutputDir(path)
  }

  const handleRun = async () => {
    clearLogs()

    // Connect WebSocket for live output
    const ws = createWebSocket('/api/experiment/ws/output')
    wsRef.current = ws

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data)
        if (msg.source && msg.text) {
          appendLog(msg.source, msg.text)
        }
        if (msg.type === 'done') {
          setStatus({ running: false, output_dir: outputDir, data_name: filePath })
        }
      } catch {
        appendLog('server', event.data)
      }
    }

    ws.onclose = () => {
      setStatus({ running: false, output_dir: outputDir, data_name: filePath })
    }

    try {
      await runExperiment({
        file_path: filePath,
        width,
        height,
        fps,
        output_dir: outputDir
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
      <div className="mb-4">
        <h2 className="text-2xl font-bold text-white">Experiment</h2>
        <p className="text-sm text-slate-400 mt-1">
          Run WebRTC streaming experiments and view real-time output
        </p>
      </div>

      {/* Config */}
      <div className="bg-surface-secondary border border-slate-700 rounded-xl p-4 mb-4">
        <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
          <div className="col-span-2">
            <label className="block text-xs font-medium text-slate-400 mb-1">YUV File</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={filePath}
                readOnly
                placeholder="Select YUV..."
                className="flex-1 bg-surface border border-slate-600 rounded-lg px-2.5 py-1.5 text-xs text-slate-200"
              />
              <button onClick={handleSelectFile} className="p-1.5 bg-surface-tertiary hover:bg-slate-600 rounded-lg">
                <FolderOpen size={14} className="text-slate-300" />
              </button>
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1">Width</label>
            <input type="number" value={width} onChange={(e) => setWidth(Number(e.target.value))}
              className="w-full bg-surface border border-slate-600 rounded-lg px-2.5 py-1.5 text-xs text-slate-200" />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1">Height</label>
            <input type="number" value={height} onChange={(e) => setHeight(Number(e.target.value))}
              className="w-full bg-surface border border-slate-600 rounded-lg px-2.5 py-1.5 text-xs text-slate-200" />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1">FPS</label>
            <input type="number" value={fps} onChange={(e) => setFps(Number(e.target.value))}
              className="w-full bg-surface border border-slate-600 rounded-lg px-2.5 py-1.5 text-xs text-slate-200" />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1">Output Dir</label>
            <div className="flex gap-2">
              <input type="text" value={outputDir} onChange={(e) => setOutputDir(e.target.value)} placeholder="trace/output_1"
                className="flex-1 bg-surface border border-slate-600 rounded-lg px-2.5 py-1.5 text-xs text-slate-200" />
              <button onClick={handleSelectOutputDir} className="p-1.5 bg-surface-tertiary hover:bg-slate-600 rounded-lg">
                <FolderOpen size={14} className="text-slate-300" />
              </button>
            </div>
          </div>
        </div>

        <div className="flex gap-2 mt-3">
          {!status.running ? (
            <button
              onClick={handleRun}
              disabled={!filePath}
              className="px-4 py-2 bg-accent hover:bg-accent-hover disabled:opacity-50 text-white rounded-lg text-sm font-medium flex items-center gap-2"
            >
              <Play size={14} /> Run Experiment
            </button>
          ) : (
            <button
              onClick={handleStop}
              className="px-4 py-2 bg-danger hover:bg-red-600 text-white rounded-lg text-sm font-medium flex items-center gap-2"
            >
              <Square size={14} /> Stop
            </button>
          )}
          <button
            onClick={clearLogs}
            className="px-4 py-2 bg-surface-tertiary hover:bg-slate-600 text-slate-200 rounded-lg text-sm font-medium flex items-center gap-2"
          >
            <RefreshCw size={14} /> Clear Logs
          </button>
        </div>
      </div>

      {/* Terminal output */}
      <div className="flex-1 min-h-0 bg-surface-secondary border border-slate-700 rounded-xl overflow-hidden flex flex-col">
        {/* Tabs */}
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

        {/* Log content */}
        <pre
          ref={logRef}
          className="flex-1 overflow-auto p-4 text-xs font-mono text-slate-300 leading-relaxed whitespace-pre-wrap"
        >
          {logs[activeTab] || 'Waiting for output...'}
        </pre>
      </div>
    </div>
  )
}
