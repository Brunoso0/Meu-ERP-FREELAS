import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Badge, Button, Card, Field, Input, PageHeader, Segmented, Select, Skeleton } from '@/components/ui/primitives'
import { adminExtendTrial, adminGrantCourtesy, adminWorkspaces, type AdminWorkspace } from '@/lib/admin'
import { formatDate } from '@/lib/utils'
import { businessLabel, message, planLabel, statusLabel, statusTone } from '@/components/admin/parts'

const FILTERS = [
  { value: 'all', label: 'Todos' }, { value: 'active', label: 'Ativos' }, { value: 'trialing', label: 'Em teste' },
  { value: 'past_due', label: 'Em atraso' }, { value: 'canceled', label: 'Cancelados' }, { value: 'courtesy', label: 'Cortesia' },
] as const
type Filter = (typeof FILTERS)[number]['value']

function Actions({ ws, onDone }: { ws: AdminWorkspace; onDone: () => void }) {
  const [plan, setPlan] = useState('pro')
  const [days, setDays] = useState('7')
  const [note, setNote] = useState('')
  const run = useMutation({
    mutationFn: (kind: 'courtesy' | 'trial') => (kind === 'courtesy' ? adminGrantCourtesy(ws.id, plan, note) : adminExtendTrial(ws.id, Number(days), note)),
    onSuccess: () => { toast.success('Feito e registrado'); onDone() },
    onError: (e) => toast.error('Não foi possível', { description: message(e) }),
  })
  return (
    <div className="mt-3 grid gap-3 rounded-lg bg-slate-50 p-3 dark:bg-slate-900 sm:grid-cols-2">
      <div className="space-y-2">
        <Field label="Cortesia (sem cobrança)">
          <Select value={plan} onChange={(e) => setPlan(e.target.value)}>
            <option value="essential">Essencial</option><option value="pro">Profissional</option><option value="free">Grátis</option>
          </Select>
        </Field>
        <Button type="button" variant="secondary" onClick={() => run.mutate('courtesy')} loading={run.isPending}>Conceder cortesia</Button>
      </div>
      <div className="space-y-2">
        <Field label="Prolongar teste grátis (dias)"><Input value={days} onChange={(e) => setDays(e.target.value.replace(/\D/g, '').slice(0, 2))} inputMode="numeric" /></Field>
        <Button type="button" variant="secondary" onClick={() => run.mutate('trial')} loading={run.isPending} disabled={!days || Number(days) < 1}>Prolongar teste</Button>
      </div>
      <div className="sm:col-span-2"><Field label="Motivo (fica no registro)"><Input value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} placeholder="Ex.: parceiro, suporte, demonstração" /></Field></div>
    </div>
  )
}

export default function Subscribers() {
  const qc = useQueryClient()
  const [search, setSearch] = useState('')
  const [applied, setApplied] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const [open, setOpen] = useState<string | null>(null)
  const status = filter === 'all' ? '' : filter
  const q = useQuery({ queryKey: ['admin', 'workspaces', applied, status], queryFn: () => adminWorkspaces(applied, status), retry: false })
  return (
    <div>
      <PageHeader title="Assinantes" description="Todos os negócios que usam o Krono. Abra um para ver os detalhes e dar cortesia ou prolongar o teste." />
      <div className="mb-4 space-y-3">
        <div className="overflow-x-auto"><Segmented value={filter} onChange={setFilter} options={FILTERS.map((f) => ({ value: f.value, label: f.label }))} /></div>
        <form onSubmit={(e) => { e.preventDefault(); setApplied(search.trim()) }} className="flex gap-2">
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por nome ou e-mail" />
          <Button type="submit" variant="secondary">Buscar</Button>
        </form>
      </div>
      {q.isLoading ? <Skeleton className="h-48" /> : q.error ? <p className="text-sm text-red-600">{message(q.error)}</p> : (
        <>
          <p className="mb-2 text-xs text-slate-500">{q.data?.total} negócio(s){(q.data?.total ?? 0) > 50 ? ', mostrando os 50 mais recentes' : ''}</p>
          <div className="space-y-2">
            {q.data?.rows.length === 0 && <p className="text-sm text-slate-500">Nenhum resultado.</p>}
            {q.data?.rows.map((w) => (
              <Card key={w.id} className="p-3">
                <button type="button" className="flex w-full flex-wrap items-center justify-between gap-2 text-left" onClick={() => setOpen(open === w.id ? null : w.id)}>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{w.name}</p>
                    <p className="truncate text-xs text-slate-500">{w.owner_email ?? '—'} · desde {formatDate(w.created_at)}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge>{planLabel[w.plan_id] ?? w.plan_id}</Badge>
                    <Badge tone={statusTone[w.status] ?? 'slate'}>{statusLabel[w.status] ?? w.status}</Badge>
                  </div>
                </button>
                {open === w.id && (
                  <div className="mt-3 text-sm">
                    <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs sm:grid-cols-3">
                      <div><dt className="text-slate-500">Membros / clientes</dt><dd>{w.members} / {w.clients}</dd></div>
                      <div><dt className="text-slate-500">Último acesso</dt><dd>{formatDate(w.last_login)}</dd></div>
                      <div><dt className="text-slate-500">Tipo</dt><dd>{w.business_type ? businessLabel[w.business_type] ?? w.business_type : '—'}</dd></div>
                      <div><dt className="text-slate-500">Cidade</dt><dd>{[w.city, w.state].filter(Boolean).join(' - ') || '—'}</dd></div>
                      <div><dt className="text-slate-500">WhatsApp</dt><dd>{w.phone || '—'}</dd></div>
                      <div><dt className="text-slate-500">Origem</dt><dd>{w.source ?? '—'}</dd></div>
                      <div><dt className="text-slate-500">Teste até</dt><dd>{formatDate(w.trial_ends_at)}</dd></div>
                      <div><dt className="text-slate-500">Período pago até</dt><dd>{formatDate(w.current_period_end)}</dd></div>
                      <div><dt className="text-slate-500">Pagamento</dt><dd>{w.billing_method ?? '—'}</dd></div>
                      <div><dt className="text-slate-500">Em atraso desde</dt><dd>{formatDate(w.past_due_since)}</dd></div>
                    </dl>
                    <Actions ws={w} onDone={() => { void qc.invalidateQueries({ queryKey: ['admin'] }) }} />
                  </div>
                )}
              </Card>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
