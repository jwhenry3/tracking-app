import { money } from '@/lib/financeUtils'
import { cn } from '@/lib/utils'

type BarSeries = {
  key: string
  label: string
  value: number
  color: string
}

type FinanceBarChartProps = {
  title: string
  series: BarSeries[]
  className?: string
  formatValue?: (value: number) => string
}

export function FinanceBarChart({
  title,
  series,
  className,
  formatValue = money,
}: FinanceBarChartProps) {
  const maxValue = Math.max(...series.map((item) => item.value), 1)

  return (
    <div className={cn('space-y-4', className)}>
      <h4 className="text-sm font-medium">{title}</h4>
      <div className="space-y-3">
        {series.map((item) => (
          <div key={item.key} className="space-y-1">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">{item.label}</span>
              <span className="font-medium">{formatValue(item.value)}</span>
            </div>
            <div className="h-2 rounded-full bg-muted">
              <div
                className="h-2 rounded-full transition-all"
                style={{
                  width: `${Math.max(4, (item.value / maxValue) * 100)}%`,
                  backgroundColor: item.color,
                }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

type GroupedBarChartProps = {
  title: string
  categories: Array<{ key: string; label: string }>
  groups: Array<{ key: string; label: string; color: string; values: Record<string, number> }>
  className?: string
}

export function FinanceGroupedBarChart({ title, categories, groups, className }: GroupedBarChartProps) {
  const maxValue = Math.max(
    1,
    ...categories.flatMap((category) => groups.map((group) => group.values[category.key] ?? 0)),
  )

  return (
    <div className={cn('space-y-4', className)}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h4 className="text-sm font-medium">{title}</h4>
        <div className="flex flex-wrap gap-3 text-xs">
          {groups.map((group) => (
            <span key={group.key} className="inline-flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: group.color }} />
              {group.label}
            </span>
          ))}
        </div>
      </div>

      <div className="overflow-x-auto">
        <div className="flex min-w-[28rem] items-end gap-4 md:min-w-[640px]">
          {categories.map((category) => (
            <div key={category.key} className="flex flex-1 flex-col items-center gap-2">
              <div className="flex h-40 w-full items-end justify-center gap-1">
                {groups.map((group) => {
                  const value = group.values[category.key] ?? 0
                  const height = Math.max(4, (value / maxValue) * 100)
                  return (
                    <div
                      key={group.key}
                      className="flex-1 rounded-t-md"
                      style={{ height: `${height}%`, backgroundColor: group.color }}
                      title={`${group.label}: ${money(value)}`}
                    />
                  )
                })}
              </div>
              <span className="text-xs text-muted-foreground">{category.label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

type LineChartProps = {
  title: string
  points: Array<{ key: string; label: string; value: number }>
  color?: string
  className?: string
}

export function FinanceLineChart({
  title,
  points,
  color = '#2563eb',
  className,
}: LineChartProps) {
  if (points.length === 0) {
    return (
      <div className={className}>
        <h4 className="text-sm font-medium">{title}</h4>
        <p className="mt-3 text-sm text-muted-foreground">No data yet.</p>
      </div>
    )
  }

  const width = 640
  const height = 180
  const padding = 24
  const values = points.map((point) => point.value)
  const minValue = Math.min(...values, 0)
  const maxValue = Math.max(...values, 0)
  const span = Math.max(maxValue - minValue, 1)

  const coordinates = points.map((point, index) => {
    const x = padding + (index / Math.max(points.length - 1, 1)) * (width - padding * 2)
    const y = padding + (1 - (point.value - minValue) / span) * (height - padding * 2)
    return { ...point, x, y }
  })

  const linePath = coordinates
    .map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`)
    .join(' ')

  const areaPath = `${linePath} L ${coordinates[coordinates.length - 1]?.x ?? padding} ${height - padding} L ${coordinates[0]?.x ?? padding} ${height - padding} Z`

  return (
    <div className={cn('space-y-4', className)}>
      <h4 className="text-sm font-medium">{title}</h4>
      <div className="overflow-x-auto">
        <svg viewBox={`0 0 ${width} ${height}`} className="min-w-[28rem] w-full md:min-w-[640px]">
          <line
            x1={padding}
            x2={width - padding}
            y1={height - padding}
            y2={height - padding}
            stroke="currentColor"
            className="text-border"
          />
          <path d={areaPath} fill={color} fillOpacity="0.12" />
          <path d={linePath} fill="none" stroke={color} strokeWidth="3" strokeLinecap="round" />
          {coordinates.map((point) => (
            <g key={point.key}>
              <circle cx={point.x} cy={point.y} r="4" fill={color} />
              <text
                x={point.x}
                y={height - 6}
                textAnchor="middle"
                className="fill-muted-foreground text-[10px]"
              >
                {point.label}
              </text>
            </g>
          ))}
        </svg>
      </div>
    </div>
  )
}
