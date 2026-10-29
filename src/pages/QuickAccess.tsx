import { Link, useNavigate } from 'react-router-dom'
import { ArrowRight, Check, FilePlus, FileText, Handshake, LayoutDashboard, QrCode, ScrollText, type LucideIcon } from 'lucide-react'
import { Badge, Card, PageHeader } from '@/components/ui/primitives'
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

/** Tela inicial: os caminhos mais usados, sem passar pelo painel de números. */
interface Step { done: boolean; title: string; hint: string; to: string }

/** "Comece por aqui": some sozinho quando a conta já fez o básico. */
function GettingStarted({ steps }: { steps: Step[] }) {
  const done = steps.filter((s) => s.done).length
  if (done === steps.length) return null
  const next = steps.find((s) => !s.done)
  return (
    <Card className="mb-6 p-5">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-base font-semibold">Comece por aqui</h2>
        <span className="text-xs text-slate-500">{done} de {steps.length} feitos</span>
      </div>
      <p className="mt-1 text-sm text-slate-500">Quatro passos curtos para o Krono começar a trabalhar por você.</p>
      <ol className="mt-4 space-y-2">
        {steps.map((s) => (
          <li key={s.title}>
            <Link
              to={s.to}
              className={cn('flex items-center gap-3 rounded-lg border px-3 py-2.5 transition-colors hover:border-brand-400', s === next && 'border-brand-500 bg-brand-50/60 dark:bg-brand-600/10', s.done && 'opacity-60')}
            >
              <span className={cn('flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-xs', s.done ? 'border-brand-600 bg-brand-600 text-white' : 'text-slate-400')}>
                {s.done ? <Check className="h-3.5 w-3.5" /> : steps.indexOf(s) + 1}
              </span>
              <span className="min-w-0 flex-1">
                <span className={cn('block text-sm font-medium', s.done && 'line-through')}>{s.title}</span>
                <span className="block text-xs text-slate-500">{s.hint}</span>
              </span>
              {s === next && <ArrowRight className="h-4 w-4 shrink-0 text-brand-600" />}
            </Link>
          </li>
        ))}
      </ol>
    </Card>
  )
}

export default function QuickAccess() {
  const navigate = useNavigate()
  const proposals = useTable('proposals')
  const clients = useTable('clients')
  const quotes = useTable('quotes')
  const contracts = useTable('contracts')
  const projects = useTable('projects')
  const transactions = useTable('financial_transactions')
  const profile = useTable('profiles').data?.[0]

  const open = (proposals.data ?? [])
    .map((p) => engagementOf(p, { clients: clients.data ?? [], quotes: quotes.data ?? [], contracts: contracts.data ?? [], projects: projects.data ?? [] }))
    .filter(isOpenEngagement)
    .sort((a, b) => b.proposal.created_at.localeCompare(a.proposal.created_at))
    .slice(0, 4)

  const ready = [proposals, clients, transactions].every((t) => !t.isLoading) && !!profile
  const steps: Step[] = [
    { done: !!(profile?.company_name?.trim() && (profile.pix_key || profile.document)), title: 'Conte quem é você', hint: 'Nome da empresa e Pix. Eles saem nas suas propostas e cobranças.', to: '/minha-empresa' },
    { done: (clients.data?.length ?? 0) > 0, title: 'Cadastre seu primeiro cliente', hint: 'Quem você atende ou quer atender.', to: '/clientes' },
    { done: (proposals.data?.length ?? 0) > 0, title: 'Faça seu primeiro atendimento', hint: 'Da proposta à cobrança, passo a passo.', to: '/atendimentos/novo' },
    { done: (transactions.data ?? []).some((t) => t.type === 'income' && t.status === 'paid'), title: 'Receba seu primeiro pagamento', hint: 'Marque como pago no Financeiro e veja o dinheiro entrar.', to: '/financeiro' },
  ]

  const firstName = (profile?.full_name ?? '').split(' ')[0]

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title={firstName ? `Olá, ${firstName}` : 'Acesso rápido'}
        description="O que você quer fazer agora?"
        actions={
          <Link to="/dashboard" className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-600 hover:underline dark:text-brand-400">
            <LayoutDashboard className="h-4 w-4" /> Ver o resumo
          </Link>
        }
      />

      {ready && <GettingStarted steps={steps} />}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {actions.map((a) => (
          <ActionCard key={a.to} action={a} />
        ))}
      </div>

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
