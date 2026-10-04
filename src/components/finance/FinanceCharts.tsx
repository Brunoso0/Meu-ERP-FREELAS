import { useMemo } from 'react'
import { addMonths, differenceInCalendarMonths, format, isSameMonth, startOfMonth } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { BarChart3 } from 'lucide-react'
import { ChartLegend, ChartTooltip, useChartTheme } from '@/components/charts/theme'
import { Card, EmptyState, Skeleton } from '@/components/ui/primitives'
import { formatCompact, formatCurrency, toDate } from '@/lib/utils'
import type { Client, FinancialTransaction } from '@/types/database.types'

interface FinanceChartsProps {
  transactions: FinancialTransaction[]
  clients: Client[]
  /** Período selecionado na tela; null = todo o histórico. */
  range: { start: Date; end: Date } | null
  loading: boolean
}

const MAX_MONTHS = 24
const TOP_CLIENTS = 6

/** Data em que o dinheiro de fato entrou ou saiu. */
const paidOn = (t: FinancialTransaction) => toDate(t.payment_date ?? t.due_date)

/**
 * Gráficos do financeiro. Os dois usam só lançamentos pagos, pela data do
 * pagamento — a mesma base do cartão "Saldo do período".
 */
export function FinanceCharts({ transactions, clients, range, loading }: FinanceChartsProps) {
  const chart = useChartTheme()
  const paid = useMemo(() => transactions.filter((t) => t.status === 'paid'), [transactions])

  const monthly = useMemo(() => {
    // um mês sozinho não mostra tendência: nesse caso exibe os 6 meses até ele
    let first: Date
    let last: Date
    if (!range) {
      const times = paid.map((t) => paidOn(t).getTime())
      if (times.length === 0) return []
      first = startOfMonth(new Date(Math.min(...times)))
      last = startOfMonth(new Date(Math.max(...times)))
    } else {
      last = startOfMonth(range.end)
      first = differenceInCalendarMonths(range.end, range.start) === 0 ? addMonths(last, -5) : startOfMonth(range.start)
    }
    const count = Math.min(MAX_MONTHS, differenceInCalendarMonths(last, first) + 1)
    const spansYears = first.getFullYear() !== last.getFullYear()
    return Array.from({ length: count }, (_, i) => {
      const month = addMonths(last, i - (count - 1))
      const inMonth = paid.filter((t) => isSameMonth(paidOn(t), month))
      const total = (type: FinancialTransaction['type']) => inMonth.filter((t) => t.type === type).reduce((acc, t) => acc + Number(t.amount), 0)
      return {
        month: format(month, spansYears ? 'MMM/yy' : 'MMM', { locale: ptBR }).replace('.', ''),
        income: total('income'),
        expense: total('expense'),
      }
    })
  }, [paid, range])

  const byClient = useMemo(() => {
    const totals = new Map<string, number>()
    for (const t of paid) {
      if (t.type !== 'income') continue
      const day = paidOn(t)
      if (range && (day < range.start || day > range.end)) continue
      const client = clients.find((c) => c.id === t.client_id)
      const name = client ? client.company_name ?? client.name : 'Sem cliente'
      totals.set(name, (totals.get(name) ?? 0) + Number(t.amount))
    }
    const sorted = [...totals.entries()].sort((a, b) => b[1] - a[1])
    const top = sorted.slice(0, TOP_CLIENTS).map(([name, total]) => ({ name, total }))
    const rest = sorted.slice(TOP_CLIENTS).reduce((acc, [, total]) => acc + total, 0)
    return rest > 0 ? [...top, { name: 'Outros', total: rest }] : top
  }, [paid, clients, range])

  const hasMonthly = monthly.some((m) => m.income > 0 || m.expense > 0)
  const singleMonth = !!range && differenceInCalendarMonths(range.end, range.start) === 0

  return (
    <div className="mt-4 grid gap-4 xl:grid-cols-3">
      <Card className="p-5 xl:col-span-2">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold">Entradas e saídas por mês</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {singleMonth ? 'Valores pagos nos 6 meses até o mês selecionado' : 'Valores pagos em cada mês do período'}
            </p>
          </div>
          <ChartLegend items={[{ label: 'Entradas', color: chart.primary }, { label: 'Saídas', color: chart.secondary }]} />
        </div>
        {loading ? (
          <Skeleton className="h-60 w-full" />
        ) : !hasMonthly ? (
          <EmptyState icon={BarChart3} title="Sem pagamentos neste período" description="O gráfico aparece quando houver lançamentos pagos." className="h-60 py-0" />
        ) : (
          <div className="h-60">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={monthly} margin={{ top: 6, right: 8, bottom: 0, left: 0 }} barGap={2} barCategoryGap="24%">
                <CartesianGrid stroke={chart.grid} vertical={false} />
                <XAxis dataKey="month" tickLine={false} axisLine={false} tick={{ fill: chart.axis, fontSize: 12 }} />
                <YAxis tickLine={false} axisLine={false} width={76} tick={{ fill: chart.axis, fontSize: 12 }} tickFormatter={(v: number) => formatCompact(v)} />
                <Tooltip cursor={{ fill: chart.cursor }} content={<ChartTooltip format={formatCurrency} />} />
                <Bar name="Entradas" dataKey="income" fill={chart.primary} radius={[4, 4, 0, 0]} maxBarSize={28} />
                <Bar name="Saídas" dataKey="expense" fill={chart.secondary} radius={[4, 4, 0, 0]} maxBarSize={28} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </Card>

      <Card className="p-5">
        <h2 className="text-sm font-semibold">Recebido por cliente</h2>
        <p className="mb-4 text-xs text-slate-500 dark:text-slate-400">{range ? 'Entradas pagas no período selecionado' : 'Entradas pagas em todo o histórico'}</p>
        {loading ? (
          <Skeleton className="h-60 w-full" />
        ) : byClient.length === 0 ? (
          <EmptyState icon={BarChart3} title="Nada recebido neste período" className="h-60 py-0" />
        ) : (
          <div className="h-60">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={byClient} layout="vertical" margin={{ top: 0, right: 12, bottom: 0, left: 0 }} barCategoryGap="28%">
                <CartesianGrid stroke={chart.grid} horizontal={false} />
                <XAxis type="number" tickLine={false} axisLine={false} tick={{ fill: chart.axis, fontSize: 12 }} tickFormatter={(v: number) => formatCompact(v)} />
                <YAxis
                  type="category"
                  dataKey="name"
                  width={112}
                  tickLine={false}
                  axisLine={false}
                  tick={{ fill: chart.axis, fontSize: 12 }}
                  tickFormatter={(name: string) => (name.length > 15 ? `${name.slice(0, 14)}…` : name)}
                />
                <Tooltip cursor={{ fill: chart.cursor }} content={<ChartTooltip format={formatCurrency} />} />
                <Bar name="Recebido" dataKey="total" fill={chart.primary} radius={[0, 4, 4, 0]} maxBarSize={22} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </Card>
    </div>
  )
}
