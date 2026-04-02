import { create } from 'zustand'
import type { CodeSuggestion, BuildStatus } from '../api/types'

interface CodeAgentState {
  // Analysis + suggestions
  streaming: boolean
  analysisMarkdown: string
  suggestions: CodeSuggestion[]

  // Pipeline progress
  currentStep: number      // 0=idle, 1=anomaly analysis, 2=deep dive, 3=code changes
  stepMessage: string
  thinkingContent: string
  thinkingVisible: boolean
  filesRead: string[]

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
  setCurrentStep: (step: number, message: string) => void
  appendThinking: (chunk: string) => void
  setThinkingVisible: (visible: boolean) => void
  setFilesRead: (files: string[]) => void
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
  currentStep: 0,
  stepMessage: '',
  thinkingContent: '',
  thinkingVisible: false,
  filesRead: [],
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
  setCurrentStep: (step, message) => set({ currentStep: step, stepMessage: message }),
  appendThinking: (chunk) =>
    set((state) => ({ thinkingContent: state.thinkingContent + chunk })),
  setThinkingVisible: (visible) => set({ thinkingVisible: visible }),
  setFilesRead: (files) => set({ filesRead: files }),
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
      currentStep: 0,
      stepMessage: '',
      thinkingContent: '',
      thinkingVisible: false,
      filesRead: [],
      branchName: null,
      patchesApplied: false,
      buildStatus: { ...initialBuildStatus },
      experimentRunning: false,
      baselineDir: null,
      compareDir: null
    })
}))
