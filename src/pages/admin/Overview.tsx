import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { Badge, Card, PageHeader } from '@/components/ui/primitives'
import { adminFinance, adminMetrics, adminOverview } from '@/lib/admin'
import { formatCurrency, formatDate } from '@/lib/utils'
import { Loaded, Stat, statusLabel, statusTone } from '@/components/admin/parts'

export default function Overview() {
  const o = useQuery({ queryKey: ['admin', 'overview'], queryFn: adminOverview, retry: false })
  const f = useQuery({ queryKey: ['admin', 'finance'], queryFn: adminFinance, retry: false })
  const m = useQuery({ queryKey: ['admin', 'metrics'], queryFn: adminMetrics, retry: false })
  return (
    <div>
      <PageHeader title="Resumo" description="Como o Krono está agora: receita, gente nova, o que precisa de atenção." />
      <Loaded query={o}>
        {(d) => (
          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Stat label="Receita mensal (MRR)" value={formatCurrency(d.mrr_cents / 100)} hint={`${d.by_status.active ?? 0} assinatura(s) ativa(s)`} />
              <Stat label="Contas" value={d.users} hint={`${d.workspaces} negócios`} />
              <Stat label="Em teste grátis" value={d.by_status.trialing ?? 0} hint={`${d.trials_ending_3d} terminam em 3 dias`} />
              <Stat label="Erros em 24h" value={d.errors_24h} hint={`${d.error_kinds_24h} tipos diferentes`} tone={d.errors_24h > 0 ? 'red' : undefined} />
            </div>
            <Card className="p-4">
              <h2 className="mb-3 text-sm font-semibold">Precisa de atenção</h2>
              <ul className="space-y-1.5 text-sm">
                <li>{f.data?.past_due.length ? <Link to="/admin/financeiro" className="text-red-600 underline">{f.data.past_due.length} assinatura(s) em atraso</Link> : <span className="text-slate-500">Nenhuma assinatura em atraso.</span>}</li>
                <li>{d.trials_ending_3d ? <Link to="/admin/assinantes" className="text-amber-600 underline">{d.trials_ending_3d} teste(s) terminam em 3 dias: hora de conversar com eles</Link> : <span className="text-slate-500">Nenhum teste terminando nos próximos 3 dias.</span>}</li>
                <li>{d.errors_24h ? <Link to="/admin/erros" className="text-red-600 underline">{d.errors_24h} erro(s) no app nas últimas 24h</Link> : <span className="text-slate-500">Nenhum erro nas últimas 24h.</span>}</li>
              </ul>
            </Card>
            <div className="grid gap-3 lg:grid-cols-2">
              <Card className="p-4">
                <h2 className="mb-3 text-sm font-semibold">Negócios por situação</h2>
                <div className="flex flex-wrap gap-2">{Object.entries(d.by_status).map(([k, n]) => <Badge key={k} tone={statusTone[k] ?? 'slate'}>{statusLabel[k] ?? k}: {n}</Badge>)}</div>
                {m.data && <p className="mt-4 text-sm text-slate-500">Ativos nos últimos 7 dias: <strong>{m.data.active_7d}</strong> · 30 dias: <strong>{m.data.active_30d}</strong></p>}
              </Card>
              <Card className="p-4">
                <h2 className="mb-2 text-sm font-semibold">Últimos avisos de pagamento</h2>
                <ul className="space-y-1 text-sm">
                  {d.recent_payments.length === 0 && <li className="text-slate-500">Nada ainda.</li>}
                  {d.recent_payments.map((p, i) => (
                    <li key={i} className="flex justify-between gap-2"><span className="truncate">{p.workspace ?? '—'} · {p.event}</span><span className="shrink-0 text-slate-500">{formatDate(p.created_at)}</span></li>
                  ))}
                </ul>
              </Card>
            </div>
          </div>
        )}
      </Loaded>
    </div>
  )
}
