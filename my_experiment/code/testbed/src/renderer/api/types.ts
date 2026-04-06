// Electron API exposed via preload
declare global {
  interface Window {
    electronAPI: {
      openFile: (options?: object) => Promise<string | null>
      openDirectory: (options?: object) => Promise<string | null>
      getPythonPort: () => Promise<number | null>
      takeScreenshot: () => Promise<string | null>
      screenshotToClipboard: () => Promise<boolean>
    }
  }
}

// Settings
export interface OpenRouterBalance {
  credits_remaining: number
  credits_used: number
  rate_limit: string
}

export interface OpenRouterModel {
  id: string
  name: string
  context_length: number
}

// Experiment
export interface ExperimentConfig {
  file_path: string
  width: number
  height: number
  fps: number
  output_dir: string
  // Network emulation
  enable_mahimahi: boolean
  trace_file: string
  enable_loss_trace: boolean
  delay_ms: number
  // Server
  server_ip: string
  port: number
  // Advanced
  field_trials: string
}

export interface ExperimentStatus {
  running: boolean
  output_dir: string | null
  data_name: string | null
}

// Analysis
export interface AnalysisRequest {
  output_dir: string
  data_name: string
  model: string
  api_key: string
}

// Code Agent
export interface CodeSuggestion {
  id: string
  file: string
  diff: string
  oldCode: string
  newCode: string
  description: string
  accepted: boolean
}

export interface PatchResult {
  success: boolean
  branch: string
  applied: string[]
  failed: string[]
}

export interface BuildStatus {
  running: boolean
  success: boolean | null
  output: string
}

// Comparison
export interface MetricComparison {
  name: string
  baseline: number
  modified: number
  delta: number
  improved: boolean
}

export interface ComparisonData {
  delay: MetricComparison
  ssim: MetricComparison
  psnr: MetricComparison
  metrics: MetricComparison[]
}

// Timestamp logs
export interface TimestampEvent {
  [key: string]: string | number
}

export interface TimestampLog {
  event_type: string
  source: string
  events: TimestampEvent[]
}
