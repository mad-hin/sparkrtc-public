import { create } from 'zustand'
import type { CodeSuggestion, BuildStatus } from '../api/types'

interface CodeAgentState {
  // Analysis + suggestions
  streaming: boolean
  analysisMarkdown: string
  suggestions: CodeSuggestion[]

  // Branch management
  branchName: string | null
  patchesApplied: boolean

  // Build
  buildStatus: BuildStatus

  // Experiment
  experimentRunning: boolean
  baselineDir: string | null
  compareDir: string | null

  // Actions
  setStreaming: (streaming: boolean) => void
  appendAnalysis: (chunk: string) => void
  addSuggestion: (suggestion: CodeSuggestion) => void
  toggleSuggestion: (id: string) => void
  acceptAll: () => void
  rejectAll: () => void
  setBranchName: (name: string | null) => void
  setPatchesApplied: (applied: boolean) => void
  setBuildStatus: (status: Partial<BuildStatus>) => void
  setExperimentRunning: (running: boolean) => void
  setBaselineDir: (dir: string | null) => void
  setCompareDir: (dir: string | null) => void
  reset: () => void
}

const initialBuildStatus: BuildStatus = { running: false, success: null, output: '' }

export const useCodeAgentStore = create<CodeAgentState>((set) => ({
  streaming: false,
  analysisMarkdown: '',
  suggestions: [],
  branchName: null,
  patchesApplied: false,
  buildStatus: { ...initialBuildStatus },
  experimentRunning: false,
  baselineDir: null,
  compareDir: null,

  setStreaming: (streaming) => set({ streaming }),
  appendAnalysis: (chunk) =>
    set((state) => ({ analysisMarkdown: state.analysisMarkdown + chunk })),
  addSuggestion: (suggestion) =>
    set((state) => ({ suggestions: [...state.suggestions, suggestion] })),
  toggleSuggestion: (id) =>
    set((state) => ({
      suggestions: state.suggestions.map((s) =>
        s.id === id ? { ...s, accepted: !s.accepted } : s
      )
    })),
  acceptAll: () =>
    set((state) => ({
      suggestions: state.suggestions.map((s) => ({ ...s, accepted: true }))
    })),
  rejectAll: () =>
    set((state) => ({
      suggestions: state.suggestions.map((s) => ({ ...s, accepted: false }))
    })),
  setBranchName: (name) => set({ branchName: name }),
  setPatchesApplied: (applied) => set({ patchesApplied: applied }),
  setBuildStatus: (status) =>
    set((state) => ({ buildStatus: { ...state.buildStatus, ...status } })),
  setExperimentRunning: (running) => set({ experimentRunning: running }),
  setBaselineDir: (dir) => set({ baselineDir: dir }),
  setCompareDir: (dir) => set({ compareDir: dir }),
  reset: () =>
    set({
      streaming: false,
      analysisMarkdown: '',
      suggestions: [],
      branchName: null,
      patchesApplied: false,
      buildStatus: { ...initialBuildStatus },
      experimentRunning: false,
      baselineDir: null,
      compareDir: null
    })
}))
