import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Check } from 'lucide-react'
import { PlanCheckout } from '@/components/PlanCheckout'
import { confirm } from '@/components/ui/confirm'
import { useActiveWorkspace } from '@/hooks/useWorkspace'
import { cancelSubscription, invoiceStatusLabel, listInvoices, type Invoice } from '@/lib/subscription'
import { formatDate } from '@/lib/utils'
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
  const { workspace } = useActiveWorkspace()
  const qc = useQueryClient()
  const [checkout, setCheckout] = useState<'essential' | 'pro' | null>(null)
  const [invoices, setInvoices] = useState<Invoice[] | null>(null)
  const [busy, setBusy] = useState(false)
  if (isLoading || !usage) return <Skeleton className="mb-6 h-48 w-full" />

  const days = trialDaysLeft(usage)
  const subscribed = usage.status === 'active' && !usage.cancel_at_period_end

  async function cancel() {
    if (!workspace) return
    const until = usage?.current_period_end ? ` O plano continua valendo até ${formatDate(usage.current_period_end)}.` : ''
    if (!(await confirm({ title: 'Cancelar a assinatura?', description: `Não haverá novas cobranças.${until} Seus dados continuam aqui.`, confirmLabel: 'Cancelar assinatura' }))) return
    setBusy(true)
    try {
      await cancelSubscription(workspace.id)
      await qc.invalidateQueries({ queryKey: ['plan-usage'] })
      toast.success('Assinatura cancelada')
    } catch (error) {
      toast.error('Não foi possível cancelar', { description: error instanceof Error ? error.message : undefined })
    } finally {
      setBusy(false)
    }
  }

  async function showInvoices() {
    if (!workspace) return
    try {
      setInvoices((await listInvoices(workspace.id)).payments)
    } catch (error) {
      toast.error('Não foi possível carregar as faturas', { description: error instanceof Error ? error.message : undefined })
    }
  }
  const status =
    days !== null ? { tone: 'indigo' as const, label: `Teste grátis · ${days <= 1 ? 'último dia' : `${days} dias`}` }
    : usage.status === 'courtesy' ? { tone: 'green' as const, label: 'Cortesia' }
    : usage.status === 'active' ? { tone: 'green' as const, label: 'Assinatura ativa' }
    : usage.status === 'canceled' && usage.plan !== 'free' ? { tone: 'amber' as const, label: 'Cancelada' }
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
      {usage.status === 'past_due' && (
        <p className="mt-2 text-sm text-amber-700 dark:text-amber-400">Há uma fatura em atraso. Pague em até 7 dias do vencimento para não voltar ao plano Grátis.</p>
      )}
      {usage.status === 'active' && usage.current_period_end && (
        <p className="mt-2 text-sm text-slate-500">{usage.cancel_at_period_end ? 'Cancelada: vale até' : 'Pago até'} {formatDate(usage.current_period_end)}.</p>
      )}
      {usage.status === 'canceled' && usage.current_period_end && usage.plan !== 'free' && (
        <p className="mt-2 text-sm text-slate-500">Assinatura cancelada. O plano vale até {formatDate(usage.current_period_end)}.</p>
      )}
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

      {usage.limits.storage_mb !== undefined && (usage.usage.storage_mb ?? 0) >= usage.limits.storage_mb && (
        <p className="mt-3 text-sm text-amber-700 dark:text-amber-400">O espaço de comprovantes acabou: novos anexos ficam bloqueados até você apagar arquivos antigos ou escolher um plano maior. Nada foi apagado.</p>
      )}

      <div className="mt-6 grid gap-3 lg:grid-cols-3">
        {planCatalog.map((p) => {
          const current = p.id === usage.plan
          return (
            <div key={p.id} className={cn('flex flex-col rounded-lg border p-4', current && 'border-brand-500 ring-1 ring-brand-500/30')}>
              <div className="flex items-baseline justify-between">
                <h3 className="font-semibold">{p.name}</h3>
                <p className="text-sm"><strong className="tabular text-base">{p.price === 0 ? 'R$ 0' : `R$ ${p.price.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`}</strong>{p.price > 0 && <span className="text-slate-500">/mês</span>}</p>
              </div>
              <p className="mt-1 text-xs text-slate-500">{p.tagline}</p>
              <ul className="mt-3 flex-1 space-y-1.5 text-sm">
                {p.features.map((f) => <li key={f} className="flex gap-2"><Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-brand-600" />{f}</li>)}
              </ul>
              {p.id === 'free' ? (
                <Button className="mt-4" variant="secondary" disabled>{current ? 'Plano atual' : 'Plano gratuito'}</Button>
              ) : (
                <Button className="mt-4" variant={current && subscribed ? 'secondary' : 'primary'} disabled={!isOwner || (current && subscribed && usage.chosen_plan === p.id && p.id !== 'pro')} onClick={() => setCheckout(p.id as 'essential' | 'pro')}>
                  {current && subscribed ? (p.id === 'pro' ? 'Ajustar pessoas extras' : 'Plano atual') : `Assinar ${p.name}`}
                </Button>
              )}
            </div>
          )
        })}
      </div>
      {isOwner && (usage.has_subscription || usage.status === 'active') && (
        <div className="mt-4 flex flex-wrap gap-2">
          <Button size="sm" variant="secondary" onClick={showInvoices}>Ver faturas</Button>
          {usage.status === 'active' && !usage.cancel_at_period_end && <Button size="sm" variant="ghost" onClick={cancel} loading={busy}>Cancelar assinatura</Button>}
        </div>
      )}
      {invoices && (
        <ul className="mt-3 divide-y rounded-lg border text-sm">
          {invoices.length === 0 && <li className="px-3 py-2 text-slate-500">Nenhuma fatura ainda.</li>}
          {invoices.map((i) => (
            <li key={i.id} className="flex items-center justify-between gap-3 px-3 py-2">
              <span>{formatDate(i.dueDate)} · {invoiceStatusLabel[i.status] ?? i.status}</span>
              {i.url ? <a href={i.url} target="_blank" rel="noreferrer" className="font-medium text-brand-600 hover:underline">Abrir</a> : <span />}
            </li>
          ))}
        </ul>
      )}
      <PlanCheckout plan={checkout} open={checkout !== null} onClose={() => setCheckout(null)} />
      {!isOwner && <p className="mt-3 text-xs text-slate-500">Só o dono do workspace contrata e troca o plano.</p>}
    </Card>
  )
}
