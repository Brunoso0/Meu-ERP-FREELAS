import { useMemo, useState } from 'react'
import { DragDropContext, Draggable, Droppable, type DropResult } from '@hello-pangea/dnd'
import { addDays, addWeeks, isBefore, startOfDay, startOfWeek } from 'date-fns'
import { CalendarClock, ChevronLeft, ChevronRight, Kanban, LayoutGrid, List, Plus, Search } from 'lucide-react'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { ListToolbar } from '@/components/ui/ListToolbar'
import { Badge, Button, Card, EmptyState, PageHeader, Segmented, Skeleton } from '@/components/ui/primitives'
import { useTable, useUpdate } from '@/hooks/useData'
import { useListState } from '@/hooks/useListState'
import { taskPriority, taskStatus, toOptions } from '@/lib/labels'
import { linkOptions, matchesSearch, sortPair, sortRows, type SortOption } from '@/lib/list'
import { cn, formatCurrency, formatDate, isoDay, toDate } from '@/lib/utils'
import { useUI } from '@/store/ui'
import type { Task, TaskPriority } from '@/types/database.types'

const WEEKDAYS = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta']
const priorityRank: Record<TaskPriority, number> = { urgent: 0, high: 1, medium: 2, low: 3 }
const BACKLOG = 'backlog'

export default function Tasks() {
  const openModal = useUI((s) => s.openModal)
  const tasks = useTable('tasks')
  const projects = useTable('projects')
  const clients = useTable('clients')
  const update = useUpdate('tasks')
  const [view, setView] = useState<'kanban' | 'table'>('kanban')
  const [weekOffset, setWeekOffset] = useState(0)

  const monday = useMemo(() => startOfWeek(addWeeks(new Date(), weekOffset), { weekStartsOn: 1 }), [weekOffset])
  const today = isoDay(new Date())

  const columns = useMemo(
    () => [
      { id: BACKLOG, title: 'Backlog', sub: 'Sem dia definido' },
      ...WEEKDAYS.map((title, i) => {
        const day = addDays(monday, i)
        return { id: isoDay(day), title, sub: formatDate(day, 'dd/MM') }
      }),
    ],
    [monday],
  )

  const clientTag = (task: Task) => {
    const project = projects.data?.find((p) => p.id === task.project_id)
    const client = clients.data?.find((c) => c.id === project?.client_id)
    return client?.company_name ?? client?.name ?? project?.title ?? null
  }
  const projectTitle = (id: string) => projects.data?.find((p) => p.id === id)?.title ?? 'Projeto removido'

  // busca, projeto, prioridade e prazo valem no kanban e na tabela; status e ordenação, só na tabela
  const list = useListState('demandas', { search: '', project: '', priority: '', due: '', status: 'open', sort: 'due-asc' })
  const { search, project, priority, due, status, sort } = list.state
  const isLateTask = (t: Task) => t.status !== 'done' && !!t.due_date && t.due_date < today

  const filtered = useMemo(() => {
    const weekEnd = isoDay(addDays(new Date(), 7))
    return (tasks.data ?? []).filter((t) => {
      const p = projects.data?.find((x) => x.id === t.project_id)
      return (
        (!project || (project === 'none' ? !t.project_id : t.project_id === project)) &&
        (!priority || t.priority === priority) &&
        (!due ||
          (due === 'late'
            ? isLateTask(t)
            : due === 'today'
              ? t.due_date === today
              : due === 'week'
                ? !!t.due_date && t.due_date >= today && t.due_date <= weekEnd
                : !t.due_date)) &&
        matchesSearch(search, [t.title, t.description, p?.title, clientTag(t)])
      )
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tasks.data, projects.data, clients.data, search, project, priority, due, today])

  const sortOptions: SortOption<Task>[] = [
    ...sortPair<Task>('due', ['Prazo mais distante', 'Prazo mais próximo'], (t) => t.due_date).reverse(),
    ...sortPair<Task>('priority', ['Prioridade mais alta', 'Prioridade mais baixa'], (t) => 3 - priorityRank[t.priority]),
    ...sortPair<Task>('scheduled', ['Dia mais distante', 'Dia mais próximo'], (t) => t.scheduled_date).reverse(),
    ...sortPair<Task>('created', ['Mais recentes', 'Mais antigas'], (t) => t.created_at),
    ...sortPair<Task>('amount', ['Maior valor', 'Menor valor'], (t) => Number(t.charged_amount ?? 0)),
  ]
  const tableRows = useMemo(
    () => sortRows(filtered.filter((t) => !status || (status === 'open' ? t.status !== 'done' : t.status === status)), sortOptions, sort),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [filtered, status, sort],
  )

  const tasksOf = (columnId: string) =>
    filtered
      .filter((t) => (columnId === BACKLOG ? !t.scheduled_date && t.status !== 'done' : t.scheduled_date === columnId))
      .sort((a, b) => priorityRank[a.priority] - priorityRank[b.priority] || a.created_at.localeCompare(b.created_at))

  const onDragEnd = ({ destination, source, draggableId }: DropResult) => {
    if (!destination || destination.droppableId === source.droppableId) return
    const task = tasks.data?.find((t) => t.id === draggableId)
    if (!task) return
    // sair do backlog coloca a demanda em andamento; voltar para ele tira o dia
    const patch: Partial<Task> =
      destination.droppableId === BACKLOG
        ? { scheduled_date: null, status: 'backlog' }
        : { scheduled_date: destination.droppableId, status: task.status === 'backlog' ? 'in_progress' : task.status }
    update.mutate({ id: task.id, patch })
  }

  const isLate = (t: Task) => t.status !== 'done' && !!t.due_date && isBefore(toDate(t.due_date), startOfDay(new Date()))

  const tableColumns: Column<Task>[] = [
    {
      header: 'Demanda',
      cell: (t) => (
        <div className="min-w-0">
          <p className="truncate font-medium">{t.title}</p>
          <p className="truncate text-xs text-slate-500 dark:text-slate-400">{clientTag(t) ?? 'Sem projeto'}</p>
        </div>
      ),
    },
    { header: 'Status', cell: (t) => <Badge tone={taskStatus[t.status].tone}>{taskStatus[t.status].label}</Badge> },
    { header: 'Prioridade', priority: 2, cell: (t) => <Badge tone={taskPriority[t.priority].tone}>{taskPriority[t.priority].label}</Badge> },
    { header: 'Dia', priority: 3, cell: (t) => <span className="tabular text-slate-600 dark:text-slate-300">{formatDate(t.scheduled_date, 'dd/MM')}</span> },
    {
      header: 'Prazo',
      cell: (t) => <span className={cn('tabular', isLate(t) ? 'font-medium text-red-600 dark:text-red-400' : 'text-slate-600 dark:text-slate-300')}>{formatDate(t.due_date, 'dd/MM')}</span>,
    },
    { header: 'Valor', className: 'text-right', cell: (t) => <span className="tabular">{formatCurrency(t.charged_amount)}</span> },
  ]

  const newTask = (defaults?: Record<string, unknown>) => openModal({ type: 'task', defaults })
  const empty = !tasks.isLoading && (tasks.data?.length ?? 0) === 0
  const filterBar = (
    <ListToolbar
      search={{ value: search, onChange: (v) => list.set('search', v), placeholder: 'Buscar por demanda, projeto ou cliente' }}
      filters={[
        { label: 'Filtrar por projeto', value: project, onChange: (v) => list.set('project', v), allLabel: 'Todos os projetos', options: linkOptions((tasks.data ?? []).map((t) => t.project_id), projectTitle, 'Sem projeto') },
        { label: 'Filtrar por prioridade', value: priority, onChange: (v) => list.set('priority', v), allLabel: 'Todas as prioridades', options: toOptions(taskPriority).reverse() },
        {
          label: 'Filtrar por prazo',
          value: due,
          onChange: (v) => list.set('due', v),
          allLabel: 'Qualquer prazo',
          options: [
            { value: 'late', label: 'Atrasadas' },
            { value: 'today', label: 'Vencem hoje' },
            { value: 'week', label: 'Vencem em 7 dias' },
            { value: 'none', label: 'Sem prazo' },
          ],
        },
        ...(view === 'table'
          ? [{ label: 'Filtrar por status', value: status, onChange: (v: string) => list.set('status', v), allLabel: 'Todos os status', options: [{ value: 'open', label: 'Em aberto (não concluídas)' }, ...toOptions(taskStatus)] }]
          : []),
      ]}
      sort={view === 'table' ? { value: sort, onChange: (v) => list.set('sort', v), options: sortOptions } : undefined}
      count={view === 'table' ? { shown: tableRows.length, total: tasks.data?.length ?? 0, noun: ['demanda', 'demandas'] } : { shown: filtered.length, total: tasks.data?.length ?? 0, noun: ['demanda', 'demandas'] }}
      filtering={view === 'table' ? list.filtering : !!(search || project || priority || due)}
      onClear={list.reset}
    />
  )

  return (
    <>
      <PageHeader
        title="Demandas"
        description="Arraste os cards entre os dias para planejar a semana."
        actions={
          <>
            <Segmented
              value={view}
              onChange={setView}
              options={[
                { value: 'kanban', label: 'Kanban', icon: LayoutGrid },
                { value: 'table', label: 'Tabela', icon: List },
              ]}
            />
            <Button onClick={() => newTask()}>
              <Plus className="h-4 w-4" /> Nova demanda
            </Button>
          </>
        }
      />

      {empty ? (
        <Card>
          <EmptyState
            icon={Kanban}
            title="Nenhuma demanda ainda"
            description="Crie a primeira demanda e arraste para o dia em que ela será feita."
            action={
              <Button onClick={() => newTask()}>
                <Plus className="h-4 w-4" /> Nova demanda
              </Button>
            }
          />
        </Card>
      ) : view === 'table' ? (
        <Card>
          {filterBar}
          <DataTable
            columns={tableColumns}
            rows={tableRows}
            loading={tasks.isLoading}
            pageSize={10}
            onRowClick={(t) => openModal({ type: 'task', record: t })}
            empty={
              <EmptyState
                icon={Search}
                title="Nenhuma demanda encontrada"
                description={list.filtering ? 'Ajuste a busca ou os filtros.' : 'Todas as demandas estão concluídas.'}
                action={
                  <Button variant="secondary" onClick={() => (list.filtering ? list.reset() : list.set('status', ''))}>
                    {list.filtering ? 'Limpar filtros' : 'Ver todas'}
                  </Button>
                }
              />
            }
          />
        </Card>
      ) : (
        <>
          <Card className="mb-3">{filterBar}</Card>
          <div className="mb-3 flex items-center gap-2">
            <Button variant="secondary" size="icon" onClick={() => setWeekOffset(weekOffset - 1)} aria-label="Semana anterior">
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="secondary" size="icon" onClick={() => setWeekOffset(weekOffset + 1)} aria-label="Próxima semana">
              <ChevronRight className="h-4 w-4" />
            </Button>
            <span className="tabular text-sm font-medium">
              {formatDate(monday, "dd 'de' MMM")} – {formatDate(addDays(monday, 4), "dd 'de' MMM")}
            </span>
            {weekOffset !== 0 && (
              <Button variant="ghost" size="sm" onClick={() => setWeekOffset(0)}>
                Esta semana
              </Button>
            )}
          </div>

          <DragDropContext onDragEnd={onDragEnd}>
            <div className="grid snap-x snap-mandatory auto-cols-[85%] grid-flow-col gap-3 overflow-x-auto pb-3 sm:snap-none sm:auto-cols-[minmax(230px,1fr)]">
              {columns.map((col) => {
                const items = tasksOf(col.id)
                return (
                  <div key={col.id} className="flex min-h-[420px] snap-start flex-col rounded-xl border bg-slate-100/60 dark:bg-slate-900/50">
                    <div className="flex items-center justify-between px-3 pb-2 pt-3">
                      <div>
                        <p className={cn('text-sm font-semibold', col.id === today && 'text-brand-600 dark:text-brand-400')}>
                          {col.title}
                          {col.id === today && <span className="ml-1.5 text-xs font-medium">· hoje</span>}
                        </p>
                        <p className="tabular text-xs text-slate-500 dark:text-slate-400">{col.sub}</p>
                      </div>
                      <div className="flex items-center gap-1">
                        <span className="tabular rounded-md bg-white px-1.5 py-0.5 text-xs font-medium text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                          {items.length}
                        </span>
                        <button
                          type="button"
                          aria-label={`Nova demanda em ${col.title}`}
                          onClick={() => newTask(col.id === BACKLOG ? { status: 'backlog' } : { scheduled_date: col.id, status: 'in_progress' })}
                          className="rounded-md p-1 text-slate-400 hover:bg-white hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                        >
                          <Plus className="h-4 w-4" />
                        </button>
                      </div>
                    </div>

                    <Droppable droppableId={col.id}>
                      {(provided, snapshot) => (
                        <div
                          ref={provided.innerRef}
                          {...provided.droppableProps}
                          className={cn('flex-1 space-y-2 rounded-b-xl p-2 transition-colors', snapshot.isDraggingOver && 'bg-brand-50 dark:bg-brand-600/10')}
                        >
                          {tasks.isLoading && <Skeleton className="h-20 w-full" />}
                          {items.map((task, index) => {
                            const tag = clientTag(task)
                            return (
                              <Draggable key={task.id} draggableId={task.id} index={index}>
                                {(drag, dragSnapshot) => (
                                  <div
                                    ref={drag.innerRef}
                                    {...drag.draggableProps}
                                    {...drag.dragHandleProps}
                                    onClick={() => openModal({ type: 'task', record: task })}
                                    className={cn(
                                      'cursor-grab rounded-lg border bg-white p-3 text-left shadow-sm transition-shadow dark:bg-slate-900',
                                      dragSnapshot.isDragging && 'shadow-lg ring-2 ring-brand-500/40',
                                      task.status === 'done' && 'opacity-60',
                                    )}
                                  >
                                    <div className="mb-2 flex items-center justify-between gap-2">
                                      {tag ? <Badge tone="indigo" className="max-w-[130px] truncate">{tag}</Badge> : <span />}
                                      <Badge tone={taskPriority[task.priority].tone}>{taskPriority[task.priority].label}</Badge>
                                    </div>
                                    <p className={cn('text-sm font-medium leading-snug', task.status === 'done' && 'line-through')}>{task.title}</p>
                                    <div className="mt-3 flex items-center justify-between">
                                      <span className={cn('tabular inline-flex items-center gap-1 text-xs', isLate(task) ? 'font-medium text-red-600 dark:text-red-400' : 'text-slate-500 dark:text-slate-400')}>
                                        <CalendarClock className="h-3.5 w-3.5" />
                                        {task.due_date ? formatDate(task.due_date, 'dd/MM') : 'Sem prazo'}
                                      </span>
                                      {Number(task.charged_amount) > 0 && <span className="tabular text-xs font-medium text-slate-600 dark:text-slate-300">{formatCurrency(task.charged_amount)}</span>}
                                    </div>
                                  </div>
                                )}
                              </Draggable>
                            )
                          })}
                          {provided.placeholder}
                        </div>
                      )}
                    </Droppable>
                  </div>
                )
              })}
            </div>
          </DragDropContext>
        </>
      )}
    </>
  )
}
