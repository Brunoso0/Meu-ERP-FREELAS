import { Link } from 'react-router-dom'
import { ArrowRight, Check } from 'lucide-react'
import { Card } from '@/components/ui/primitives'
import { useTable } from '@/hooks/useData'
import { cn } from '@/lib/utils'

interface Step { done: boolean; title: string; hint: string; to: string }

/** "Comece por aqui": some sozinho quando a conta já fez o básico. */
function Checklist({ steps }: { steps: Step[] }) {
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

/** "Comece por aqui" para o Resumo e o Acesso rápido: some sozinho quando a conta já fez o básico. */
export function GettingStarted() {
  const proposals = useTable('proposals')
  const clients = useTable('clients')
  const transactions = useTable('financial_transactions')
  const profile = useTable('profiles').data?.[0]
  const ready = [proposals, clients, transactions].every((t) => !t.isLoading) && !!profile
  if (!ready) return null
  const steps: Step[] = [
    { done: !!(profile?.company_name?.trim() && (profile.pix_key || profile.document)), title: 'Conte quem é você', hint: 'Nome da empresa e Pix. Eles saem nas suas propostas e cobranças.', to: '/minha-empresa' },
    { done: (clients.data?.length ?? 0) > 0, title: 'Cadastre seu primeiro cliente', hint: 'Quem você atende ou quer atender.', to: '/clientes' },
    { done: (proposals.data?.length ?? 0) > 0, title: 'Faça seu primeiro atendimento', hint: 'Da proposta à cobrança, passo a passo.', to: '/atendimentos/novo' },
    { done: (transactions.data ?? []).some((t) => t.type === 'income' && t.status === 'paid'), title: 'Receba seu primeiro pagamento', hint: 'Marque como pago no Financeiro e veja o dinheiro entrar.', to: '/financeiro' },
  ]
  return <Checklist steps={steps} />
}
