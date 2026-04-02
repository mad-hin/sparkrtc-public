import { create } from 'zustand'

const MODEL_KEY = 'sparkrtc-selected-model'

interface AnalysisState {
  streaming: boolean
  analysisText: string
  summaryText: string
  selectedModel: string

  setStreaming: (streaming: boolean) => void
  appendChunk: (chunk: string) => void
  setAnalysisText: (text: string) => void
  setSummaryText: (text: string) => void
  setSelectedModel: (model: string) => void
  clear: () => void
  loadSaved: () => void
}

export const useAnalysisStore = create<AnalysisState>((set) => ({
  streaming: false,
  analysisText: '',
  summaryText: '',
  selectedModel: '',

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
  }
}))
