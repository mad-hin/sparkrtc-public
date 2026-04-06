import React, { useEffect, useState } from 'react'
import MetricCard from '../shared/MetricCard'
import { BarChart3, Eye, RefreshCw } from 'lucide-react'
import { useExperimentStore } from '../../store/experimentStore'
import { api } from '../../api/client'

interface SummaryMetrics {
  delay: { mean: number; median: number; p95: number; count: number }
  ssim: { mean: number; median: number; count: number }
  psnr: { mean: number; median: number; count: number }
  rate: { mean: number; count: number }
}

function parseSummary(text: string): SummaryMetrics | null {
  try {
    const getVal = (section: string, key: string): number => {
      const sectionMatch = text.match(new RegExp(`## ${section}[\\s\\S]*?(?=##|$)`))
      if (!sectionMatch) return 0
      const lineMatch = sectionMatch[0].match(new RegExp(`${key}:\\s*([\\d.]+)`))
      return lineMatch ? parseFloat(lineMatch[1]) : 0
    }
    return {
      delay: { mean: getVal('Delay', 'mean'), median: getVal('Delay', 'median'), p95: getVal('Delay', 'p95'), count: getVal('Delay', 'count') },
      ssim: { mean: getVal('SSIM', 'mean'), median: getVal('SSIM', 'median'), count: getVal('SSIM', 'count') },
      psnr: { mean: getVal('PSNR', 'mean'), median: getVal('PSNR', 'median'), count: getVal('PSNR', 'count') },
      rate: { mean: getVal('Bitrate', 'mean') || getVal('Rate', 'mean'), count: getVal('Bitrate', 'count') || getVal('Rate', 'count') },
    }
  } catch {
    return null
  }
}

export default function Dashboard() {
  const { status } = useExperimentStore()
  const [metrics, setMetrics] = useState<SummaryMetrics | null>(null)
  const [loading, setLoading] = useState(false)

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
    } catch {
      // ignore — no experiment data available
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchMetrics()
  }, [status.output_dir, status.data_name])

  const hasExperiment = status.output_dir && status.data_name

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h2 className="text-heading-03 text-[#f4f4f4]">Dashboard</h2>
          <p className="text-body-short text-[#c6c6c6] mt-1">
            {hasExperiment
              ? `Latest experiment: ${status.data_name} — ${status.output_dir}`
              : 'Run an experiment to see results'}
          </p>
        </div>
        {hasExperiment && (
          <button
            onClick={fetchMetrics}
            disabled={loading}
            className="px-4 py-2 bg-surface-tertiary hover:bg-[#353535] text-[#c6c6c6] text-body-short flex items-center gap-2"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>
        )}
      </div>

      {/* Metric cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <MetricCard
          title="Avg Delay"
          value={metrics ? metrics.delay.mean.toFixed(1) : '--'}
          unit="ms"
          subtitle={metrics ? `p95: ${metrics.delay.p95.toFixed(1)} ms · ${metrics.delay.count} frames` : 'No data'}
        />
        <MetricCard
          title="SSIM"
          value={metrics ? metrics.ssim.mean.toFixed(4) : '--'}
          subtitle={metrics ? `median: ${metrics.ssim.median.toFixed(4)} · ${metrics.ssim.count} frames` : 'No data'}
        />
        <MetricCard
          title="PSNR"
          value={metrics ? metrics.psnr.mean.toFixed(1) : '--'}
          unit="dB"
          subtitle={metrics ? `median: ${metrics.psnr.median.toFixed(1)} dB · ${metrics.psnr.count} frames` : 'No data'}
        />
        <MetricCard
          title="Bitrate"
          value={metrics ? metrics.rate.mean.toFixed(0) : '--'}
          unit="kbps"
          subtitle={metrics ? `${metrics.rate.count} samples` : 'No data'}
        />
      </div>

      {/* Chart placeholders */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-surface-secondary border border-[#393939] p-5 h-64 flex items-center justify-center">
          <div className="text-center text-[#6f6f6f]">
            <BarChart3 size={32} className="mx-auto mb-2 opacity-40" />
            <p className="text-body-short">Delay &amp; Frame Size</p>
            {!hasExperiment && <p className="text-caption mt-1">Run an experiment to see charts</p>}
          </div>
        </div>
        <div className="bg-surface-secondary border border-[#393939] p-5 h-64 flex items-center justify-center">
          <div className="text-center text-[#6f6f6f]">
            <Eye size={32} className="mx-auto mb-2 opacity-40" />
            <p className="text-body-short">SSIM &amp; PSNR</p>
            {!hasExperiment && <p className="text-caption mt-1">Run an experiment to see charts</p>}
          </div>
        </div>
      </div>
    </div>
  )
}
