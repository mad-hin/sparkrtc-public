import { create } from 'zustand'

const MODEL_KEY = 'sparkrtc-selected-model'

export interface BatchValidationResult {
  scenarioId: string
  scenarioName: string
  paper: string
  status: 'pending' | 'running' | 'done' | 'skipped' | 'error'
  primaryFound: number
  primaryTotal: number
  totalFound: number
  total: number
  details: { label: string; found: boolean; severity: string }[]
  analysisText: string
}

interface AnalysisState {
  streaming: boolean
  analysisText: string
  summaryText: string
  selectedModel: string

  // Batch validation (persists across tab navigation)
  batchValidating: boolean
  batchCurrentIdx: number
  batchResults: BatchValidationResult[]
  batchLiveText: string

  setStreaming: (streaming: boolean) => void
  appendChunk: (chunk: string) => void
  setAnalysisText: (text: string) => void
  setSummaryText: (text: string) => void
  setSelectedModel: (model: string) => void
  clear: () => void
  loadSaved: () => void
  // Batch actions
  setBatchValidating: (v: boolean) => void
  setBatchCurrentIdx: (v: number) => void
  setBatchResults: (v: BatchValidationResult[]) => void
  updateBatchResult: (idx: number, patch: Partial<BatchValidationResult>) => void
  setBatchLiveText: (v: string) => void
  appendBatchLiveText: (chunk: string) => void
  resetBatch: () => void
}

export const useAnalysisStore = create<AnalysisState>((set) => ({
  streaming: false,
  analysisText: '',
  summaryText: '',
  selectedModel: '',
  batchValidating: false,
  batchCurrentIdx: -1,
  batchResults: [],
  batchLiveText: '',

  setStreaming: (streaming) => set({ streaming }),
  appendChunk: (chunk) =>
    set((state) => ({ analysisText: state.analysisText + chunk })),
  setAnalysisText: (text) => set({ analysisText: text }),
  setSummaryText: (text) => set({ summaryText: text }),
  setSelectedModel: (model) => {
    set({ selectedModel: model })
    localStorage.setItem(MODEL_KEY, model)
  },
  clear: () => set({ analysisText: '', summaryText: '', streaming: false }),
  loadSaved: () => {
    const saved = localStorage.getItem(MODEL_KEY)
    if (saved) set({ selectedModel: saved })
  },

  setBatchValidating: (v) => set({ batchValidating: v }),
  setBatchCurrentIdx: (v) => set({ batchCurrentIdx: v }),
  setBatchResults: (v) => set({ batchResults: v }),
  updateBatchResult: (idx, patch) => set((state) => {
    const results = [...state.batchResults]
    if (results[idx]) results[idx] = { ...results[idx], ...patch }
    return { batchResults: results }
  }),
  setBatchLiveText: (v) => set({ batchLiveText: v }),
  appendBatchLiveText: (chunk) => set((state) => ({ batchLiveText: state.batchLiveText + chunk })),
  resetBatch: () => set({ batchValidating: false, batchCurrentIdx: -1, batchResults: [], batchLiveText: '' }),
}))
