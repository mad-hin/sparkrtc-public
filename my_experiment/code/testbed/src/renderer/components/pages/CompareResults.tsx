import React, { useEffect, useState } from 'react'
import { GitCompare, Trash2, GitBranch, ArrowUp, ArrowDown, Minus } from 'lucide-react'
import { useCodeAgentStore } from '../../store/codeAgentStore'
import { api } from '../../api/client'
import MetricCard from '../shared/MetricCard'
import type { ComparisonData, MetricComparison } from '../../api/types'
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend
} from 'recharts'

export default function CompareResults() {
  const { branchName, baselineDir, compareDir, reset } = useCodeAgentStore()
  const [comparison, setComparison] = useState<ComparisonData | null>(null)
  const [chartData, setChartData] = useState<any[]>([])

  useEffect(() => {
    if (baselineDir && compareDir) {
      loadComparison()
    }
  }, [baselineDir, compareDir])

  const loadComparison = async () => {
    try {
      const data = await api<ComparisonData>(
        `/api/comparison/metrics?baseline=${encodeURIComponent(baselineDir!)}&compare=${encodeURIComponent(compareDir!)}`
      )
      setComparison(data)

      // Load chart data
      const charts = await api<any[]>(
        `/api/comparison/charts?baseline=${encodeURIComponent(baselineDir!)}&compare=${encodeURIComponent(compareDir!)}`
      )
      setChartData(charts)
    } catch (err) {
      console.error('Failed to load comparison:', err)
    }
  }

  const handleKeepChanges = () => {
    // Branch is preserved, just navigate away
    reset()
  }

  const handleDiscard = async () => {
    try {
      await api('/api/agent/cleanup', { method: 'DELETE' })
    } catch (err) {
      console.error('Failed to cleanup:', err)
    }
    reset()
  }

  const ImprovementBadge = ({ metric }: { metric: MetricComparison }) => {
    const absDelta = Math.abs(metric.delta)
    const pct = metric.baseline !== 0 ? ((absDelta / metric.baseline) * 100).toFixed(1) : '0'

    if (absDelta < 0.001) {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-1 bg-[#393939]/50 text-[#c6c6c6] rounded-pill text-xs font-medium">
          <Minus size={12} /> No Change
        </span>
      )
    }

    return metric.improved ? (
      <span className="inline-flex items-center gap-1 px-2 py-1 bg-success/20 text-success rounded-pill text-xs font-medium">
        <ArrowUp size={12} /> {pct}% Improved
      </span>
    ) : (
      <span className="inline-flex items-center gap-1 px-2 py-1 bg-danger/20 text-danger rounded-pill text-xs font-medium">
        <ArrowDown size={12} /> {pct}% Degraded
      </span>
    )
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-[#f4f4f4]">Compare Results</h2>
          <p className="text-sm text-[#c6c6c6] mt-1">
            Side-by-side comparison of baseline vs modified experiment
          </p>
        </div>
        {branchName && (
          <div className="flex items-center gap-3">
            <span className="text-xs bg-accent/20 text-accent px-3 py-1.5 rounded-pill font-mono flex items-center gap-1.5">
              <GitBranch size={12} /> {branchName}
            </span>
            <button
              onClick={handleKeepChanges}
              className="px-4 py-2 bg-success hover:bg-green-600 text-[#f4f4f4] rounded-none text-sm font-medium"
            >
              Keep Changes
            </button>
            <button
              onClick={handleDiscard}
              className="px-4 py-2 bg-danger hover:bg-red-600 text-[#f4f4f4] rounded-none text-sm font-medium flex items-center gap-2"
            >
              <Trash2 size={14} /> Discard
            </button>
          </div>
        )}
      </div>

      {comparison ? (
        <>
          {/* Metric comparison cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
            {comparison.metrics.map((m) => (
              <div
                key={m.name}
                className="bg-surface-secondary border border-[#393939] rounded-none p-5"
              >
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-medium text-[#c6c6c6] uppercase tracking-wider">
                    {m.name}
                  </h3>
                  <ImprovementBadge metric={m} />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs text-[#6f6f6f] mb-1">Baseline</p>
                    <p className="text-xl font-bold text-[#c6c6c6]">{m.baseline.toFixed(2)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-[#6f6f6f] mb-1">Modified</p>
                    <p className="text-xl font-bold text-[#f4f4f4]">{m.modified.toFixed(2)}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Overlay charts */}
          {chartData.length > 0 && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {chartData.map((chart, i) => (
                <div
                  key={i}
                  className="bg-surface-secondary border border-[#393939] rounded-none p-5"
                >
                  <h3 className="text-sm font-medium text-[#c6c6c6] mb-4">
                    {chart.title}
                  </h3>
                  <ResponsiveContainer width="100%" height={250}>
                    <LineChart data={chart.data}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                      <XAxis dataKey="frame" stroke="#64748b" fontSize={11} />
                      <YAxis stroke="#64748b" fontSize={11} />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: '#1e293b',
                          border: '1px solid #475569',
                          borderRadius: '8px',
                          fontSize: '12px'
                        }}
                      />
                      <Legend />
                      <Line
                        type="monotone"
                        dataKey="baseline"
                        stroke="#64748b"
                        strokeWidth={1.5}
                        dot={false}
                        name="Baseline"
                      />
                      <Line
                        type="monotone"
                        dataKey="modified"
                        stroke="#3b82f6"
                        strokeWidth={2}
                        dot={false}
                        name="Modified"
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              ))}
            </div>
          )}
        </>
      ) : (
        <div className="flex items-center justify-center h-64 text-[#6f6f6f]">
          <div className="text-center">
            <GitCompare size={48} className="mx-auto mb-3 opacity-40" />
            <p className="text-sm">No comparison data available</p>
            <p className="text-xs mt-1">
              Use the Code Agent to suggest changes, then "Confirm & Test" to compare results
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
