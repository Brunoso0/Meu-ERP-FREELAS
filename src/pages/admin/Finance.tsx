import { useQuery } from '@tanstack/react-query'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Link } from 'react-router-dom'
import { ChartTooltip, useChartTheme } from '@/components/charts/theme'
import { Badge, Card, PageHeader } from '@/components/ui/primitives'
import { adminFinance } from '@/lib/admin'
import { formatCompact, formatCurrency, formatDate } from '@/lib/utils'
import { Distribution, Loaded, planLabel, Stat } from '@/components/admin/parts'

const methodLabel: Record<string, string> = { PIX: 'Pix', BOLETO: 'Boleto', CREDIT_CARD: 'Cartão' }

export default function Finance() {
  const q = useQuery({ queryKey: ['admin', 'finance'], queryFn: adminFinance, retry: false })
  const theme = useChartTheme()
  return (
    <div>
      <PageHeader title="Financeiro" description="Receita recorrente, o que entrou, atrasos e renovações. Valores das assinaturas do Krono, não dos seus clientes." />
      <Loaded query={q}>
        {(d) => (
          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Stat label="MRR" value={formatCurrency(d.mrr_cents / 100)} hint={`${d.active_count} assinante(s) pagando`} />
              <Stat label="ARR (anual)" value={formatCurrency((d.mrr_cents * 12) / 100)} hint="MRR x 12" />
              <Stat label="Recebido em 30 dias" value={formatCurrency(d.received_30d_cents / 100)} />
              <Stat label="Ticket médio" value={formatCurrency(d.active_count ? d.mrr_cents / d.active_count / 100 : 0)} hint="por assinante" />
            </div>
            <div className="grid gap-3 lg:grid-cols-2">
              <Card className="p-4">
                <h2 className="mb-3 text-sm font-semibold">Receita recebida por mês</h2>
                {d.revenue_by_month.length === 0 ? <p className="text-sm text-slate-500">Nenhum pagamento recebido ainda.</p> : (
                  <div className="h-52">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={d.revenue_by_month.map((r) => ({ mes: r.month.slice(5) + '/' + r.month.slice(2, 4), Receita: r.cents / 100 }))}>
                        <CartesianGrid stroke={theme.grid} vertical={false} />
                        <XAxis dataKey="mes" stroke={theme.axis} fontSize={12} tickLine={false} />
                        <YAxis stroke={theme.axis} fontSize={12} tickLine={false} width={44} tickFormatter={(v) => formatCompact(v)} />
                        <Tooltip cursor={{ fill: theme.cursor }} content={<ChartTooltip format={(v) => formatCurrency(v)} />} />
                        <Bar dataKey="Receita" fill={theme.primary} radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </Card>
              <Card className="p-4">
                <h2 className="mb-3 text-sm font-semibold">Receita recorrente por plano</h2>
                {d.by_plan.length === 0 ? <p className="text-sm text-slate-500">Nenhuma assinatura ativa.</p> : (
                  <ul className="space-y-2 text-sm">
                    {d.by_plan.map((p) => <li key={p.plan_id} className="flex justify-between"><span>{planLabel[p.plan_id] ?? p.plan_id} · {p.n} assinante(s)</span><span className="tabular-nums">{formatCurrency(p.mrr_cents / 100)}</span></li>)}
                  </ul>
                )}
                <h2 className="mb-3 mt-5 text-sm font-semibold">Forma de pagamento (assinantes ativos)</h2>
                <Distribution data={d.by_method} labels={methodLabel} />
                <p className="mt-5 text-sm text-slate-500">Renovações nos próximos 30 dias: <strong>{d.renewals_30d.n}</strong> ({formatCurrency(d.renewals_30d.cents / 100)})</p>
              </Card>
            </div>
            <Card className="p-4">
              <h2 className="mb-3 text-sm font-semibold">Em atraso</h2>
              {d.past_due.length === 0 ? <p className="text-sm text-slate-500">Nenhuma assinatura em atraso.</p> : (
                <ul className="space-y-2 text-sm">
                  {d.past_due.map((p) => (
                    <li key={p.id} className="flex flex-wrap items-center justify-between gap-2">
                      <Link to={`/admin/assinantes`} className="font-medium underline">{p.name}</Link>
                      <span className="flex items-center gap-2"><Badge tone="red">desde {formatDate(p.since)}</Badge><span className="tabular-nums">{formatCurrency(p.monthly_cents / 100)}/mês</span></span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
            <Card className="p-4">
              <h2 className="mb-3 text-sm font-semibold">Últimos pagamentos</h2>
              {d.recent_payments.length === 0 ? <p className="text-sm text-slate-500">Nada ainda.</p> : (
                <ul className="space-y-1.5 text-sm">
                  {d.recent_payments.map((p, i) => (
                    <li key={i} className="flex justify-between gap-2"><span className="truncate">{p.workspace ?? '—'}</span><span className="shrink-0 tabular-nums">{formatCurrency(p.value)} · {formatDate(p.created_at)}</span></li>
                  ))}
                </ul>
              )}
            </Card>
          </div>
        )}
      </Loaded>
    </div>
  )
}
