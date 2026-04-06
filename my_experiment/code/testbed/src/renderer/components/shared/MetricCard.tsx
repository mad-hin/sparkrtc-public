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
    trend === 'up' ? 'text-success' : trend === 'down' ? 'text-danger' : 'text-[#c6c6c6]'
  const TrendIcon =
    trend === 'up' ? TrendingUp : trend === 'down' ? TrendingDown : Minus

  return (
    <div
      className={`bg-surface-secondary border border-[#393939] rounded-none p-5 ${className}`}
    >
      <p className="text-xs font-medium text-[#c6c6c6] uppercase tracking-wider">
        {title}
      </p>
      <div className="mt-2 flex items-baseline gap-2">
        <span className="text-2xl font-bold text-[#f4f4f4]">{value}</span>
        {unit && <span className="text-sm text-[#c6c6c6]">{unit}</span>}
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
            <span className="text-xs text-[#6f6f6f]">{subtitle}</span>
          )}
        </div>
      )}
    </div>
  )
}
