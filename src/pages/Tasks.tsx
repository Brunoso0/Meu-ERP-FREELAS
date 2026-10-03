import { useMemo, useState } from 'react'
import { DragDropContext, Draggable, Droppable, type DropResult } from '@hello-pangea/dnd'
import { addDays, addWeeks, isBefore, startOfDay, startOfWeek } from 'date-fns'
import { CalendarClock, ChevronLeft, ChevronRight, Kanban, LayoutGrid, List, Plus } from 'lucide-react'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { Avatar, Badge, Button, Card, EmptyState, PageHeader, Segmented, Skeleton } from '@/components/ui/primitives'
import { useTable, useUpdate } from '@/hooks/useData'
import { taskPriority, taskStatus } from '@/lib/labels'
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
  const freelancers = useTable('freelancers')
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

  const tasksOf = (columnId: string) =>
    (tasks.data ?? [])
      .filter((t) => (columnId === BACKLOG ? !t.scheduled_date && t.status !== 'done' : t.scheduled_date === columnId))
      .sort((a, b) => priorityRank[a.priority] - priorityRank[b.priority] || a.created_at.localeCompare(b.created_at))

  const clientTag = (task: Task) => {
    const project = projects.data?.find((p) => p.id === task.project_id)
    const client = clients.data?.find((c) => c.id === project?.client_id)
    return client?.company_name ?? client?.name ?? project?.title ?? null
  }
  const freelancerOf = (id: string | null) => freelancers.data?.find((f) => f.id === id)

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
    {
      header: 'Freelancer',
      cell: (t) => {
        const f = freelancerOf(t.freelancer_id)
        return f ? (
          <span className="inline-flex items-center gap-2">
            <Avatar name={f.name} className="h-6 w-6" /> {f.name}
          </span>
        ) : (
          <span className="text-slate-400">Não alocado</span>
        )
      },
    },
    { header: 'Status', cell: (t) => <Badge tone={taskStatus[t.status].tone}>{taskStatus[t.status].label}</Badge> },
    { header: 'Prioridade', cell: (t) => <Badge tone={taskPriority[t.priority].tone}>{taskPriority[t.priority].label}</Badge> },
    { header: 'Dia', cell: (t) => <span className="tabular text-slate-600 dark:text-slate-300">{formatDate(t.scheduled_date, 'dd/MM')}</span> },
    {
      header: 'Prazo',
      cell: (t) => <span className={cn('tabular', isLate(t) ? 'font-medium text-red-600 dark:text-red-400' : 'text-slate-600 dark:text-slate-300')}>{formatDate(t.due_date, 'dd/MM')}</span>,
    },
    { header: 'Cobrado', className: 'text-right', cell: (t) => <span className="tabular">{formatCurrency(t.charged_amount)}</span> },
    { header: 'Repasse', className: 'text-right', cell: (t) => <span className="tabular text-slate-500 dark:text-slate-400">{formatCurrency(t.cost_amount)}</span> },
  ]

  const newTask = (defaults?: Record<string, unknown>) => openModal({ type: 'task', defaults })
  const empty = !tasks.isLoading && (tasks.data?.length ?? 0) === 0

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
          <DataTable
            columns={tableColumns}
            rows={tasks.data}
            loading={tasks.isLoading}
            pageSize={10}
            onRowClick={(t) => openModal({ type: 'task', record: t })}
            empty={null}
          />
        </Card>
      ) : (
        <>
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
            <div className="grid auto-cols-[minmax(230px,1fr)] grid-flow-col gap-3 overflow-x-auto pb-3">
              {columns.map((col) => {
                const items = tasksOf(col.id)
                return (
                  <div key={col.id} className="flex min-h-[420px] flex-col rounded-xl border bg-slate-100/60 dark:bg-slate-900/50">
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
                            const freelancer = freelancerOf(task.freelancer_id)
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
                                      {freelancer ? <Avatar name={freelancer.name} className="h-6 w-6 text-[10px]" /> : <span className="text-xs text-slate-400">Não alocado</span>}
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
