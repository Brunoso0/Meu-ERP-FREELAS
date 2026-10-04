import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { addHours, endOfMonth, format, isBefore, isSameDay, isSameMonth, startOfMonth, subMonths } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { CalendarDays, CheckCircle2, TrendingDown, TrendingUp, Video } from 'lucide-react'
import { ChartLegend, ChartTooltip, Sparkline, useChartTheme } from '@/components/charts/theme'
import { Pager, usePagination } from '@/components/ui/Pagination'
import { Badge, Card, EmptyState, PageHeader, Skeleton } from '@/components/ui/primitives'
import { useTable } from '@/hooks/useData'
import { eventType, taskPriority } from '@/lib/labels'
import { cn, formatCompact, formatCurrency, formatDate, safeHttpUrl, sum, toDate } from '@/lib/utils'
import { useUI } from '@/store/ui'

function Kpi({
  label,
  value,
  detail,
  trend,
  spark,
  loading,
}: {
  label: string
  value: string
  detail: string
  trend?: number
  spark: number[]
  loading: boolean
}) {
  return (
    <Card className="p-5">
      <p className="text-sm text-slate-500 dark:text-slate-400">{label}</p>
      {loading ? (
        <Skeleton className="mt-3 h-8 w-32" />
      ) : (
        <div className="mt-2 flex items-end justify-between gap-3">
          <p className="tabular text-2xl font-semibold tracking-tight">{value}</p>
          <Sparkline data={spark} />
        </div>
      )}
      <p className="mt-2 flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
        {trend !== undefined && !loading && (
          <span className={cn('inline-flex items-center gap-0.5 font-medium', trend >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400')}>
            {trend >= 0 ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
            {trend >= 0 ? '+' : ''}
            {trend.toFixed(0)}%
          </span>
        )}
        {detail}
      </p>
    </Card>
  )
}

export default function Dashboard() {
  const chart = useChartTheme()
  const openModal = useUI((s) => s.openModal)
  const transactions = useTable('financial_transactions')
  const tasks = useTable('tasks')
  const proposals = useTable('proposals')
  const events = useTable('calendar_events')
  const projects = useTable('projects')
  const clients = useTable('clients')

  const loading = transactions.isLoading || tasks.isLoading || proposals.isLoading || projects.isLoading

  const data = useMemo(() => {
    const now = new Date()
    const tx = transactions.data ?? []
    const allTasks = tasks.data ?? []
    const income = tx.filter((t) => t.type === 'income')

    const months = Array.from({ length: 6 }, (_, i) => startOfMonth(subMonths(now, 5 - i)))
    const cashflow = months.map((month) => ({
      month: format(month, 'MMM', { locale: ptBR }).replace('.', ''),
      realized: sum(income.filter((t) => t.status === 'paid' && t.payment_date && isSameMonth(toDate(t.payment_date), month)).map((t) => t.amount)),
      projected: sum(income.filter((t) => isSameMonth(toDate(t.due_date), month)).map((t) => t.amount)),
    }))

    const revenue = cashflow[5].realized
    const previous = cashflow[4].realized
    const trend = previous > 0 ? ((revenue - previous) / previous) * 100 : undefined

    const active = allTasks.filter((t) => t.status !== 'done')
    const pending = (proposals.data ?? []).filter((p) => p.status === 'sent' || p.status === 'draft')
    const receivable = income.filter((t) => t.status !== 'paid').sort((a, b) => a.due_date.localeCompare(b.due_date))

    // carga de trabalho: demandas em aberto agrupadas pelo projeto a que pertencem
    const perProject = new Map<string, number>()
    for (const t of active) {
      const title = (projects.data ?? []).find((p) => p.id === t.project_id)?.title ?? 'Sem projeto'
      perProject.set(title, (perProject.get(title) ?? 0) + 1)
    }
    const byProject = [...perProject.entries()]
      .map(([name, demandas]) => ({ name, demandas }))
      .sort((a, b) => b.demandas - a.demandas)
      .slice(0, 6)

    const horizon = addHours(now, 48)
    const critical = active
      .filter((t) => t.due_date && isBefore(toDate(t.due_date), horizon))
      .sort((a, b) => a.due_date!.localeCompare(b.due_date!))

    const today = (events.data ?? [])
      .filter((e) => isSameDay(toDate(e.start_time), now))
      .sort((a, b) => a.start_time.localeCompare(b.start_time))

    const monthEnd = endOfMonth(now)
    return {
      cashflow,
      revenue,
      trend,
      active,
      pending,
      receivable,
      byProject,
      critical,
      today,
      monthLabel: format(monthEnd, "MMMM 'de' yyyy", { locale: ptBR }),
      taskSpark: [0, 1, 2, 3, 4, 5, 6].map((d) => active.filter((t) => t.scheduled_date && toDate(t.scheduled_date).getDay() === d).length),
    }
  }, [transactions.data, tasks.data, proposals.data, projects.data, events.data])

  const criticalPage = usePagination(data.critical)
  const todayPage = usePagination(data.today)

  const projectOf = (id: string | null) => projects.data?.find((p) => p.id === id)
  const clientOf = (projectId: string | null) => clients.data?.find((c) => c.id === projectOf(projectId)?.client_id)

  return (
    <>
      <PageHeader title="Dashboard" description={`Visão geral de ${data.monthLabel}.`} />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi
          label="Faturamento do mês"
          value={formatCurrency(data.revenue)}
          trend={data.trend}
          detail="vs. mês anterior"
          spark={data.cashflow.map((c) => c.realized)}
          loading={loading}
        />
        <Kpi
          label="Demandas ativas"
          value={String(data.active.length)}
          detail={`${data.critical.length} com prazo em 48h`}
          spark={data.taskSpark}
          loading={loading}
        />
        <Kpi
          label="Propostas pendentes"
          value={formatCurrency(sum(data.pending.map((p) => p.total_amount)))}
          detail={`${data.pending.length} em aberto`}
          spark={[0, ...data.pending.map((p) => p.total_amount).reverse()]}
          loading={loading}
        />
        <Kpi
          label="A receber"
          value={formatCurrency(sum(data.receivable.map((t) => t.amount)))}
          detail={`${data.receivable.length} ${data.receivable.length === 1 ? 'lançamento em aberto' : 'lançamentos em aberto'}`}
          spark={[0, ...data.receivable.map((t) => Number(t.amount))]}
          loading={loading}
        />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <Card className="p-5 xl:col-span-2">
          <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold">Fluxo de caixa</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">Entradas dos últimos 6 meses</p>
            </div>
            <ChartLegend items={[{ label: 'Realizadas', color: chart.primary }, { label: 'Projetadas', color: chart.secondary }]} />
          </div>
          {loading ? (
            <Skeleton className="h-64 w-full" />
          ) : (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data.cashflow} margin={{ top: 6, right: 8, bottom: 0, left: 0 }}>
                  <CartesianGrid stroke={chart.grid} vertical={false} />
                  <XAxis dataKey="month" tickLine={false} axisLine={false} tick={{ fill: chart.axis, fontSize: 12 }} />
                  <YAxis tickLine={false} axisLine={false} width={76} tick={{ fill: chart.axis, fontSize: 12 }} tickFormatter={(v: number) => formatCompact(v)} />
                  <Tooltip cursor={{ stroke: chart.axis, strokeDasharray: '3 3' }} content={<ChartTooltip format={formatCurrency} />} />
                  <Area type="monotone" name="Projetadas" dataKey="projected" stroke={chart.secondary} strokeWidth={2} strokeDasharray="5 4" fill="none" dot={false} activeDot={{ r: 4, stroke: chart.surface, strokeWidth: 2 }} />
                  <Area type="monotone" name="Realizadas" dataKey="realized" stroke={chart.primary} strokeWidth={2} fill={chart.primary} fillOpacity={0.1} dot={false} activeDot={{ r: 4, stroke: chart.surface, strokeWidth: 2 }} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>

        <Card className="p-5">
          <h2 className="text-sm font-semibold">Demandas por projeto</h2>
          <p className="mb-4 text-xs text-slate-500 dark:text-slate-400">Demandas em aberto em cada projeto</p>
          {loading ? (
            <Skeleton className="h-64 w-full" />
          ) : data.byProject.length === 0 ? (
            <EmptyState icon={CheckCircle2} title="Nenhuma demanda em aberto" className="py-10" />
          ) : (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.byProject} layout="vertical" margin={{ top: 0, right: 12, bottom: 0, left: 0 }} barCategoryGap="28%">
                  <CartesianGrid stroke={chart.grid} horizontal={false} />
                  <XAxis type="number" allowDecimals={false} tickLine={false} axisLine={false} tick={{ fill: chart.axis, fontSize: 12 }} />
                  <YAxis
                    type="category"
                    dataKey="name"
                    width={112}
                    tickLine={false}
                    axisLine={false}
                    tick={{ fill: chart.axis, fontSize: 12 }}
                    tickFormatter={(name: string) => (name.length > 15 ? `${name.slice(0, 14)}…` : name)}
                  />
                  <Tooltip cursor={{ fill: chart.cursor }} content={<ChartTooltip format={(v) => String(v)} />} />
                  <Bar name="Demandas" dataKey="demandas" fill={chart.primary} radius={[0, 4, 4, 0]} maxBarSize={22} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card>
          <div className="flex items-center justify-between border-b px-5 py-3.5">
            <h2 className="text-sm font-semibold">Demandas críticas (48h)</h2>
            <Link to="/demandas" className="text-xs font-medium text-brand-600 hover:underline dark:text-brand-400">
              Ver kanban
            </Link>
          </div>
          {tasks.isLoading ? (
            <div className="space-y-3 p-5">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : data.critical.length === 0 ? (
            <EmptyState icon={CheckCircle2} title="Nenhum prazo apertado" description="Nada vence nas próximas 48 horas." className="py-10" />
          ) : (
            <ul>
              {criticalPage.visible.map((t) => (
                <li key={t.id}>
                  <button
                    type="button"
                    onClick={() => openModal({ type: 'task', record: t })}
                    className="flex w-full items-center gap-3 border-b px-5 py-3 text-left last:border-0 hover:bg-slate-50 dark:hover:bg-slate-800/50"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{t.title}</span>
                      <span className="block truncate text-xs text-slate-500 dark:text-slate-400">
                        {clientOf(t.project_id)?.company_name ?? projectOf(t.project_id)?.title ?? 'Sem projeto'} · prazo {formatDate(t.due_date, 'dd/MM')}
                      </span>
                    </span>
                    <Badge tone={taskPriority[t.priority].tone}>{taskPriority[t.priority].label}</Badge>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <Pager {...criticalPage} />
        </Card>

        <Card>
          <div className="flex items-center justify-between border-b px-5 py-3.5">
            <h2 className="text-sm font-semibold">Compromissos de hoje</h2>
            <Link to="/agenda" className="text-xs font-medium text-brand-600 hover:underline dark:text-brand-400">
              Abrir agenda
            </Link>
          </div>
          {events.isLoading ? (
            <div className="space-y-3 p-5">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : data.today.length === 0 ? (
            <EmptyState icon={CalendarDays} title="Agenda livre hoje" description="Nenhum compromisso marcado para hoje." className="py-10" />
          ) : (
            <ul>
              {todayPage.visible.map((e) => (
                <li key={e.id} className="flex items-center gap-3 border-b px-5 py-3 last:border-0">
                  <span className="tabular w-12 text-sm font-semibold">{formatDate(e.start_time, 'HH:mm')}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{e.title}</span>
                    <Badge tone={eventType[e.event_type].tone} className="mt-1">
                      {eventType[e.event_type].label}
                    </Badge>
                  </span>
                  {safeHttpUrl(e.meeting_link) && (
                    <a
                      href={safeHttpUrl(e.meeting_link)!}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-medium hover:bg-slate-50 dark:hover:bg-slate-800"
                    >
                      <Video className="h-3.5 w-3.5" /> Entrar
                    </a>
                  )}
                </li>
              ))}
            </ul>
          )}
          <Pager {...todayPage} />
        </Card>
      </div>
    </>
  )
}
