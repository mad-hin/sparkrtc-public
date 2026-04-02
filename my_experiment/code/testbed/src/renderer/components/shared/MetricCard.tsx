import React from 'react'
import { TrendingUp, TrendingDown, Minus } from 'lucide-react'

interface MetricCardProps {
  title: string
  value: string | number
  unit?: string
  subtitle?: string
  trend?: 'up' | 'down' | 'neutral'
  trendValue?: string
  className?: string
}

export default function MetricCard({
  title,
  value,
  unit,
  subtitle,
  trend,
  trendValue,
  className = ''
}: MetricCardProps) {
  const trendColor =
    trend === 'up' ? 'text-success' : trend === 'down' ? 'text-danger' : 'text-slate-400'
  const TrendIcon =
    trend === 'up' ? TrendingUp : trend === 'down' ? TrendingDown : Minus

  return (
    <div
      className={`bg-surface-secondary border border-slate-700 rounded-xl p-5 ${className}`}
    >
      <p className="text-xs font-medium text-slate-400 uppercase tracking-wider">
        {title}
      </p>
      <div className="mt-2 flex items-baseline gap-2">
        <span className="text-2xl font-bold text-white">{value}</span>
        {unit && <span className="text-sm text-slate-400">{unit}</span>}
      </div>
      {(subtitle || trend) && (
        <div className="mt-2 flex items-center gap-1.5">
          {trend && (
            <>
              <TrendIcon size={14} className={trendColor} />
              {trendValue && (
                <span className={`text-xs font-medium ${trendColor}`}>
                  {trendValue}
                </span>
              )}
            </>
          )}
          {subtitle && (
            <span className="text-xs text-slate-500">{subtitle}</span>
          )}
        </div>
      )}
    </div>
  )
}
