import { create } from 'zustand'
import { api } from '../api/client'
import type { OpenRouterBalance, OpenRouterModel } from '../api/types'

interface SettingsState {
  apiKey: string
  theme: 'dark' | 'light'
  repoPath: string
  models: OpenRouterModel[]
  balance: OpenRouterBalance | null
  loading: boolean

  setApiKey: (key: string) => void
  clearApiKey: () => void
  setTheme: (theme: 'dark' | 'light') => void
  setRepoPath: (path: string) => void
  fetchModels: () => Promise<void>
  fetchBalance: () => Promise<void>
  validateKey: (key: string) => Promise<boolean>
  loadSaved: () => void
}

const STORAGE_KEY = 'sparkrtc-settings'

function _save(patch: Record<string, unknown>) {
  const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}')
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...saved, ...patch }))
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  apiKey: '',
  theme: 'dark',
  repoPath: '',
  models: [],
  balance: null,
  loading: false,

  setApiKey: (key: string) => {
    set({ apiKey: key })
    _save({ apiKey: key })
  },

  clearApiKey: () => {
    set({ apiKey: '', balance: null })
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}')
    delete saved.apiKey
    localStorage.setItem(STORAGE_KEY, JSON.stringify(saved))
  },

  setTheme: (theme: 'dark' | 'light') => {
    set({ theme })
    document.documentElement.classList.toggle('dark', theme === 'dark')
    _save({ theme })
  },

  setRepoPath: (path: string) => {
    set({ repoPath: path })
    _save({ repoPath: path })
    // Notify backend of the repo path
    api('/api/settings/repo-path', {
      method: 'POST',
      body: JSON.stringify({ repo_path: path })
    }).catch(() => {})
  },

  fetchModels: async () => {
    const { apiKey } = get()
    if (!apiKey) return
    set({ loading: true })
    try {
      const models = await api<OpenRouterModel[]>('/api/settings/models', {
        headers: { 'X-Api-Key': apiKey }
      })
      set({ models })
      // Cache models in localStorage
      localStorage.setItem('sparkrtc-models', JSON.stringify(models))
    } catch (err) {
      console.error('Failed to fetch models:', err)
    } finally {
      set({ loading: false })
    }
  },

  fetchBalance: async () => {
    const { apiKey } = get()
    if (!apiKey) return
    try {
      const balance = await api<OpenRouterBalance>('/api/settings/balance', {
        headers: { 'X-Api-Key': apiKey }
      })
      set({ balance })
    } catch (err) {
      console.error('Failed to fetch balance:', err)
    }
  },

  validateKey: async (key: string) => {
    try {
      const result = await api<{ valid: boolean }>('/api/settings/validate-key', {
        method: 'POST',
        body: JSON.stringify({ api_key: key })
      })
      return result.valid
    } catch {
      return false
    }
  },

  loadSaved: () => {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}')
    if (saved.apiKey) set({ apiKey: saved.apiKey })
    if (saved.repoPath) {
      set({ repoPath: saved.repoPath })
      api('/api/settings/repo-path', {
        method: 'POST',
        body: JSON.stringify({ repo_path: saved.repoPath })
      }).catch(() => {})
    }
    if (saved.theme) {
      set({ theme: saved.theme })
      document.documentElement.classList.toggle('dark', saved.theme === 'dark')
    }
    // Load cached models immediately, then refresh from API in background
    try {
      const cached = JSON.parse(localStorage.getItem('sparkrtc-models') || '[]')
      if (cached.length > 0) set({ models: cached })
    } catch { /* ignore */ }
    if (saved.apiKey) {
      // Auto-fetch fresh models in background
      setTimeout(() => get().fetchModels(), 500)
    }
  }
}))
