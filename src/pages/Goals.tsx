import { useMemo, useState } from 'react'
import { endOfMonth, endOfQuarter, isWithinInterval, startOfMonth, startOfQuarter } from 'date-fns'
import { BarChart3, Pencil, Plus, Target } from 'lucide-react'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { Badge, Button, Card, EmptyState, PageHeader, Segmented, Skeleton } from '@/components/ui/primitives'
import { useTable } from '@/hooks/useData'
import { goalCategory, projectStatus } from '@/lib/labels'
import { cn, formatCurrency, formatDate, sum, toDate } from '@/lib/utils'
import { useUI } from '@/store/ui'
import type { Goal } from '@/types/database.types'

type Period = 'month' | 'quarter' | 'all'

interface ProjectReport {
  id: string
  title: string
  client: string
  status: keyof typeof projectStatus
  charged: number
  freelancers: number
  extras: number
  margin: number
  marginPct: number
}

export default function Goals() {
  const openModal = useUI((s) => s.openModal)
  const goals = useTable('goals')
  const transactions = useTable('financial_transactions')
  const clients = useTable('clients')
  const projects = useTable('projects')
  const tasks = useTable('tasks')
  const [period, setPeriod] = useState<Period>('quarter')

  const visibleGoals = useMemo(() => {
    const now = new Date()
    const range =
      period === 'month'
        ? { start: startOfMonth(now), end: endOfMonth(now) }
        : period === 'quarter'
          ? { start: startOfQuarter(now), end: endOfQuarter(now) }
          : null
    return (goals.data ?? []).filter((g) => !range || (toDate(g.start_date) <= range.end && toDate(g.end_date) >= range.start))
  }, [goals.data, period])

  // progresso = o que o sistema mediu no período + ajuste manual (current_amount)
  const achieved = (g: Goal) => {
    const interval = { start: toDate(g.start_date), end: endOfDayOf(g.end_date) }
    const within = (value: string | null) => !!value && isWithinInterval(new Date(value.length === 10 ? `${value}T12:00:00` : value), interval)
    const measured =
      g.category === 'revenue'
        ? sum((transactions.data ?? []).filter((t) => t.type === 'income' && t.status === 'paid' && within(t.payment_date)).map((t) => t.amount))
        : g.category === 'clients'
          ? (clients.data ?? []).filter((c) => within(c.created_at)).length
          : (projects.data ?? []).filter((p) => within(p.created_at)).length
    return measured + Number(g.current_amount ?? 0)
  }

  const report = useMemo<ProjectReport[]>(() => {
    return (projects.data ?? []).map((p) => {
      const own = (tasks.data ?? []).filter((t) => t.project_id === p.id)
      const billed = sum(own.map((t) => t.charged_amount))
      // sem valores nas demandas, o orçamento do projeto é a melhor estimativa
      const charged = billed > 0 ? billed : Number(p.budget ?? 0)
      const freelancers = sum(own.map((t) => t.cost_amount))
      const extras = sum((transactions.data ?? []).filter((t) => t.project_id === p.id && t.type === 'expense' && !t.freelancer_id).map((t) => t.amount))
      const margin = charged - freelancers - extras
      const client = clients.data?.find((c) => c.id === p.client_id)
      return {
        id: p.id,
        title: p.title,
        client: client ? client.company_name ?? client.name : '—',
        status: p.status,
        charged,
        freelancers,
        extras,
        margin,
        marginPct: charged > 0 ? (margin / charged) * 100 : 0,
      }
    })
  }, [projects.data, tasks.data, transactions.data, clients.data])

  const columns: Column<ProjectReport>[] = [
    {
      header: 'Projeto',
      cell: (r) => (
        <div className="min-w-0">
          <p className="truncate font-medium">{r.title}</p>
          <p className="truncate text-xs text-slate-500 dark:text-slate-400">{r.client}</p>
        </div>
      ),
    },
    { header: 'Status', cell: (r) => <Badge tone={projectStatus[r.status].tone}>{projectStatus[r.status].label}</Badge> },
    { header: 'Cobrado', className: 'text-right', cell: (r) => <span className="tabular">{formatCurrency(r.charged)}</span> },
    { header: 'Freelancers', className: 'text-right', cell: (r) => <span className="tabular text-slate-500 dark:text-slate-400">− {formatCurrency(r.freelancers)}</span> },
    { header: 'Custos extras', className: 'text-right', cell: (r) => <span className="tabular text-slate-500 dark:text-slate-400">− {formatCurrency(r.extras)}</span> },
    {
      header: 'Margem líquida',
      className: 'text-right',
      cell: (r) => (
        <span className={cn('tabular font-semibold', r.margin >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400')}>
          {formatCurrency(r.margin)}
          <span className="ml-2 text-xs font-medium opacity-80">{r.marginPct.toFixed(0)}%</span>
        </span>
      ),
    },
  ]

  const loadingGoals = goals.isLoading || transactions.isLoading
  const newGoal = () => {
    const now = new Date()
    openModal({ type: 'goal', defaults: { category: 'revenue', start_date: formatDate(startOfMonth(now), 'yyyy-MM-dd'), end_date: formatDate(endOfMonth(now), 'yyyy-MM-dd'), current_amount: 0 } })
  }

  const totals = { charged: sum(report.map((r) => r.charged)), margin: sum(report.map((r) => r.margin)) }

  return (
    <>
      <PageHeader
        title="Metas & Relatórios"
        description="Acompanhe o progresso das metas e a margem real de cada projeto."
        actions={
          <>
            <Segmented value={period} onChange={setPeriod} options={[{ value: 'month', label: 'Mês' }, { value: 'quarter', label: 'Trimestre' }, { value: 'all', label: 'Todas' }]} />
            <Button onClick={newGoal}>
              <Plus className="h-4 w-4" /> Nova meta
            </Button>
          </>
        }
      />

      {loadingGoals ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <Skeleton className="h-36" />
          <Skeleton className="h-36" />
          <Skeleton className="h-36" />
        </div>
      ) : visibleGoals.length === 0 ? (
        <Card>
          <EmptyState
            icon={Target}
            title={goals.data?.length ? 'Nenhuma meta neste período' : 'Nenhuma meta definida'}
            description="Defina uma meta de faturamento, clientes ou projetos e o progresso é calculado sozinho."
            action={
              <Button onClick={newGoal}>
                <Plus className="h-4 w-4" /> Nova meta
              </Button>
            }
          />
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {visibleGoals.map((g) => {
            const value = achieved(g)
            const pct = g.target_amount > 0 ? (value / Number(g.target_amount)) * 100 : 0
            const show = (n: number) => (g.category === 'revenue' ? formatCurrency(n) : String(Math.round(n)))
            return (
              <Card key={g.id} className="p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">{g.title}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {goalCategory[g.category]} · {formatDate(g.start_date, 'dd/MM')} a {formatDate(g.end_date, 'dd/MM/yy')}
                    </p>
                  </div>
                  <button
                    type="button"
                    aria-label="Editar meta"
                    onClick={() => openModal({ type: 'goal', record: g })}
                    className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                </div>
                <div className="mt-4 flex items-baseline justify-between gap-2">
                  <p className="tabular text-2xl font-semibold tracking-tight">{show(value)}</p>
                  <p className="tabular text-xs text-slate-500 dark:text-slate-400">de {show(Number(g.target_amount))}</p>
                </div>
                <div
                  className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800"
                  role="progressbar"
                  aria-valuenow={Math.round(pct)}
                  aria-valuemin={0}
                  aria-valuemax={100}
                >
                  <div
                    className={cn('h-full origin-left rounded-full transition-transform duration-700', pct >= 100 ? 'bg-emerald-500' : 'bg-brand-600')}
                    style={{ transform: `scaleX(${Math.min(pct, 100) / 100})` }}
                  />
                </div>
                <p className="tabular mt-2 text-xs font-medium text-slate-600 dark:text-slate-300">
                  {pct.toFixed(0)}% {pct >= 100 ? '· meta batida' : 'da meta'}
                </p>
              </Card>
            )
          })}
        </div>
      )}

      <Card className="mt-6">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-3.5">
          <div>
            <h2 className="text-sm font-semibold">Lucratividade por projeto</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">Valor cobrado − custo de freelancers − custos extras = margem líquida</p>
          </div>
          {report.length > 0 && (
            <p className="tabular text-xs text-slate-500 dark:text-slate-400">
              Margem total <span className="font-semibold text-slate-900 dark:text-slate-100">{formatCurrency(totals.margin)}</span>
              {totals.charged > 0 && ` (${((totals.margin / totals.charged) * 100).toFixed(0)}%)`}
            </p>
          )}
        </div>
        <DataTable
          columns={columns}
          rows={report}
          loading={projects.isLoading || tasks.isLoading}
          empty={<EmptyState icon={BarChart3} title="Sem projetos para analisar" description="O relatório aparece assim que houver projetos com demandas." />}
        />
      </Card>
    </>
  )
}

function endOfDayOf(day: string) {
  const d = toDate(day)
  d.setHours(23, 59, 59, 999)
  return d
}
