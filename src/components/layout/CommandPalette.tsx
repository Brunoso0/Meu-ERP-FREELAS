import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import * as Dialog from '@radix-ui/react-dialog'
import { CornerDownLeft, FileText, Kanban, Search, Users, type LucideIcon } from 'lucide-react'
import { useTable } from '@/hooks/useData'
import { cn, formatProposalNumber } from '@/lib/utils'
import { useUI } from '@/store/ui'
import { mainNav, toolsNav } from './nav'

interface Result {
  id: string
  label: string
  hint: string
  icon: LucideIcon
  run: () => void
}

const normalize = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

export function CommandPalette() {
  const { commandOpen, setCommandOpen, openModal } = useUI()
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)

  const clients = useTable('clients').data
  const proposals = useTable('proposals').data
  const tasks = useTable('tasks').data

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setCommandOpen(!useUI.getState().commandOpen)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [setCommandOpen])

  useEffect(() => {
    if (commandOpen) {
      setQuery('')
      setActive(0)
    }
  }, [commandOpen])

  const results = useMemo<Result[]>(() => {
    const all: Result[] = [
      ...[...mainNav, ...toolsNav].map((n) => ({ id: `nav-${n.to}`, label: n.label, hint: 'Ir para', icon: n.icon, run: () => navigate(n.to) })),
      ...(clients ?? []).map((c) => ({
        id: `client-${c.id}`,
        label: c.company_name ? `${c.name} — ${c.company_name}` : c.name,
        hint: 'Cliente',
        icon: Users,
        run: () => {
          navigate('/clientes')
          openModal({ type: 'client', record: c })
        },
      })),
      ...(proposals ?? []).map((p) => ({
        id: `proposal-${p.id}`,
        label: `${formatProposalNumber(p.proposal_number)} ${p.title}`,
        hint: 'Proposta',
        icon: FileText,
        run: () => navigate(`/propostas/${p.id}`),
      })),
      ...(tasks ?? []).map((t) => ({
        id: `task-${t.id}`,
        label: t.title,
        hint: 'Demanda',
        icon: Kanban,
        run: () => {
          navigate('/demandas')
          openModal({ type: 'task', record: t })
        },
      })),
    ]
    const q = normalize(query.trim())
    return (q ? all.filter((r) => normalize(r.label).includes(q)) : all.filter((r) => r.id.startsWith('nav-'))).slice(0, 9)
  }, [query, clients, proposals, tasks, navigate, openModal])

  const run = (r: Result | undefined) => {
    if (!r) return
    setCommandOpen(false)
    r.run()
  }

  return (
    <Dialog.Root open={commandOpen} onOpenChange={setCommandOpen}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 animate-fade-in bg-slate-950/40 backdrop-blur-[2px]" />
        <Dialog.Content
          aria-describedby={undefined}
          className="fixed left-1/2 top-[18vh] z-50 w-[calc(100%-2rem)] max-w-xl -translate-x-1/2 overflow-hidden rounded-xl border bg-white shadow-2xl focus:outline-none dark:bg-slate-900"
        >
          <Dialog.Title className="sr-only">Busca global</Dialog.Title>
          <div className="flex items-center gap-3 border-b px-4">
            <Search className="h-4 w-4 text-slate-400" />
            <input
              autoFocus
              value={query}
              onChange={(e) => {
                setQuery(e.target.value)
                setActive(0)
              }}
              onKeyDown={(e) => {
                if (e.key === 'ArrowDown') {
                  e.preventDefault()
                  setActive((a) => Math.min(a + 1, results.length - 1))
                } else if (e.key === 'ArrowUp') {
                  e.preventDefault()
                  setActive((a) => Math.max(a - 1, 0))
                } else if (e.key === 'Enter') {
                  e.preventDefault()
                  run(results[active])
                }
              }}
              placeholder="Buscar páginas, clientes, propostas, demandas…"
              className="h-12 flex-1 bg-transparent text-sm outline-none placeholder:text-slate-400"
            />
          </div>
          <div className="max-h-[340px] overflow-y-auto p-1.5">
            {results.length === 0 && <p className="px-3 py-8 text-center text-sm text-slate-500">Nada encontrado para “{query}”.</p>}
            {results.map((r, i) => (
              <button
                key={r.id}
                type="button"
                onMouseEnter={() => setActive(i)}
                onClick={() => run(r)}
                className={cn(
                  'flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm',
                  i === active ? 'bg-slate-100 dark:bg-slate-800' : '',
                )}
              >
                <r.icon className="h-4 w-4 shrink-0 text-slate-400" />
                <span className="flex-1 truncate">{r.label}</span>
                <span className="text-xs text-slate-400">{r.hint}</span>
                {i === active && <CornerDownLeft className="h-3.5 w-3.5 text-slate-400" />}
              </button>
            ))}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
