import { Area, AreaChart, ResponsiveContainer } from 'recharts'
import { useUI } from '@/store/ui'

/**
 * Cores dos gráficos. Os pares de série foram validados para daltonismo e
 * contraste em cada superfície (claro e escuro) — não troque sem revalidar.
 */
export function useChartTheme() {
  const dark = useUI((s) => s.theme) === 'dark'
  return {
    primary: dark ? '#6366F1' : '#4F46E5',
    secondary: '#D97706',
    grid: dark ? '#1E293B' : '#E2E8F0',
    axis: dark ? '#94A3B8' : '#64748B',
    surface: dark ? '#0F172A' : '#FFFFFF',
    cursor: dark ? 'rgba(148,163,184,0.10)' : 'rgba(100,116,139,0.10)',
  }
}

export function ChartTooltip({
  active,
  payload,
  label,
  format,
}: {
  active?: boolean
  payload?: Array<{ name?: string; value?: number; color?: string }>
  label?: string
  format: (value: number) => string
}) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-lg border bg-white px-3 py-2 text-xs shadow-lg dark:bg-slate-900">
      <p className="mb-1.5 font-medium capitalize text-slate-500 dark:text-slate-400">{label}</p>
      {payload.map((p) => (
        <p key={p.name} className="flex items-center gap-2 py-0.5">
          <span className="h-2 w-2 rounded-full" style={{ background: p.color }} />
          <span className="text-slate-600 dark:text-slate-300">{p.name}</span>
          <span className="tabular ml-auto pl-4 font-semibold text-slate-900 dark:text-slate-100">{format(Number(p.value ?? 0))}</span>
        </p>
      ))}
    </div>
  )
}

/** Legenda em tinta de texto; a cor fica só na bolinha. */
export function ChartLegend({ items }: { items: Array<{ label: string; color: string }> }) {
  return (
    <div className="flex flex-wrap items-center gap-4 text-xs text-slate-600 dark:text-slate-300">
      {items.map((i) => (
        <span key={i.label} className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full" style={{ background: i.color }} />
          {i.label}
        </span>
      ))}
    </div>
  )
}

export function Sparkline({ data }: { data: number[] }) {
  const { primary } = useChartTheme()
  const points = data.map((value, index) => ({ index, value }))
  return (
    <div className="h-9 w-24" aria-hidden="true">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={points} margin={{ top: 3, right: 1, bottom: 1, left: 1 }}>
          <Area type="monotone" dataKey="value" stroke={primary} strokeWidth={2} fill={primary} fillOpacity={0.12} isAnimationActive={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}
