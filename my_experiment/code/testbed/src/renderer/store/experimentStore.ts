import { create } from 'zustand'
import { api } from '../api/client'
import type { ExperimentConfig, ExperimentStatus, TimestampLog } from '../api/types'

const STORAGE_KEY = 'sparkrtc-experiment'

export type BatchStatus = 'pending' | 'running' | 'done' | 'error'

interface ExperimentState {
  status: ExperimentStatus
  logs: { server: string; sender: string; receiver: string }
  timestampLogs: TimestampLog[]
  figures: string[]

  // Batch run state (persists across tab navigation)
  batchRunning: boolean
  batchCurrentIdx: number
  batchResults: Record<string, BatchStatus>

  setStatus: (status: ExperimentStatus) => void
  appendLog: (source: 'server' | 'sender' | 'receiver', text: string) => void
  clearLogs: () => void
  runExperiment: (config: ExperimentConfig) => Promise<void>
  stopExperiment: () => Promise<void>
  loadTimestampLogs: (outputDir: string, dataName: string) => Promise<void>
  loadFigures: (outputDir: string, dataName: string) => Promise<void>
  loadSaved: () => void
  setBatchRunning: (v: boolean) => void
  setBatchCurrentIdx: (v: number) => void
  setBatchResults: (v: Record<string, BatchStatus>) => void
  updateBatchResult: (id: string, status: BatchStatus) => void
}

function saveContext(output_dir: string | null, data_name: string | null) {
  if (output_dir && data_name) {
    // Sanitize data_name: strip directory path and .yuv extension
    const dn = data_name.replace(/^.*[\\/]/, '').replace(/\.yuv$/, '')
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ output_dir, data_name: dn }))
  }
}

export const useExperimentStore = create<ExperimentState>((set) => ({
  status: { running: false, output_dir: null, data_name: null },
  logs: { server: '', sender: '', receiver: '' },
  timestampLogs: [],
  figures: [],
  batchRunning: false,
  batchCurrentIdx: -1,
  batchResults: {},

  setStatus: (status) => {
    set({ status })
    saveContext(status.output_dir, status.data_name)
  },

  appendLog: (source, text) =>
    set((state) => ({
      logs: { ...state.logs, [source]: state.logs[source] + text }
    })),

  clearLogs: () => set({ logs: { server: '', sender: '', receiver: '' } }),

  runExperiment: async (config) => {
    const data_name = config.file_path.replace(/^.*[\\/]/, '').replace(/\.yuv$/, '')
    set({
      status: { running: true, output_dir: config.output_dir, data_name },
      logs: { server: '', sender: '', receiver: '' }
    })
    saveContext(config.output_dir, data_name)
    try {
      await api('/api/experiment/run', {
        method: 'POST',
        body: JSON.stringify(config)
      })
    } catch (err) {
      set((state) => ({ status: { ...state.status, running: false } }))
      throw err
    }
  },

  stopExperiment: async () => {
    await api('/api/experiment/stop', { method: 'POST' })
    set((state) => ({ status: { ...state.status, running: false } }))
  },

  loadTimestampLogs: async (outputDir, dataName) => {
    const logs = await api<TimestampLog[]>(
      `/api/experiment/logs?output_dir=${encodeURIComponent(outputDir)}&data_name=${encodeURIComponent(dataName)}`
    )
    set({ timestampLogs: logs })
  },

  loadFigures: async (outputDir, dataName) => {
    const figs = await api<string[]>(
      `/api/experiment/figures?output_dir=${encodeURIComponent(outputDir)}&data_name=${encodeURIComponent(dataName)}`
    )
    set({ figures: figs })
  },

  setBatchRunning: (v) => set({ batchRunning: v }),
  setBatchCurrentIdx: (v) => set({ batchCurrentIdx: v }),
  setBatchResults: (v) => set({ batchResults: v }),
  updateBatchResult: (id, status) => set((state) => ({
    batchResults: { ...state.batchResults, [id]: status }
  })),

  loadSaved: () => {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}')
      if (saved.output_dir && saved.data_name) {
        // Sanitize data_name: strip directory path and .yuv extension
        let dn = saved.data_name as string
        dn = dn.replace(/^.*[\\/]/, '').replace(/\.yuv$/, '')
        set({
          status: { running: false, output_dir: saved.output_dir, data_name: dn }
        })
      }
    } catch { /* ignore */ }
  }
}))
