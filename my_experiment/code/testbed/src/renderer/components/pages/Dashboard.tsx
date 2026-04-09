import React, { useEffect, useState } from 'react'
import MetricCard from '../shared/MetricCard'
import { RefreshCw, TrendingUp, TrendingDown, Minus } from 'lucide-react'
import { useExperimentStore } from '../../store/experimentStore'
import { useCodeAgentStore } from '../../store/codeAgentStore'
import { api } from '../../api/client'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts'

interface SummaryMetrics {
  delay: { mean: number; median: number; p95: number; count: number }
  ssim: { mean: number; median: number; count: number }
  psnr: { mean: number; median: number; count: number }
  rate: { mean: number; count: number }
  dropFrames: number
}

interface ChartData {
  title: string
  data: { frame: number; baseline?: number; modified?: number }[]
}

interface ComparisonMetric {
  name: string
  baseline: number
  modified: number
  delta: number
  improved: boolean
}

function parseSummary(text: string): SummaryMetrics | null {
  try {
    const getVal = (section: string, key: string): number => {
      const sectionMatch = text.match(new RegExp(`## ${section.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[\\s\\S]*?(?=##|$)`))
      if (!sectionMatch) return 0
      const lineMatch = sectionMatch[0].match(new RegExp(`${key}:\\s*([\\d.]+)`))
      return lineMatch ? parseFloat(lineMatch[1]) : 0
    }
    const dropMatch = text.match(/drop.*?(\d+)/i)
    return {
      delay: { mean: getVal('Delay', 'mean'), median: getVal('Delay', 'median'), p95: getVal('Delay', 'p95'), count: getVal('Delay', 'count') },
      ssim: { mean: getVal('Video Quality — SSIM', 'mean'), median: getVal('Video Quality — SSIM', 'median'), count: getVal('Video Quality — SSIM', 'count') },
      psnr: { mean: getVal('Video Quality — PSNR', 'mean'), median: getVal('Video Quality — PSNR', 'median'), count: getVal('Video Quality — PSNR', 'count') },
      rate: { mean: getVal('Bitrate', 'mean') || getVal('Rate', 'mean'), count: getVal('Bitrate', 'count') || getVal('Rate', 'count') },
      dropFrames: dropMatch ? parseInt(dropMatch[1]) : 0,
    }
  } catch {
    return null
  }
}

export default function Dashboard() {
  const { status } = useExperimentStore()
  const agentStore = useCodeAgentStore()
  const [metrics, setMetrics] = useState<SummaryMetrics | null>(null)
  const [charts, setCharts] = useState<ChartData[]>([])
  const [comparison, setComparison] = useState<ComparisonMetric[] | null>(null)
  const [loading, setLoading] = useState(false)

  const hasExperiment = status.output_dir && status.data_name
  const hasComparison = agentStore.baselineDir && agentStore.compareDir

  const fetchMetrics = async () => {
    if (!status.output_dir || !status.data_name) return
    setLoading(true)
    try {
      const result = await api<{ summary: string }>('/api/analysis/summary', {
        method: 'POST',
        body: JSON.stringify({ output_dir: status.output_dir, data_name: status.data_name })
      })
      const parsed = parseSummary(result.summary)
      if (parsed) setMetrics(parsed)
    } catch { /* ignore */ }

    // Load charts from comparison endpoint (baseline only — use same dir for both)
    try {
      const dir = status.output_dir?.includes('/') ? status.output_dir : `${status.output_dir}/output_1`
      const chartData = await api<ChartData[]>(`/api/comparison/charts?baseline=${encodeURIComponent(dir)}&compare=${encodeURIComponent(dir)}`)
      setCharts(chartData)
    } catch { /* ignore */ }

    // Load comparison if Code Agent has produced one
    if (hasComparison) {
      try {
        const cmpData = await api<{ metrics: ComparisonMetric[] }>(
          `/api/comparison/metrics?baseline=${encodeURIComponent(agentStore.baselineDir!)}&compare=${encodeURIComponent(agentStore.compareDir!)}`
        )
        if (cmpData.metrics?.some(m => m.baseline > 0 || m.modified > 0)) {
          setComparison(cmpData.metrics)
        }
      } catch { /* ignore */ }
    }

    setLoading(false)
  }

  useEffect(() => { fetchMetrics() }, [status.output_dir, status.data_name])

  const delayRating = metrics ? (metrics.delay.mean < 50 ? 'Excellent' : metrics.delay.mean < 100 ? 'Good' : metrics.delay.mean < 200 ? 'Acceptable' : 'Poor') : null
  const ssimRating = metrics ? (metrics.ssim.mean > 0.95 ? 'Excellent' : metrics.ssim.mean > 0.90 ? 'Good' : 'Degraded') : null
  const psnrRating = metrics ? (metrics.psnr.mean > 40 ? 'Excellent' : metrics.psnr.mean > 30 ? 'Good' : 'Poor') : null

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h2 className="text-heading-03 text-[#f4f4f4]">Dashboard</h2>
          <p className="text-body-short text-[#c6c6c6] mt-1">
            {hasExperiment
              ? `Latest: ${status.data_name} — ${status.output_dir}`
              : 'Run an experiment to see results'}
          </p>
        </div>
        {hasExperiment && (
          <button onClick={fetchMetrics} disabled={loading}
            className="px-4 py-2 bg-surface-tertiary hover:bg-[#353535] text-[#c6c6c6] text-body-short flex items-center gap-2">
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Refresh
          </button>
        )}
      </div>

      {/* Metric cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <MetricCard title="Avg Delay" value={metrics ? metrics.delay.mean.toFixed(1) : '--'} unit="ms"
          subtitle={metrics ? `p95: ${metrics.delay.p95.toFixed(1)}ms · ${delayRating}` : 'No data'}
          trend={delayRating === 'Excellent' ? 'up' : delayRating === 'Poor' ? 'down' : 'neutral'} />
        <MetricCard title="SSIM" value={metrics ? metrics.ssim.mean.toFixed(4) : '--'}
          subtitle={metrics ? `median: ${metrics.ssim.median.toFixed(4)} · ${ssimRating}` : 'No data'}
          trend={ssimRating === 'Excellent' ? 'up' : ssimRating === 'Degraded' ? 'down' : 'neutral'} />
        <MetricCard title="PSNR" value={metrics ? metrics.psnr.mean.toFixed(1) : '--'} unit="dB"
          subtitle={metrics ? `median: ${metrics.psnr.median.toFixed(1)}dB · ${psnrRating}` : 'No data'}
          trend={psnrRating === 'Excellent' ? 'up' : psnrRating === 'Poor' ? 'down' : 'neutral'} />
        <MetricCard title="Bitrate" value={metrics ? metrics.rate.mean.toFixed(0) : '--'} unit="kbps"
          subtitle={metrics ? `${metrics.rate.count} samples · ${metrics.dropFrames} drops` : 'No data'} />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
        {charts.length > 0 ? charts.slice(0, 2).map((chart, i) => (
          <div key={i} className="bg-surface-secondary border border-[#393939] p-4">
            <h3 className="text-xs font-medium text-[#c6c6c6] mb-3">{chart.title}</h3>
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={chart.data.slice(0, 500)}>
                <CartesianGrid strokeDasharray="3 3" stroke="#393939" />
                <XAxis dataKey="frame" tick={{ fontSize: 10, fill: '#6f6f6f' }} />
                <YAxis tick={{ fontSize: 10, fill: '#6f6f6f' }} />
                <Tooltip contentStyle={{ backgroundColor: '#262626', border: '1px solid #393939', fontSize: 11 }} />
                <Line type="monotone" dataKey="baseline" stroke="#0f62fe" dot={false} strokeWidth={1} name="Value" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )) : [0, 1].map(i => (
          <div key={i} className="bg-surface-secondary border border-[#393939] p-5 h-64 flex items-center justify-center">
            <p className="text-body-short text-[#6f6f6f]">
              {!hasExperiment ? 'Run an experiment to see charts' : 'Loading charts...'}
            </p>
          </div>
        ))}
      </div>

      {/* Improvement section — shown when Code Agent has comparison data */}
      {comparison && (
        <div className="bg-surface-secondary border border-[#393939] p-5 mb-6">
          <h3 className="text-sm font-medium text-[#f4f4f4] mb-4">Code Agent Improvement</h3>
          <p className="text-xs text-[#6f6f6f] mb-4">
            Comparison between baseline experiment and modified codebase (branch: {agentStore.branchName || 'unknown'})
          </p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {comparison.map((m, i) => {
              const pct = m.baseline > 0 ? ((m.delta / m.baseline) * 100) : 0
              const isGood = m.improved
              return (
                <div key={i} className="bg-surface border border-[#393939] p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs text-[#6f6f6f] uppercase">{m.name}</span>
                    {m.delta !== 0 && (
                      <span className={`text-xs font-medium flex items-center gap-1 ${isGood ? 'text-success' : 'text-danger'}`}>
                        {isGood ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                        {Math.abs(pct).toFixed(1)}% {isGood ? 'improved' : 'degraded'}
                      </span>
                    )}
                    {m.delta === 0 && (
                      <span className="text-xs text-[#6f6f6f] flex items-center gap-1">
                        <Minus size={12} /> No change
                      </span>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <p className="text-[9px] text-[#6f6f6f]">Baseline</p>
                      <p className="text-lg font-semibold text-[#c6c6c6]">{m.baseline.toFixed(2)}</p>
                    </div>
                    <div>
                      <p className="text-[9px] text-[#6f6f6f]">Modified</p>
                      <p className={`text-lg font-semibold ${isGood ? 'text-success' : m.delta !== 0 ? 'text-danger' : 'text-[#c6c6c6]'}`}>
                        {m.modified.toFixed(2)}
                      </p>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Quality assessment */}
      {metrics && (
        <div className="bg-surface-secondary border border-[#393939] p-5">
          <h3 className="text-sm font-medium text-[#f4f4f4] mb-3">Quality Assessment</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="flex items-start gap-3">
              <div className={`w-2 h-2 rounded-full mt-1.5 ${delayRating === 'Excellent' ? 'bg-success' : delayRating === 'Good' ? 'bg-accent' : delayRating === 'Acceptable' ? 'bg-warning' : 'bg-danger'}`} />
              <div>
                <p className="text-xs font-medium text-[#f4f4f4]">Latency: {delayRating}</p>
                <p className="text-[10px] text-[#6f6f6f]">
                  Mean {metrics.delay.mean.toFixed(1)}ms, p95 {metrics.delay.p95.toFixed(1)}ms.
                  {metrics.delay.mean < 100 ? ' Within interactive threshold.' : ' Exceeds 100ms target.'}
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className={`w-2 h-2 rounded-full mt-1.5 ${ssimRating === 'Excellent' ? 'bg-success' : ssimRating === 'Good' ? 'bg-accent' : 'bg-danger'}`} />
              <div>
                <p className="text-xs font-medium text-[#f4f4f4]">Visual Quality: {ssimRating}</p>
                <p className="text-[10px] text-[#6f6f6f]">
                  SSIM {metrics.ssim.mean.toFixed(4)}, PSNR {metrics.psnr.mean.toFixed(1)}dB.
                  {metrics.ssim.mean > 0.95 ? ' No visible degradation.' : metrics.ssim.mean > 0.9 ? ' Minor artifacts possible.' : ' Visible quality loss.'}
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className={`w-2 h-2 rounded-full mt-1.5 ${metrics.dropFrames === 0 ? 'bg-success' : metrics.dropFrames < 10 ? 'bg-warning' : 'bg-danger'}`} />
              <div>
                <p className="text-xs font-medium text-[#f4f4f4]">Stability: {metrics.dropFrames === 0 ? 'Excellent' : metrics.dropFrames < 10 ? 'Good' : 'Unstable'}</p>
                <p className="text-[10px] text-[#6f6f6f]">
                  {metrics.dropFrames} dropped frames out of {metrics.delay.count} total.
                  {metrics.dropFrames === 0 ? ' No frame drops detected.' : ` ${(metrics.dropFrames / metrics.delay.count * 100).toFixed(1)}% drop rate.`}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
