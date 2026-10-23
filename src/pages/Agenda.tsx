import { useMemo, useState } from 'react'
import { addDays, addMonths, addWeeks, endOfMonth, endOfWeek, format, isSameDay, isSameMonth, setHours, setMinutes, startOfMonth, startOfWeek } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { ChevronLeft, ChevronRight, Plus, Video } from 'lucide-react'
import { ListToolbar } from '@/components/ui/ListToolbar'
import { Button, Card, PageHeader, Segmented, Skeleton } from '@/components/ui/primitives'
import { useTable } from '@/hooks/useData'
import { useListState } from '@/hooks/useListState'
import { matchesSearch } from '@/lib/list'
import { useNarrowScreen } from '@/hooks/useMediaQuery'
import { cn, toDate } from '@/lib/utils'
import { useUI } from '@/store/ui'
import type { EventType } from '@/types/database.types'

interface AgendaItem {
  id: string
  title: string
  date: Date
  time: string | null
  kind: EventType | 'task'
  link: string | null
  open: () => void
}

const kindStyle: Record<AgendaItem['kind'], string> = {
  meeting: 'bg-brand-50 text-brand-700 dark:bg-brand-600/20 dark:text-brand-400',
  deadline: 'bg-red-50 text-red-700 dark:bg-red-950/60 dark:text-red-400',
  review: 'bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-400',
  task: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
}

const kindDot: Record<AgendaItem['kind'], string> = { meeting: 'bg-brand-500', deadline: 'bg-red-500', review: 'bg-amber-500', task: 'bg-slate-400' }
const kindLabel: Record<AgendaItem['kind'], string> = { meeting: 'Reunião', deadline: 'Prazo', review: 'Revisão', task: 'Demanda' }
const WEEK_HEADER = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom']

export default function Agenda() {
  const openModal = useUI((s) => s.openModal)
  const events = useTable('calendar_events')
  const tasks = useTable('tasks')
  const [view, setView] = useState<'month' | 'week'>('month')
  const [cursor, setCursor] = useState(new Date())
  // no celular o mês mostra só pontos; o dia tocado abre a lista embaixo
  const [selected, setSelected] = useState(new Date())
  const narrow = useNarrowScreen()
  const list = useListState('agenda', { search: '', kind: '' })
  const { search, kind } = list.state

  const allItems = useMemo<AgendaItem[]>(() => {
    const fromEvents: AgendaItem[] = (events.data ?? []).map((e) => ({
      id: e.id,
      title: e.title,
      date: toDate(e.start_time),
      time: format(toDate(e.start_time), 'HH:mm'),
      kind: e.event_type,
      link: e.meeting_link,
      open: () => openModal({ type: 'event', record: e }),
    }))
    const fromTasks: AgendaItem[] = (tasks.data ?? [])
      .filter((t) => t.scheduled_date && t.status !== 'done')
      .map((t) => ({
        id: t.id,
        title: t.title,
        date: toDate(t.scheduled_date!),
        time: null,
        kind: 'task' as const,
        link: null,
        open: () => openModal({ type: 'task', record: t }),
      }))
    // demandas (sem horário) primeiro, depois compromissos em ordem de hora
    return [...fromTasks, ...fromEvents.sort((a, b) => a.date.getTime() - b.date.getTime())]
  }, [events.data, tasks.data, openModal])

  const items = useMemo(() => allItems.filter((i) => (!kind || i.kind === kind) && matchesSearch(search, [i.title])), [allItems, kind, search])

  const days = useMemo(() => {
    const start = view === 'month' ? startOfWeek(startOfMonth(cursor), { weekStartsOn: 1 }) : startOfWeek(cursor, { weekStartsOn: 1 })
    const end = view === 'month' ? endOfWeek(endOfMonth(cursor), { weekStartsOn: 1 }) : endOfWeek(cursor, { weekStartsOn: 1 })
    const list: Date[] = []
    for (let d = start; d <= end; d = addDays(d, 1)) list.push(d)
    return list
  }, [cursor, view])

  const move = (step: number) => setCursor(view === 'month' ? addMonths(cursor, step) : addWeeks(cursor, step))
  const goToday = () => {
    setCursor(new Date())
    setSelected(new Date())
  }
  const newEvent = (day: Date) => openModal({ type: 'event', defaults: { start_time: setMinutes(setHours(day, 9), 0).toISOString(), event_type: 'meeting' } })
  const itemsOf = (day: Date) => items.filter((i) => isSameDay(i.date, day))
  const today = new Date()
  const loading = events.isLoading || tasks.isLoading

  const title =
    view === 'month'
      ? format(cursor, "MMMM 'de' yyyy", { locale: ptBR })
      : `${format(days[0], "dd 'de' MMM", { locale: ptBR })} – ${format(days[6], "dd 'de' MMM", { locale: ptBR })}`

  return (
    <>
      <PageHeader
        title="Agenda"
        description="Reuniões, prazos e demandas agendadas no mesmo calendário."
        actions={
          <>
            <Segmented value={view} onChange={setView} options={[{ value: 'month', label: 'Mês' }, { value: 'week', label: 'Semana' }]} />
            <Button onClick={() => newEvent(today)}>
              <Plus className="h-4 w-4" /> Novo compromisso
            </Button>
          </>
        }
      />

      <Card className="mb-3">
        <ListToolbar
          className="border-b-0"
          search={{ value: search, onChange: (v) => list.set('search', v), placeholder: 'Buscar compromisso ou demanda pelo título' }}
          filters={[
            {
              label: 'Filtrar por tipo',
              value: kind,
              onChange: (v) => list.set('kind', v),
              allLabel: 'Todos os tipos',
              options: [
                { value: 'meeting', label: 'Reuniões' },
                { value: 'deadline', label: 'Prazos' },
                { value: 'review', label: 'Revisões' },
                { value: 'task', label: 'Demandas agendadas' },
              ],
            },
          ]}
          count={{ shown: items.length, total: allItems.length, noun: ['item', 'itens'] }}
          filtering={list.filtering}
          onClear={list.reset}
        />
      </Card>

      <div className="mb-3 flex items-center gap-2">
        <Button variant="secondary" size="icon" onClick={() => move(-1)} aria-label="Anterior">
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <Button variant="secondary" size="icon" onClick={() => move(1)} aria-label="Próximo">
          <ChevronRight className="h-4 w-4" />
        </Button>
        <span className="inline-block text-sm font-semibold first-letter:uppercase">{title}</span>
        <Button variant="ghost" size="sm" onClick={goToday}>
          Hoje
        </Button>
      </div>

      {narrow ? (
        <div className="space-y-3">
          {view === 'month' && (
            <Card className="overflow-hidden">
              <div className="grid grid-cols-7 border-b bg-slate-50 dark:bg-slate-900/60">
                {WEEK_HEADER.map((d) => (
                  <div key={d} className="py-2 text-center text-[11px] font-medium uppercase text-slate-500 dark:text-slate-400">
                    {d}
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-7">
                {days.map((day) => {
                  const dayItems = itemsOf(day)
                  const outside = !isSameMonth(day, cursor)
                  const isSelected = isSameDay(day, selected)
                  return (
                    <button
                      key={day.toISOString()}
                      type="button"
                      onClick={() => setSelected(day)}
                      aria-pressed={isSelected}
                      aria-label={format(day, "d 'de' MMMM", { locale: ptBR }) + (dayItems.length ? `, ${dayItems.length} na agenda` : '')}
                      className={cn('flex h-14 flex-col items-center gap-1 border-b border-r pt-1.5 [&:nth-child(7n)]:border-r-0', isSelected && 'bg-brand-50 dark:bg-brand-600/15')}
                    >
                      <span
                        className={cn(
                          'tabular inline-flex h-7 w-7 items-center justify-center rounded-full text-sm font-medium',
                          isSameDay(day, today) ? 'bg-brand-600 text-white' : outside ? 'text-slate-400 dark:text-slate-600' : 'text-slate-700 dark:text-slate-300',
                        )}
                      >
                        {format(day, 'd')}
                      </span>
                      <span className="flex h-1.5 gap-0.5">
                        {dayItems.slice(0, 4).map((item) => (
                          <span key={item.id} className={cn('h-1.5 w-1.5 rounded-full', kindDot[item.kind])} />
                        ))}
                      </span>
                    </button>
                  )
                })}
              </div>
            </Card>
          )}
          {(view === 'month' ? [selected] : days).map((day) => {
            const dayItems = itemsOf(day)
            return (
              <Card key={day.toISOString()}>
                <div className="flex items-center justify-between gap-3 border-b px-4 py-2.5">
                  <p className={cn('text-sm font-semibold first-letter:uppercase', isSameDay(day, today) && 'text-brand-600 dark:text-brand-400')}>
                    {format(day, "EEEE, d 'de' MMM", { locale: ptBR })}
                    {isSameDay(day, today) && <span className="ml-1.5 text-xs font-medium">· hoje</span>}
                  </p>
                  <Button variant="ghost" size="icon" aria-label="Novo compromisso neste dia" onClick={() => newEvent(day)}>
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
                {loading ? (
                  <div className="p-4">
                    <Skeleton className="h-5 w-full" />
                  </div>
                ) : dayItems.length === 0 ? (
                  <p className="px-4 py-3 text-sm text-slate-500 dark:text-slate-400">Nada agendado.</p>
                ) : (
                  <ul>
                    {dayItems.map((item) => (
                      <li key={item.id} className="border-b last:border-0">
                        <button type="button" onClick={item.open} className="flex w-full items-center gap-3 px-4 py-3 text-left active:bg-slate-50 dark:active:bg-slate-800/50">
                          <span className={cn('h-2 w-2 shrink-0 rounded-full', kindDot[item.kind])} />
                          <span className="min-w-0 flex-1">
                            <span className="block text-sm font-medium">{item.title}</span>
                            <span className="tabular block text-xs text-slate-500 dark:text-slate-400">
                              {kindLabel[item.kind]}
                              {item.time && ` · ${item.time}`}
                            </span>
                          </span>
                          {item.link && <Video className="h-4 w-4 shrink-0 text-slate-400" />}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            )
          })}
        </div>
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <div className="min-w-[760px]">
              <div className="grid grid-cols-7 border-b bg-slate-50 dark:bg-slate-900/60">
                {WEEK_HEADER.map((d) => (
                  <div key={d} className="px-3 py-2 text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    {d}
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-7">
                {days.map((day) => {
                  const dayItems = itemsOf(day)
                  const limit = view === 'month' ? 3 : dayItems.length
                  const outside = view === 'month' && !isSameMonth(day, cursor)
                  return (
                    <div
                      key={day.toISOString()}
                      onClick={() => newEvent(day)}
                      className={cn(
                        'group cursor-pointer border-b border-r p-2 transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/40 [&:nth-child(7n)]:border-r-0',
                        view === 'month' ? 'min-h-[118px]' : 'min-h-[420px]',
                        outside && 'bg-slate-50/60 dark:bg-slate-950/40',
                      )}
                    >
                      <div className="mb-1.5 flex items-center justify-between">
                        <span
                          className={cn(
                            'tabular inline-flex h-6 min-w-6 items-center justify-center rounded-full px-1 text-xs font-medium',
                            isSameDay(day, today) ? 'bg-brand-600 text-white' : outside ? 'text-slate-400 dark:text-slate-600' : 'text-slate-700 dark:text-slate-300',
                          )}
                        >
                          {format(day, 'd')}
                        </span>
                        <Plus className="h-3.5 w-3.5 text-slate-400 opacity-0 transition-opacity group-hover:opacity-100" />
                      </div>
                      {loading ? (
                        <Skeleton className="h-5 w-full" />
                      ) : (
                        <div className="space-y-1">
                          {dayItems.slice(0, limit).map((item) => (
                            <button
                              key={item.id}
                              type="button"
                              title={`${kindLabel[item.kind]}: ${item.title}`}
                              onClick={(e) => {
                                e.stopPropagation()
                                item.open()
                              }}
                              className={cn('flex w-full items-center gap-1.5 rounded-md px-1.5 py-1 text-left text-xs font-medium hover:brightness-95', kindStyle[item.kind])}
                            >
                              {item.time && <span className="tabular shrink-0 opacity-75">{item.time}</span>}
                              <span className={cn(view === 'month' ? 'truncate' : 'line-clamp-3')}>{item.title}</span>
                              {item.link && view === 'week' && <Video className="ml-auto h-3 w-3 shrink-0" />}
                            </button>
                          ))}
                          {dayItems.length > limit && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation()
                                setCursor(day)
                                setView('week')
                              }}
                              className="px-1.5 text-xs font-medium text-slate-500 hover:text-brand-600 dark:text-slate-400"
                            >
                              +{dayItems.length - limit} mais
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        </Card>
      )}

      <div className="mt-3 flex flex-wrap gap-3 text-xs text-slate-500 dark:text-slate-400">
        {(Object.keys(kindLabel) as AgendaItem['kind'][]).map((k) => (
          <span key={k} className="inline-flex items-center gap-1.5">
            <span className={cn('h-2 w-2 rounded-full', kindDot[k])} /> {kindLabel[k]}
          </span>
        ))}
      </div>
    </>
  )
}
