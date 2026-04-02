import { create } from 'zustand'

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
}

export const useAnalysisStore = create<AnalysisState>((set) => ({
  streaming: false,
  analysisText: '',
  summaryText: '',
  selectedModel: 'anthropic/claude-sonnet-4',

  setStreaming: (streaming) => set({ streaming }),
  appendChunk: (chunk) =>
    set((state) => ({ analysisText: state.analysisText + chunk })),
  setAnalysisText: (text) => set({ analysisText: text }),
  setSummaryText: (text) => set({ summaryText: text }),
  setSelectedModel: (model) => set({ selectedModel: model }),
  clear: () => set({ analysisText: '', summaryText: '', streaming: false })
}))
