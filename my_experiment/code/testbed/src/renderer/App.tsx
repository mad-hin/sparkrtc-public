import React, { useEffect, useState } from 'react'
import { Routes, Route } from 'react-router-dom'
import { initClient } from './api/client'
import { useSettingsStore } from './store/settingsStore'
import { useExperimentStore } from './store/experimentStore'
import { useAnalysisStore } from './store/analysisStore'
import DashboardLayout from './components/layout/DashboardLayout'
import Dashboard from './components/pages/Dashboard'
import Preprocess from './components/pages/Preprocess'
import Experiment from './components/pages/Experiment'
import Analysis from './components/pages/Analysis'
import CodeAgent from './components/pages/CodeAgent'
import CompareResults from './components/pages/CompareResults'
import Settings from './components/pages/Settings'

export default function App() {
  const [ready, setReady] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const loadSettings = useSettingsStore((s) => s.loadSaved)
  const loadExperiment = useExperimentStore((s) => s.loadSaved)
  const loadAnalysis = useAnalysisStore((s) => s.loadSaved)

  useEffect(() => {
    async function init() {
      try {
        await initClient()
        loadSettings()
        loadExperiment()
        loadAnalysis()
        setReady(true)
      } catch (err) {
        setError(`Failed to connect to backend: ${err}`)
      }
    }
    init()
  }, [])

  if (error) {
    return (
      <div className="flex items-center justify-center h-screen bg-surface">
        <div className="text-center">
          <p className="text-lg font-bold text-danger mb-2">Connection Error</p>
          <p className="text-sm text-slate-400">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="mt-4 px-4 py-2 bg-accent hover:bg-accent-hover text-white rounded-lg text-sm"
          >
            Retry
          </button>
        </div>
      </div>
    )
  }

  if (!ready) {
    return (
      <div className="flex items-center justify-center h-screen bg-surface">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-sm text-slate-400">Starting backend...</p>
        </div>
      </div>
    )
  }

  return (
    <Routes>
      <Route element={<DashboardLayout />}>
        <Route path="/" element={<Dashboard />} />
        <Route path="/preprocess" element={<Preprocess />} />
        <Route path="/experiment" element={<Experiment />} />
        <Route path="/analysis" element={<Analysis />} />
        <Route path="/agent" element={<CodeAgent />} />
        <Route path="/compare" element={<CompareResults />} />
        <Route path="/settings" element={<Settings />} />
      </Route>
    </Routes>
  )
}
