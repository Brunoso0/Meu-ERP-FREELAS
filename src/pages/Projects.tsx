import { useMemo } from 'react'
import { addDays, startOfDay } from 'date-fns'
import { Briefcase, Plus, Search } from 'lucide-react'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { ListToolbar } from '@/components/ui/ListToolbar'
import { Badge, Button, Card, EmptyState, PageHeader } from '@/components/ui/primitives'
import { useTable } from '@/hooks/useData'
import { useListState } from '@/hooks/useListState'
import { projectStatus, toOptions } from '@/lib/labels'
import { linkOptions, matchesSearch, sortPair, sortRows, type SortOption } from '@/lib/list'
import { cn, formatCurrency, formatDate, toDate } from '@/lib/utils'
import { useUI } from '@/store/ui'
import type { Project } from '@/types/database.types'

/** Projeto que ainda está em andamento (não concluído nem cancelado). */
const isOpen = (p: Project) => p.status !== 'completed' && p.status !== 'cancelled'

export default function Projects() {
  const openModal = useUI((s) => s.openModal)
  const projects = useTable('projects')
  const clients = useTable('clients')
  const tasks = useTable('tasks')
  const list = useListState('projetos', { search: '', status: 'open', client: '', deadline: '', sort: 'deadline-asc' })
  const { search, status, client, deadline, sort } = list.state

  const clientName = (id: string | null) => {
    const c = clients.data?.find((x) => x.id === id)
    return c ? c.company_name ?? c.name : '—'
  }

  const progress = (id: string) => {
    const own = (tasks.data ?? []).filter((t) => t.project_id === id)
    return { done: own.filter((t) => t.status === 'done').length, total: own.length }
  }
  const progressPct = (p: Project) => {
    const { done, total } = progress(p.id)
    return total ? done / total : 0
  }

  const today = startOfDay(new Date())
  const isLate = (p: Project) => isOpen(p) && !!p.deadline && toDate(p.deadline) < today

  const sortOptions: SortOption<Project>[] = [
    ...sortPair<Project>('deadline', ['Prazo mais distante', 'Prazo mais próximo'], (p) => p.deadline).reverse(),
    ...sortPair<Project>('created', ['Mais recentes', 'Mais antigos'], (p) => p.created_at),
    ...sortPair<Project>('budget', ['Maior orçamento', 'Menor orçamento'], (p) => Number(p.budget ?? 0)),
    ...sortPair<Project>('progress', ['Mais adiantados', 'Menos adiantados'], progressPct),
    ...sortPair<Project>('title', ['Título Z–A', 'Título A–Z'], (p) => p.title).reverse(),
  ]

  const rows = useMemo(() => {
    const week = addDays(today, 7)
    const month = addDays(today, 30)
    const filtered = (projects.data ?? []).filter((p) => {
      const due = p.deadline ? toDate(p.deadline) : null
      return (
        (!status || (status === 'open' ? isOpen(p) : p.status === status)) &&
        (!client || (client === 'none' ? !p.client_id : p.client_id === client)) &&
        (!deadline ||
          (deadline === 'late'
            ? isLate(p)
            : deadline === 'none'
              ? !due
              : !!due && isOpen(p) && due >= today && due <= (deadline === 'week' ? week : month))) &&
        matchesSearch(search, [p.title, p.description, clientName(p.client_id)])
      )
    })
    return sortRows(filtered, sortOptions, sort)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projects.data, clients.data, tasks.data, search, status, client, deadline, sort])

  const columns: Column<Project>[] = [
    {
      header: 'Projeto',
      cell: (p) => (
        <div className="min-w-0">
          <p className="truncate font-medium">{p.title}</p>
          <p className="truncate text-xs text-slate-500 dark:text-slate-400">{clientName(p.client_id)}</p>
        </div>
      ),
    },
    { header: 'Status', cell: (p) => <Badge tone={projectStatus[p.status].tone}>{projectStatus[p.status].label}</Badge> },
    {
      header: 'Demandas',
      priority: 2,
      cell: (p) => {
        const { done, total } = progress(p.id)
        return (
          <div className="flex items-center gap-2.5">
            <div className="h-1.5 w-24 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
              <div className="h-full rounded-full bg-brand-600" style={{ width: `${total ? (done / total) * 100 : 0}%` }} />
            </div>
            <span className="tabular text-xs text-slate-500 dark:text-slate-400">
              {done}/{total}
            </span>
          </div>
        )
      },
    },
    {
      header: 'Prazo',
      cell: (p) => <span className={cn('tabular', isLate(p) ? 'font-medium text-red-600 dark:text-red-400' : 'text-slate-600 dark:text-slate-300')}>{formatDate(p.deadline)}</span>,
    },
    { header: 'Orçamento', className: 'text-right', cell: (p) => <span className="tabular font-medium">{formatCurrency(p.budget)}</span> },
  ]

  const action = (
    <Button onClick={() => openModal({ type: 'project' })}>
      <Plus className="h-4 w-4" /> Novo projeto
    </Button>
  )

  return (
    <>
      <PageHeader title="Projetos" description="Cada projeto é um trabalho para um cliente. Ao marcá-lo como concluído, o recebimento é lançado sozinho no financeiro." actions={action} />
      <Card>
        <ListToolbar
          search={{ value: search, onChange: (v) => list.set('search', v), placeholder: 'Buscar por projeto, descrição ou cliente' }}
          filters={[
            {
              label: 'Filtrar por status',
              value: status,
              onChange: (v) => list.set('status', v),
              allLabel: 'Todos os status',
              options: [{ value: 'open', label: 'Em aberto (não concluídos)' }, ...toOptions(projectStatus)],
            },
            { label: 'Filtrar por cliente', value: client, onChange: (v) => list.set('client', v), allLabel: 'Todos os clientes', options: linkOptions((projects.data ?? []).map((p) => p.client_id), clientName, 'Sem cliente') },
            {
              label: 'Filtrar por prazo',
              value: deadline,
              onChange: (v) => list.set('deadline', v),
              allLabel: 'Qualquer prazo',
              options: [
                { value: 'late', label: 'Atrasados' },
                { value: 'week', label: 'Vencem em 7 dias' },
                { value: 'month', label: 'Vencem em 30 dias' },
                { value: 'none', label: 'Sem prazo' },
              ],
            },
          ]}
          sort={{ value: sort, onChange: (v) => list.set('sort', v), options: sortOptions }}
          count={{ shown: rows.length, total: projects.data?.length ?? 0, noun: ['projeto', 'projetos'] }}
          filtering={list.filtering}
          onClear={list.reset}
        />
        <DataTable
          columns={columns}
          rows={rows}
          loading={projects.isLoading}
          onRowClick={(p) => openModal({ type: 'project', record: p })}
          empty={
            (projects.data?.length ?? 0) > 0 ? (
              <EmptyState
                icon={Search}
                title="Nenhum projeto encontrado"
                description={status === 'open' && !search && !client && !deadline ? 'Todos os projetos estão concluídos ou cancelados.' : 'Ajuste a busca ou os filtros.'}
                action={
                  <Button variant="secondary" onClick={() => (list.filtering ? list.reset() : list.set('status', ''))}>
                    {list.filtering ? 'Limpar filtros' : 'Ver todos'}
                  </Button>
                }
              />
            ) : (
              <EmptyState icon={Briefcase} title="Nenhum projeto ainda" description="Crie um projeto para organizar demandas e acompanhar a lucratividade." action={action} />
            )
          }
        />
      </Card>
    </>
  )
}
