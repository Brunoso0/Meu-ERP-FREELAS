import { Link, useNavigate } from 'react-router-dom'
import { ArrowRight, Briefcase, FilePlus, FileText, Handshake, Kanban, QrCode, ScrollText, type LucideIcon } from 'lucide-react'
import { Badge, Card, PageHeader } from '@/components/ui/primitives'
import { GettingStarted } from '@/components/GettingStarted'
import { stepSummary } from '@/components/EngagementProgress'
import { useTable } from '@/hooks/useData'
import { engagementOf, isOpenEngagement } from '@/lib/engagement'
import { cn, formatProposalNumber } from '@/lib/utils'

interface QuickAction {
  to: string
  title: string
  description: string
  icon: LucideIcon
  primary?: boolean
}

const actions: QuickAction[] = [
  { to: '/atendimentos/novo', title: 'Novo atendimento', description: 'Do cliente ao projeto, passo a passo: proposta, assinatura, cobrança e contrato.', icon: Handshake, primary: true },
  { to: '/ferramentas/proposta', title: 'Criar proposta', description: 'Escopo, prazos e valores num documento pronto para enviar.', icon: FilePlus },
  { to: '/ferramentas/orcamento', title: 'Criar orçamento', description: 'Um orçamento rápido, com cobrança por Pix.', icon: QrCode },
  { to: '/ferramentas/contrato', title: 'Criar contrato', description: 'Parta de uma proposta, escolha as cláusulas e exporte.', icon: ScrollText },
]

/** Atalhos para consultar o que já existe (as ações acima criam coisas novas). */
const lookups: { to: string; label: string; icon: LucideIcon }[] = [
  { to: '/demandas', label: 'Ver demandas', icon: Kanban },
  { to: '/projetos', label: 'Ver projetos', icon: Briefcase },
  { to: '/propostas', label: 'Ver propostas', icon: FileText },
  { to: '/ferramentas/orcamento', label: 'Ver orçamentos', icon: QrCode },
]

function ActionCard({ action }: { action: QuickAction }) {
  const Icon = action.icon
  return (
    <Link
      to={action.to}
      className={cn(
        'group flex flex-col gap-3 rounded-xl border p-5 transition-all hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500',
        action.primary
          ? 'border-brand-600 bg-brand-600 text-white sm:col-span-2 lg:col-span-1'
          : 'bg-white hover:border-brand-400 dark:bg-slate-900 dark:hover:border-brand-500',
      )}
    >
      <span className={cn('flex h-10 w-10 items-center justify-center rounded-lg', action.primary ? 'bg-white/15' : 'bg-brand-50 text-brand-600 dark:bg-brand-600/15 dark:text-brand-400')}>
        <Icon className="h-5 w-5" />
      </span>
      <span>
        <span className="block text-base font-semibold">{action.title}</span>
        <span className={cn('mt-1 block text-sm', action.primary ? 'text-brand-100' : 'text-slate-500 dark:text-slate-400')}>{action.description}</span>
      </span>
      <ArrowRight className={cn('mt-auto h-4 w-4 transition-transform group-hover:translate-x-1', action.primary ? 'text-white' : 'text-brand-600 dark:text-brand-400')} />
    </Link>
  )
}

/** Acesso rápido: os caminhos mais usados, sem passar pelo painel de números. */
export default function QuickAccess() {
  const navigate = useNavigate()
  const proposals = useTable('proposals')
  const clients = useTable('clients')
  const quotes = useTable('quotes')
  const contracts = useTable('contracts')
  const projects = useTable('projects')
  const profile = useTable('profiles').data?.[0]

  const open = (proposals.data ?? [])
    .map((p) => engagementOf(p, { clients: clients.data ?? [], quotes: quotes.data ?? [], contracts: contracts.data ?? [], projects: projects.data ?? [] }))
    .filter(isOpenEngagement)
    .sort((a, b) => b.proposal.created_at.localeCompare(a.proposal.created_at))
    .slice(0, 4)

  const firstName = (profile?.full_name ?? '').split(' ')[0]

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader title={firstName ? `Olá, ${firstName}` : 'Acesso rápido'} description="O que você quer fazer agora?" />

      <GettingStarted />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {actions.map((a) => (
          <ActionCard key={a.to} action={a} />
        ))}
      </div>

      <section className="mt-6">
        <h2 className="mb-3 text-sm font-semibold">Consultar</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {lookups.map(({ to, label, icon: Icon }) => (
            <Link key={to} to={to} className="group flex items-center gap-3 rounded-xl border bg-white px-4 py-3 text-sm font-medium transition-colors hover:border-brand-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 dark:bg-slate-900 dark:hover:border-brand-500">
              <Icon className="h-4 w-4 shrink-0 text-brand-600 dark:text-brand-400" />
              <span className="flex-1">{label}</span>
              <ArrowRight className="h-4 w-4 text-slate-400 transition-transform group-hover:translate-x-1" />
            </Link>
          ))}
        </div>
      </section>

      {open.length > 0 && (
        <section className="mt-8">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold">Atendimentos em andamento</h2>
            <Link to="/atendimentos" className="text-sm font-medium text-brand-600 hover:underline dark:text-brand-400">Ver todos</Link>
          </div>
          <Card className="divide-y">
            {open.map((e) => {
              const s = stepSummary(e)
              return (
                <button key={e.proposal.id} type="button" onClick={() => navigate(`/atendimentos/${e.proposal.id}`)} className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/60">
                  <FileText className="h-4 w-4 shrink-0 text-slate-400" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{e.client?.company_name || e.client?.name || 'Sem cliente'} · {e.proposal.title}</span>
                    <span className="block text-xs text-slate-500">{formatProposalNumber(e.proposal.proposal_number)}</span>
                  </span>
                  <Badge tone="indigo">{s.label}</Badge>
                  <ArrowRight className="h-4 w-4 shrink-0 text-slate-400" />
                </button>
              )
            })}
          </Card>
        </section>
      )}
    </div>
  )
}
