import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { addHours, isBefore, startOfDay } from 'date-fns'
import { ArrowDownUp, Bell, FilePlus, Kanban, Moon, Plus, Search, Sun, UserPlus } from 'lucide-react'
import { Button } from '@/components/ui/primitives'
import { Dropdown, DropdownContent, DropdownItem, DropdownLabel, DropdownTrigger, Tip } from '@/components/ui/overlays'
import { useTable } from '@/hooks/useData'
import { pingSupabase } from '@/lib/db'
import { isSupabaseConfigured } from '@/lib/supabase'
import { cn, formatCurrency, formatDate, toDate } from '@/lib/utils'
import { useUI } from '@/store/ui'

function SupabaseStatus() {
  const { data: online, isLoading } = useQuery({
    queryKey: ['supabase-status'],
    queryFn: pingSupabase,
    enabled: isSupabaseConfigured,
    refetchInterval: 60_000,
  })

  const state = !isSupabaseConfigured
    ? { dot: 'bg-amber-500', label: 'Modo demo', tip: 'Supabase não configurado: dados de exemplo salvos neste navegador.' }
    : isLoading
      ? { dot: 'bg-slate-400', label: 'Conectando', tip: 'Verificando conexão com o Supabase…' }
      : online
        ? { dot: 'bg-emerald-500', label: 'Supabase', tip: 'Conectado ao Supabase.' }
        : { dot: 'bg-red-500', label: 'Offline', tip: 'Sem resposta do Supabase. Confira as credenciais e a migração.' }

  return (
    <Tip label={state.tip} side="bottom">
      <span className="hidden h-8 items-center gap-2 rounded-lg border px-2.5 text-xs font-medium text-slate-600 sm:inline-flex dark:text-slate-300">
        <span className={cn('h-2 w-2 rounded-full', state.dot)} />
        {state.label}
      </span>
    </Tip>
  )
}

function Notifications() {
  const navigate = useNavigate()
  const tasks = useTable('tasks').data
  const transactions = useTable('financial_transactions').data

  const items = useMemo(() => {
    const now = new Date()
    const today = startOfDay(now)
    const soon = addHours(now, 48)
    const dueTasks = (tasks ?? [])
      .filter((t) => t.status !== 'done' && t.due_date && isBefore(toDate(t.due_date), soon))
      .map((t) => ({ id: t.id, title: t.title, detail: `Prazo em ${formatDate(t.due_date)}`, to: '/demandas' }))
    const overdue = (transactions ?? [])
      .filter((t) => t.status !== 'paid' && isBefore(toDate(t.due_date), today))
      .map((t) => ({
        id: t.id,
        title: `${t.type === 'income' ? 'Recebimento' : 'Pagamento'} em atraso`,
        detail: `${t.description ?? t.category ?? ''} · ${formatCurrency(t.amount)}`,
        to: '/financeiro',
      }))
    return [...overdue, ...dueTasks]
  }, [tasks, transactions])

  return (
    <Dropdown>
      <DropdownTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Notificações" className="relative">
          <Bell className="h-[18px] w-[18px]" />
          {items.length > 0 && <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-red-500 ring-2 ring-white dark:ring-slate-900" />}
        </Button>
      </DropdownTrigger>
      <DropdownContent className="w-80">
        <DropdownLabel>Notificações</DropdownLabel>
        {items.length === 0 && <p className="px-2.5 pb-3 pt-1 text-sm text-slate-500">Tudo em dia por aqui.</p>}
        {items.slice(0, 10).map((n) => (
          <DropdownItem key={n.id} onSelect={() => navigate(n.to)}>
            <span className="min-w-0">
              <span className="block truncate font-medium">{n.title}</span>
              <span className="block truncate text-xs text-slate-500">{n.detail}</span>
            </span>
          </DropdownItem>
        ))}
      </DropdownContent>
    </Dropdown>
  )
}

export function TopBar() {
  const navigate = useNavigate()
  const { theme, toggleTheme, openModal, setCommandOpen } = useUI()

  return (
    <header className="no-print sticky top-0 z-30 flex h-14 items-center gap-3 border-b bg-white/80 px-4 backdrop-blur md:px-6 dark:bg-slate-900/80">
      <button
        type="button"
        onClick={() => setCommandOpen(true)}
        className="flex h-9 min-w-0 flex-1 items-center sm:max-w-sm gap-2 rounded-lg border bg-slate-50 px-3 text-sm text-slate-400 transition-colors hover:border-slate-300 dark:bg-slate-950/50 dark:hover:border-slate-700"
      >
        <Search className="h-4 w-4" />
        <span className="flex-1 truncate text-left">Buscar clientes, propostas, demandas…</span>
        <kbd className="hidden rounded border bg-white px-1.5 text-[10px] font-medium text-slate-500 sm:inline dark:bg-slate-900">Ctrl K</kbd>
      </button>

      <div className="ml-auto flex shrink-0 items-center gap-1.5">
        <SupabaseStatus />
        <Tip label={theme === 'dark' ? 'Tema claro' : 'Tema escuro'} side="bottom">
          <Button variant="ghost" size="icon" onClick={toggleTheme} aria-label="Alternar tema">
            {theme === 'dark' ? <Sun className="h-[18px] w-[18px]" /> : <Moon className="h-[18px] w-[18px]" />}
          </Button>
        </Tip>
        <Notifications />
        <Dropdown>
          <DropdownTrigger asChild>
            <Button className="ml-1">
              <Plus className="h-4 w-4" /> <span className="hidden sm:inline">Novo</span>
            </Button>
          </DropdownTrigger>
          <DropdownContent>
            <DropdownItem icon={FilePlus} onSelect={() => navigate('/ferramentas/proposta')}>Nova proposta</DropdownItem>
            <DropdownItem icon={Kanban} onSelect={() => openModal({ type: 'task' })}>Nova demanda</DropdownItem>
            <DropdownItem icon={UserPlus} onSelect={() => openModal({ type: 'client' })}>Novo cliente</DropdownItem>
            <DropdownItem icon={ArrowDownUp} onSelect={() => openModal({ type: 'transaction' })}>Nova transação</DropdownItem>
          </DropdownContent>
        </Dropdown>
      </div>
    </header>
  )
}
