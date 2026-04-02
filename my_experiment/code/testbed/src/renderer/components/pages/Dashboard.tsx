import React from 'react'
import MetricCard from '../shared/MetricCard'
import { Activity, Clock, Eye, BarChart3 } from 'lucide-react'

export default function Dashboard() {
  return (
    <div>
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-white">Dashboard</h2>
        <p className="text-sm text-slate-400 mt-1">
          Overview of your most recent experiment results
        </p>
      </div>

      {/* Metric cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <MetricCard
          title="Avg Delay"
          value="--"
          unit="ms"
          subtitle="No experiment run yet"
        />
        <MetricCard
          title="Avg SSIM"
          value="--"
          subtitle="No experiment run yet"
        />
        <MetricCard
          title="Avg PSNR"
          value="--"
          unit="dB"
          subtitle="No experiment run yet"
        />
        <MetricCard
          title="Bitrate"
          value="--"
          unit="kbps"
          subtitle="No experiment run yet"
        />
      </div>

      {/* Placeholder charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-surface-secondary border border-slate-700 rounded-xl p-5 h-64 flex items-center justify-center">
          <div className="text-center text-slate-500">
            <BarChart3 size={40} className="mx-auto mb-2 opacity-50" />
            <p className="text-sm">Delay & Frame Size charts will appear here</p>
            <p className="text-xs mt-1">Run an experiment to see results</p>
          </div>
        </div>
        <div className="bg-surface-secondary border border-slate-700 rounded-xl p-5 h-64 flex items-center justify-center">
          <div className="text-center text-slate-500">
            <Eye size={40} className="mx-auto mb-2 opacity-50" />
            <p className="text-sm">SSIM & PSNR charts will appear here</p>
            <p className="text-xs mt-1">Run an experiment to see results</p>
          </div>
        </div>
      </div>
    </div>
  )
}
