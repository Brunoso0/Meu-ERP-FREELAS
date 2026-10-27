import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Handshake, Plus } from 'lucide-react'
import { stepSummary } from '@/components/EngagementProgress'
import { Badge, Card, EmptyState, PageHeader, Skeleton } from '@/components/ui/primitives'
import { useTable } from '@/hooks/useData'
import { engagementOf, isOpenEngagement } from '@/lib/engagement'
import { cn, formatCurrency, formatDate, formatProposalNumber } from '@/lib/utils'

export default function Engagements() {
  const proposals = useTable('proposals')
  const clients = useTable('clients')
  const quotes = useTable('quotes')
  const contracts = useTable('contracts')
  const projects = useTable('projects')
  const [filter, setFilter] = useState<'open' | 'all'>('open')

  const loading = proposals.isLoading || clients.isLoading || quotes.isLoading || contracts.isLoading || projects.isLoading
  const all = useMemo(() => {
    const data = { clients: clients.data ?? [], quotes: quotes.data ?? [], contracts: contracts.data ?? [], projects: projects.data ?? [] }
    return (proposals.data ?? []).map((p) => engagementOf(p, data)).sort((a, b) => b.proposal.created_at.localeCompare(a.proposal.created_at))
  }, [proposals.data, clients.data, quotes.data, contracts.data, projects.data])
  const list = filter === 'open' ? all.filter(isOpenEngagement) : all

  return (
    <div>
      <PageHeader
        title="Atendimentos"
        description="Cada trabalho do cliente ao projeto, com a etapa em que está."
        actions={<Link to="/atendimentos/novo" className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-brand-600 px-3 text-sm font-medium text-white hover:bg-brand-700"><Plus className="h-4 w-4" />Novo atendimento</Link>}
      />
      <div className="mb-4 inline-flex rounded-lg border p-0.5">
        {([['open', 'Em andamento'], ['all', 'Todos']] as const).map(([v, label]) => (
          <button key={v} type="button" onClick={() => setFilter(v)} className={cn('rounded-md px-3 py-1.5 text-sm font-medium', filter === v ? 'bg-brand-50 text-brand-700 dark:bg-brand-600/20 dark:text-brand-400' : 'text-slate-500')}>{label}</button>
        ))}
      </div>
      {loading ? (
        <Skeleton className="h-48 w-full" />
      ) : list.length === 0 ? (
        <EmptyState icon={Handshake} title="Nenhum atendimento" description="Comece um novo para levar o cliente até o projeto." action={<Link to="/atendimentos/novo" className="text-sm font-medium text-brand-600 hover:underline">Novo atendimento</Link>} />
      ) : (
        <Card className="divide-y">
          {list.map((e) => {
            const s = stepSummary(e)
            return (
              <Link key={e.proposal.id} to={`/atendimentos/${e.proposal.id}`} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-800/40">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{e.client?.company_name || e.client?.name || 'Sem cliente'} · {e.proposal.title}</p>
                  <p className="text-xs text-slate-500">{formatProposalNumber(e.proposal.proposal_number)} · {formatCurrency(e.proposal.total_amount)} · {formatDate(e.proposal.created_at)}</p>
                </div>
                <Badge tone={e.step === 6 ? 'green' : 'indigo'}>{s.label}</Badge>
              </Link>
            )
          })}
        </Card>
      )}
    </div>
  )
}
