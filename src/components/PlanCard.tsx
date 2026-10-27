import { Check } from 'lucide-react'
import { Badge, Button, Card, Skeleton } from '@/components/ui/primitives'
import { planCatalog, planNames, trialDaysLeft, usePlan, type PlanCounter } from '@/lib/plan'
import { cn } from '@/lib/utils'

const meters: { key: PlanCounter; label: string; unit?: string }[] = [
  { key: 'members', label: 'Pessoas no workspace' },
  { key: 'viewers', label: 'Contador (leitura)' },
  { key: 'clients', label: 'Clientes ativos' },
  { key: 'proposals_month', label: 'Propostas no mês' },
  { key: 'quotes_month', label: 'Orçamentos no mês' },
  { key: 'leads_month', label: 'Buscas de leads no mês' },
  { key: 'storage_mb', label: 'Comprovantes', unit: 'MB' },
]

/** Plano em vigor, uso do mês e comparação dos planos. A contratação entra junto com a cobrança. */
export function PlanCard() {
  const { usage, isLoading, isOwner } = usePlan()
  if (isLoading || !usage) return <Skeleton className="mb-6 h-48 w-full" />

  const days = trialDaysLeft(usage)
  const status =
    days !== null ? { tone: 'indigo' as const, label: `Teste grátis · ${days <= 1 ? 'último dia' : `${days} dias`}` }
    : usage.status === 'courtesy' ? { tone: 'green' as const, label: 'Cortesia' }
    : usage.status === 'active' ? { tone: 'green' as const, label: 'Assinatura ativa' }
    : usage.status === 'past_due' ? { tone: 'amber' as const, label: 'Pagamento em atraso' }
    : { tone: 'slate' as const, label: usage.status === 'trialing' ? 'Teste encerrado' : 'Sem assinatura' }

  return (
    <Card className="mb-6 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Plano</p>
          <h2 className="mt-0.5 text-lg font-semibold">{planNames[usage.plan]}</h2>
        </div>
        <Badge tone={status.tone}>{status.label}</Badge>
      </div>
      {usage.status === 'trialing' && days === null && (
        <p className="mt-2 text-sm text-slate-500">O teste acabou e o workspace voltou ao plano Grátis. Seus dados continuam aqui; para criar acima dos limites, escolha um plano.</p>
      )}

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {meters.map(({ key, label, unit }) => {
          const limit = usage.limits[key]
          if (limit === 0 && (usage.usage[key] ?? 0) === 0) {
            return (
              <div key={key} className="text-sm">
                <div className="flex justify-between"><span className="text-slate-500">{label}</span><span className="text-slate-400">não incluso</span></div>
              </div>
            )
          }
          const used = usage.usage[key] ?? 0
          const pct = limit ? Math.min(100, (used / limit) * 100) : 0
          return (
            <div key={key} className="text-sm">
              <div className="flex justify-between">
                <span className="text-slate-500">{label}</span>
                <span className="tabular font-medium">{used}{unit ? ` ${unit}` : ''} / {limit === undefined ? 'ilimitado' : `${limit}${unit ? ` ${unit}` : ''}`}</span>
              </div>
              {limit !== undefined && (
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800" role="progressbar" aria-valuenow={used} aria-valuemax={limit} aria-label={label}>
                  <div className={cn('h-full rounded-full', pct >= 100 ? 'bg-red-500' : pct >= 80 ? 'bg-amber-500' : 'bg-brand-500')} style={{ width: `${pct}%` }} />
                </div>
              )}
            </div>
          )
        })}
      </div>

      <div className="mt-6 grid gap-3 lg:grid-cols-3">
        {planCatalog.map((p) => {
          const current = p.id === usage.plan
          return (
            <div key={p.id} className={cn('flex flex-col rounded-lg border p-4', current && 'border-brand-500 ring-1 ring-brand-500/30')}>
              <div className="flex items-baseline justify-between">
                <h3 className="font-semibold">{p.name}</h3>
                <p className="text-sm"><strong className="tabular text-base">{p.price === 0 ? 'R$ 0' : `R$ ${p.price}`}</strong>{p.price > 0 && <span className="text-slate-500">/mês</span>}</p>
              </div>
              <p className="mt-1 text-xs text-slate-500">{p.tagline}</p>
              <ul className="mt-3 flex-1 space-y-1.5 text-sm">
                {p.features.map((f) => <li key={f} className="flex gap-2"><Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-brand-600" />{f}</li>)}
              </ul>
              <Button className="mt-4" variant={current ? 'secondary' : 'primary'} disabled>
                {current ? 'Plano atual' : 'Contratação em breve'}
              </Button>
            </div>
          )
        })}
      </div>
      {!isOwner && <p className="mt-3 text-xs text-slate-500">Só o dono do workspace contrata e troca o plano.</p>}
    </Card>
  )
}
