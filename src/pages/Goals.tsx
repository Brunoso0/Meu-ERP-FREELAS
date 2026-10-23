import { useMemo, useState } from 'react'
import { endOfMonth, endOfQuarter, isWithinInterval, startOfMonth, startOfQuarter } from 'date-fns'
import { BarChart3, Pencil, Plus, Search, Target } from 'lucide-react'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { ListToolbar } from '@/components/ui/ListToolbar'
import { Pager, usePagination } from '@/components/ui/Pagination'
import { Badge, Button, Card, EmptyState, PageHeader, Segmented, Skeleton } from '@/components/ui/primitives'
import { useTable } from '@/hooks/useData'
import { useListState } from '@/hooks/useListState'
import { goalCategory, projectStatus, toOptions } from '@/lib/labels'
import { matchesSearch, sortPair, sortRows, type SortOption } from '@/lib/list'
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
      // custos = despesas lançadas no financeiro e ligadas a este projeto
      const extras = sum((transactions.data ?? []).filter((t) => t.project_id === p.id && t.type === 'expense').map((t) => t.amount))
      const margin = charged - extras
      const client = clients.data?.find((c) => c.id === p.client_id)
      return {
        id: p.id,
        title: p.title,
        client: client ? client.company_name ?? client.name : '—',
        status: p.status,
        charged,
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
    { header: 'Custos', className: 'text-right', cell: (r) => <span className="tabular text-slate-500 dark:text-slate-400">− {formatCurrency(r.extras)}</span> },
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

  const goalList = useListState('metas', { search: '', category: '', state: '', sort: 'end-asc' })
  const today = new Date()
  const pctOf = (g: Goal) => (Number(g.target_amount) > 0 ? (achieved(g) / Number(g.target_amount)) * 100 : 0)
  const goalSort: SortOption<Goal>[] = [
    ...sortPair<Goal>('end', ['Término mais distante', 'Término mais próximo'], (g) => g.end_date).reverse(),
    ...sortPair<Goal>('progress', ['Mais perto de bater', 'Mais longe de bater'], pctOf),
    ...sortPair<Goal>('start', ['Início mais recente', 'Início mais antigo'], (g) => g.start_date),
    ...sortPair<Goal>('title', ['Nome Z–A', 'Nome A–Z'], (g) => g.title).reverse(),
  ]
  const shownGoals = sortRows(
    visibleGoals.filter((g) => {
      const pct = pctOf(g)
      const ended = endOfDayOf(g.end_date) < today
      const { search, category, state } = goalList.state
      return (
        (!category || g.category === category) &&
        (!state || (state === 'hit' ? pct >= 100 : state === 'missed' ? ended && pct < 100 : !ended && pct < 100)) &&
        matchesSearch(search, [g.title, goalCategory[g.category]])
      )
    }),
    goalSort,
    goalList.state.sort,
  )
  const goalPage = usePagination(shownGoals, 9)

  const goalCard = (g: Goal) => {
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
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800" role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}>
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
  }

  // lucratividade por projeto
  const reportList = useListState('lucratividade', { search: '', status: '', result: '', sort: 'margin-desc' })
  const reportSort: SortOption<ProjectReport>[] = [
    ...sortPair<ProjectReport>('margin', ['Maior margem', 'Menor margem'], (r) => r.margin),
    ...sortPair<ProjectReport>('marginPct', ['Maior margem %', 'Menor margem %'], (r) => r.marginPct),
    ...sortPair<ProjectReport>('charged', ['Maior valor cobrado', 'Menor valor cobrado'], (r) => r.charged),
    ...sortPair<ProjectReport>('extras', ['Maiores custos', 'Menores custos'], (r) => r.extras),
    ...sortPair<ProjectReport>('title', ['Projeto Z–A', 'Projeto A–Z'], (r) => r.title).reverse(),
  ]
  const reportRows = sortRows(
    report.filter((r) => {
      const { search, status, result } = reportList.state
      return (
        (!status || r.status === status) &&
        (!result || (result === 'loss' ? r.margin < 0 : result === 'costs' ? r.extras > 0 : r.extras === 0)) &&
        matchesSearch(search, [r.title, r.client])
      )
    }),
    reportSort,
    reportList.state.sort,
  )
  const newGoal = () => {
    const now = new Date()
    openModal({ type: 'goal', defaults: { category: 'revenue', start_date: formatDate(startOfMonth(now), 'yyyy-MM-dd'), end_date: formatDate(endOfMonth(now), 'yyyy-MM-dd'), current_amount: 0 } })
  }

  const totals = { charged: sum(report.map((r) => r.charged)), margin: sum(report.map((r) => r.margin)) }

  return (
    <>
      <PageHeader
        title="Metas & Relatórios"
        description="Acompanhe o progresso das metas e quanto sobra de cada projeto."
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
      ) : visibleGoals.length > 0 || goalList.filtering ? (
        <>
          <Card className="mb-4">
            <ListToolbar
              className="border-b-0"
              search={{ value: goalList.state.search, onChange: (v) => goalList.set('search', v), placeholder: 'Buscar meta pelo nome' }}
              filters={[
                { label: 'Filtrar por tipo de meta', value: goalList.state.category, onChange: (v) => goalList.set('category', v), allLabel: 'Todos os tipos', options: (Object.keys(goalCategory) as Array<keyof typeof goalCategory>).map((k) => ({ value: k, label: goalCategory[k] })) },
                {
                  label: 'Filtrar por situação da meta',
                  value: goalList.state.state,
                  onChange: (v) => goalList.set('state', v),
                  allLabel: 'Todas as situações',
                  options: [
                    { value: 'ongoing', label: 'Em andamento' },
                    { value: 'hit', label: 'Batidas' },
                    { value: 'missed', label: 'Encerradas sem bater' },
                  ],
                },
              ]}
              sort={{ value: goalList.state.sort, onChange: (v) => goalList.set('sort', v), options: goalSort }}
              count={{ shown: shownGoals.length, total: visibleGoals.length, noun: ['meta', 'metas'] }}
              filtering={goalList.filtering}
              onClear={goalList.reset}
            />
          </Card>
          {shownGoals.length === 0 ? (
            <Card>
              <EmptyState
                icon={Search}
                title="Nenhuma meta encontrada"
                description="Ajuste a busca ou os filtros, ou escolha outro período."
                action={
                  <Button variant="secondary" onClick={goalList.reset}>
                    Limpar filtros
                  </Button>
                }
              />
            </Card>
          ) : (
            <>
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{goalPage.visible.map(goalCard)}</div>
              <Pager {...goalPage} className="mt-2 border-t-0 px-0" />
            </>
          )}
        </>
      ) : (
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
      )}

      <Card className="mt-6">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-3.5">
          <div>
            <h2 className="text-sm font-semibold">Lucratividade por projeto</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">Valor cobrado − despesas ligadas ao projeto = margem líquida</p>
          </div>
          {report.length > 0 && (
            <p className="tabular text-xs text-slate-500 dark:text-slate-400">
              Margem total <span className="font-semibold text-slate-900 dark:text-slate-100">{formatCurrency(totals.margin)}</span>
              {totals.charged > 0 && ` (${((totals.margin / totals.charged) * 100).toFixed(0)}%)`}
            </p>
          )}
        </div>
        {report.length > 0 && (
          <ListToolbar
            search={{ value: reportList.state.search, onChange: (v) => reportList.set('search', v), placeholder: 'Buscar por projeto ou cliente' }}
            filters={[
              { label: 'Filtrar projetos por status', value: reportList.state.status, onChange: (v) => reportList.set('status', v), allLabel: 'Todos os status', options: toOptions(projectStatus) },
              {
                label: 'Filtrar por resultado',
                value: reportList.state.result,
                onChange: (v) => reportList.set('result', v),
                allLabel: 'Qualquer resultado',
                options: [
                  { value: 'loss', label: 'Com prejuízo' },
                  { value: 'costs', label: 'Com custos lançados' },
                  { value: 'no-costs', label: 'Sem custos lançados' },
                ],
              },
            ]}
            sort={{ value: reportList.state.sort, onChange: (v) => reportList.set('sort', v), options: reportSort }}
            count={{ shown: reportRows.length, total: report.length, noun: ['projeto', 'projetos'] }}
            filtering={reportList.filtering}
            onClear={reportList.reset}
          />
        )}
        <DataTable
          columns={columns}
          rows={reportRows}
          loading={projects.isLoading || tasks.isLoading}
          empty={
            report.length > 0 ? (
              <EmptyState
                icon={Search}
                title="Nenhum projeto encontrado"
                description="Ajuste a busca ou os filtros."
                action={
                  <Button variant="secondary" onClick={reportList.reset}>
                    Limpar filtros
                  </Button>
                }
              />
            ) : (
              <EmptyState icon={BarChart3} title="Sem projetos para analisar" description="O relatório aparece assim que houver projetos com demandas." />
            )
          }
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
