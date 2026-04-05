import React, { useState, useEffect } from 'react'
import { Save, Trash2, Eye, EyeOff, RefreshCw, Sun, Moon, FolderOpen } from 'lucide-react'
import { useSettingsStore } from '../../store/settingsStore'
import Toggle from '../shared/Toggle'

export default function Settings() {
  const {
    apiKey,
    theme,
    repoPath,
    debugMode,
    models,
    balance,
    loading,
    setApiKey,
    clearApiKey,
    setTheme,
    setRepoPath,
    setDebugMode,
    fetchModels,
    fetchBalance,
    loadSaved
  } = useSettingsStore()

  const [keyInput, setKeyInput] = useState('')
  const [showKey, setShowKey] = useState(false)
  const [repoInput, setRepoInput] = useState('')

  useEffect(() => {
    loadSaved()
  }, [])

  useEffect(() => {
    setKeyInput(apiKey)
  }, [apiKey])

  useEffect(() => {
    setRepoInput(repoPath)
  }, [repoPath])

  const handleSave = () => {
    setApiKey(keyInput)
  }

  const handleClear = () => {
    setKeyInput('')
    clearApiKey()
  }

  const maskedKey = keyInput
    ? keyInput.slice(0, 8) + '...' + keyInput.slice(-4)
    : ''

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-white">Settings</h2>
        <p className="text-sm text-slate-400 mt-1">
          Configure API keys, appearance, and model preferences
        </p>
      </div>

      <div className="space-y-6 max-w-2xl">
        {/* API Key */}
        <div className="bg-surface-secondary border border-slate-700 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-white mb-4">OpenRouter API Key</h3>
          <div className="space-y-3">
            <div className="flex gap-2">
              <div className="relative flex-1">
                <input
                  type={showKey ? 'text' : 'password'}
                  value={keyInput}
                  onChange={(e) => setKeyInput(e.target.value)}
                  placeholder="sk-or-v1-..."
                  className="w-full bg-surface border border-slate-600 rounded-lg px-3 py-2.5 text-sm text-slate-200 placeholder-slate-500 pr-10"
                />
                <button
                  onClick={() => setShowKey(!showKey)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-200"
                >
                  {showKey ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              <button
                onClick={handleSave}
                disabled={!keyInput}
                className="px-4 py-2 bg-accent hover:bg-accent-hover disabled:opacity-50 text-white rounded-lg text-sm font-medium flex items-center gap-2"
              >
                <Save size={14} /> Save
              </button>
              <button
                onClick={handleClear}
                className="px-4 py-2 bg-surface-tertiary hover:bg-slate-600 text-slate-200 rounded-lg text-sm font-medium flex items-center gap-2"
              >
                <Trash2 size={14} /> Clear
              </button>
            </div>
            {apiKey && (
              <p className="text-xs text-slate-500">
                Saved: {maskedKey}
              </p>
            )}
          </div>
        </div>

        {/* Balance */}
        <div className="bg-surface-secondary border border-slate-700 rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-white">Account Balance</h3>
            <button
              onClick={fetchBalance}
              disabled={!apiKey}
              className="px-3 py-1.5 bg-surface-tertiary hover:bg-slate-600 disabled:opacity-50 text-slate-200 rounded-lg text-xs font-medium flex items-center gap-1.5"
            >
              <RefreshCw size={12} /> Refresh
            </button>
          </div>
          {balance ? (
            <div className="grid grid-cols-3 gap-4">
              <div>
                <p className="text-xs text-slate-500">Remaining</p>
                <p className="text-lg font-bold text-success">
                  ${balance.credits_remaining.toFixed(4)}
                </p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Used</p>
                <p className="text-lg font-bold text-slate-300">
                  ${balance.credits_used.toFixed(4)}
                </p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Rate Limit</p>
                <p className="text-lg font-bold text-slate-300">
                  {balance.rate_limit}
                </p>
              </div>
            </div>
          ) : (
            <p className="text-sm text-slate-500">
              {apiKey ? 'Click "Refresh" to check balance' : 'Set API key first'}
            </p>
          )}
        </div>

        {/* Models */}
        <div className="bg-surface-secondary border border-slate-700 rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-white">Available Models</h3>
            <button
              onClick={fetchModels}
              disabled={!apiKey || loading}
              className="px-3 py-1.5 bg-surface-tertiary hover:bg-slate-600 disabled:opacity-50 text-slate-200 rounded-lg text-xs font-medium flex items-center gap-1.5"
            >
              <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
              {loading ? 'Fetching...' : 'Fetch Models'}
            </button>
          </div>
          {models.length > 0 ? (
            <div className="max-h-64 overflow-auto space-y-1">
              {models.map((m) => (
                <div
                  key={m.id}
                  className="flex items-center justify-between px-3 py-2 rounded-lg hover:bg-surface-tertiary/30"
                >
                  <span className="text-sm text-slate-300">{m.name}</span>
                  <span className="text-xs text-slate-500 font-mono">
                    {(m.context_length / 1000).toFixed(0)}k ctx
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-slate-500">
              {apiKey ? 'Click "Fetch Models" to load available models' : 'Set API key first'}
            </p>
          )}
        </div>

        {/* Repository Path */}
        <div className="bg-surface-secondary border border-slate-700 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-white mb-2">Repository Path</h3>
          <p className="text-xs text-slate-500 mb-3">
            Path to the SparkRTC repo root (used by Code Agent for reading source files and applying patches)
          </p>
          <div className="flex gap-2">
            <input
              type="text"
              value={repoInput}
              onChange={(e) => setRepoInput(e.target.value)}
              placeholder="/home/user/sparkrtc"
              className="flex-1 bg-surface border border-slate-600 rounded-lg px-3 py-2.5 text-sm text-slate-200 placeholder-slate-500 font-mono"
            />
            <button
              onClick={async () => {
                const path = await window.electronAPI.openDirectory()
                if (path) {
                  setRepoInput(path)
                  setRepoPath(path)
                }
              }}
              className="px-3 py-2 bg-surface-tertiary hover:bg-slate-600 text-slate-200 rounded-lg text-sm font-medium flex items-center gap-2"
            >
              <FolderOpen size={14} /> Browse
            </button>
            <button
              onClick={() => setRepoPath(repoInput)}
              disabled={!repoInput}
              className="px-4 py-2 bg-accent hover:bg-accent-hover disabled:opacity-50 text-white rounded-lg text-sm font-medium flex items-center gap-2"
            >
              <Save size={14} /> Save
            </button>
          </div>
          {repoPath && (
            <p className="text-xs text-slate-500 mt-2">
              Saved: <span className="font-mono text-slate-400">{repoPath}</span>
            </p>
          )}
        </div>

        {/* Debug Mode */}
        <div className="bg-surface-secondary border border-slate-700 rounded-xl p-5">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-white">Debug Mode</h3>
              <p className="text-xs text-slate-500 mt-1">
                Show ground-truth anomaly labels alongside LLM analysis for accuracy validation.
                Match experiments by naming output_dir with a scenario key
                (e.g., <span className="font-mono text-slate-400">bandwidth_constrained</span>,{' '}
                <span className="font-mono text-slate-400">packet_loss</span>,{' '}
                <span className="font-mono text-slate-400">cpu_limited</span>,{' '}
                <span className="font-mono text-slate-400">bursty_network</span>).
              </p>
            </div>
            <Toggle checked={debugMode} onChange={setDebugMode} />
          </div>
        </div>

        {/* Appearance */}
        <div className="bg-surface-secondary border border-slate-700 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-white mb-4">Appearance</h3>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setTheme('dark')}
              className={`px-4 py-2.5 rounded-lg text-sm font-medium flex items-center gap-2 transition-colors ${
                theme === 'dark'
                  ? 'bg-accent text-white'
                  : 'bg-surface-tertiary text-slate-300 hover:bg-slate-600'
              }`}
            >
              <Moon size={14} /> Dark
            </button>
            <button
              onClick={() => setTheme('light')}
              className={`px-4 py-2.5 rounded-lg text-sm font-medium flex items-center gap-2 transition-colors ${
                theme === 'light'
                  ? 'bg-accent text-white'
                  : 'bg-surface-tertiary text-slate-300 hover:bg-slate-600'
              }`}
            >
              <Sun size={14} /> Light
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
