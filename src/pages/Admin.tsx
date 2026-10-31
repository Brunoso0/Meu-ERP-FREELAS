import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Link } from 'react-router-dom'
import { ArrowLeft, ShieldCheck } from 'lucide-react'
import { Badge, Button, Card, Field, Input, PageHeader, Segmented, Select, Skeleton } from '@/components/ui/primitives'
import { activeFactor, verifyCode } from '@/lib/mfa'
import {
  ADMIN_STATUS_KEY, adminAudit, adminErrors, adminExtendTrial, adminGrantCourtesy, adminOverview, adminWorkspaces, useAdminStatus,
  type AdminError, type AdminWorkspace,
} from '@/lib/admin'
import { formatCurrency, formatDate } from '@/lib/utils'

type Tab = 'resumo' | 'negocios' | 'erros' | 'auditoria'
const message = (e: unknown) => (e instanceof Error ? e.message : 'Erro inesperado.')

const statusLabel: Record<string, string> = { none: 'Sem plano', trialing: 'Em teste', active: 'Ativo', past_due: 'Em atraso', canceled: 'Cancelado', courtesy: 'Cortesia' }
const statusTone: Record<string, 'slate' | 'green' | 'amber' | 'red' | 'blue' | 'indigo'> = { none: 'slate', trialing: 'blue', active: 'green', past_due: 'red', canceled: 'amber', courtesy: 'indigo' }
const planLabel: Record<string, string> = { free: 'Grátis', essential: 'Essencial', pro: 'Profissional' }
const actionLabel: Record<string, string> = { grant_courtesy: 'Cortesia concedida', extend_trial: 'Teste prolongado', delete_error: 'Erro apagado' }

/** Confirma o código do aplicativo autenticador nesta sessão: o banco só entrega os dados do painel depois disso. */
function StepUp() {
  const qc = useQueryClient()
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const factor = useQuery({ queryKey: ['admin-factor'], queryFn: activeFactor, retry: false })

  const confirmCode = async () => {
    if (!factor.data) return
    setBusy(true)
    try {
      await verifyCode(factor.data.id, code)
      await qc.invalidateQueries({ queryKey: ADMIN_STATUS_KEY })
    } catch (e) {
      toast.error('Código não confere', { description: message(e) })
      setBusy(false)
    }
  }

  return (
    <Card className="mx-auto max-w-md p-6">
      <div className="mb-3 flex items-center gap-2 text-lg font-semibold"><ShieldCheck className="h-5 w-5 text-brand-600" /> Confirme que é você</div>
      {factor.isLoading ? <Skeleton className="h-20" /> : factor.data ? (
        <div className="space-y-3">
          <p className="text-sm text-slate-500">O painel do Krono mostra dados de todos os clientes. Digite o código de 6 dígitos do aplicativo autenticador para abri-lo.</p>
          <Input value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} onKeyDown={(e) => e.key === 'Enter' && code.length === 6 && void confirmCode()} inputMode="numeric" placeholder="000000" autoFocus />
          <Button type="button" onClick={confirmCode} loading={busy} disabled={code.length !== 6}>Abrir painel</Button>
        </div>
      ) : (
        <div className="space-y-3 text-sm text-slate-500">
          <p>Para usar o painel você precisa ter a <strong>verificação em duas etapas</strong> ativa.</p>
          <p>Ative em Minha empresa &gt; Segurança, saia e entre de novo, e volte aqui.</p>
          <Link to="/minha-empresa" className="font-medium text-brand-600 underline">Ir para Minha empresa</Link>
        </div>
      )}
    </Card>
  )
}

function Stat({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <Card className="p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
      {hint && <p className="mt-0.5 text-xs text-slate-500">{hint}</p>}
    </Card>
  )
}

function Overview() {
  const q = useQuery({ queryKey: ['admin', 'overview'], queryFn: adminOverview, retry: false })
  if (q.isLoading) return <Skeleton className="h-64" />
  if (q.error || !q.data) return <p className="text-sm text-red-600">{message(q.error)}</p>
  const o = q.data
  const max = Math.max(1, ...o.signups_30d.map((d) => d.n))
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Receita mensal (MRR)" value={formatCurrency(o.mrr_cents / 100)} hint="assinaturas ativas" />
        <Stat label="Contas" value={o.users} hint={`${o.workspaces} negócios`} />
        <Stat label="Em teste" value={o.by_status.trialing ?? 0} hint={`${o.trials_ending_3d} terminam em 3 dias`} />
        <Stat label="Erros em 24h" value={o.errors_24h} hint={`${o.error_kinds_24h} tipos diferentes`} />
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        <Card className="p-4">
          <h2 className="mb-3 text-sm font-semibold">Negócios por situação</h2>
          <div className="flex flex-wrap gap-2">
            {Object.entries(o.by_status).map(([k, n]) => <Badge key={k} tone={statusTone[k] ?? 'slate'}>{statusLabel[k] ?? k}: {n}</Badge>)}
          </div>
          <h2 className="mb-3 mt-5 text-sm font-semibold">Pagantes por plano</h2>
          <div className="flex flex-wrap gap-2">
            {Object.keys(o.by_plan).length ? Object.entries(o.by_plan).map(([k, n]) => <Badge key={k}>{planLabel[k] ?? k}: {n}</Badge>) : <span className="text-sm text-slate-500">Nenhum ainda.</span>}
          </div>
          <h2 className="mb-3 mt-5 text-sm font-semibold">Como conheceram o Krono</h2>
          <div className="flex flex-wrap gap-2">
            {Object.entries(o.sources).map(([k, n]) => <Badge key={k} tone="indigo">{k}: {n}</Badge>)}
          </div>
        </Card>
        <Card className="p-4">
          <h2 className="mb-3 text-sm font-semibold">Cadastros nos últimos 30 dias</h2>
          {o.signups_30d.length === 0 ? <p className="text-sm text-slate-500">Nenhum cadastro no período.</p> : (
            <div className="flex h-32 items-end gap-1" role="img" aria-label="Cadastros por dia">
              {o.signups_30d.map((d) => (
                <div key={d.day} title={`${formatDate(d.day)}: ${d.n}`} className="flex-1 rounded-t bg-brand-500" style={{ height: `${(d.n / max) * 100}%`, minHeight: 4 }} />
              ))}
            </div>
          )}
          <h2 className="mb-2 mt-5 text-sm font-semibold">Últimos avisos de pagamento</h2>
          <ul className="space-y-1 text-sm">
            {o.recent_payments.length === 0 && <li className="text-slate-500">Nada ainda.</li>}
            {o.recent_payments.map((p, i) => (
              <li key={i} className="flex justify-between gap-2"><span className="truncate">{p.workspace ?? '—'} · {p.event}</span><span className="shrink-0 text-slate-500">{formatDate(p.created_at)}</span></li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  )
}

function WorkspaceActions({ ws, onDone }: { ws: AdminWorkspace; onDone: () => void }) {
  const [plan, setPlan] = useState('pro')
  const [days, setDays] = useState('7')
  const [note, setNote] = useState('')
  const run = useMutation({
    mutationFn: (kind: 'courtesy' | 'trial') => (kind === 'courtesy' ? adminGrantCourtesy(ws.id, plan, note) : adminExtendTrial(ws.id, Number(days), note)),
    onSuccess: () => { toast.success('Feito'); onDone() },
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

function Businesses() {
  const qc = useQueryClient()
  const [search, setSearch] = useState('')
  const [applied, setApplied] = useState('')
  const [open, setOpen] = useState<string | null>(null)
  const q = useQuery({ queryKey: ['admin', 'workspaces', applied], queryFn: () => adminWorkspaces(applied), retry: false })
  return (
    <div className="space-y-3">
      <form onSubmit={(e) => { e.preventDefault(); setApplied(search.trim()) }} className="flex gap-2">
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por nome ou e-mail" />
        <Button type="submit" variant="secondary">Buscar</Button>
      </form>
      {q.isLoading ? <Skeleton className="h-48" /> : q.error ? <p className="text-sm text-red-600">{message(q.error)}</p> : (
        <>
          <p className="text-xs text-slate-500">{q.data?.total} negócio(s){(q.data?.total ?? 0) > 50 ? ', mostrando os 50 mais recentes' : ''}</p>
          <div className="space-y-2">
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
                      <div><dt className="text-slate-500">Cidade</dt><dd>{[w.city, w.state].filter(Boolean).join(' - ') || '—'}</dd></div>
                      <div><dt className="text-slate-500">WhatsApp</dt><dd>{w.phone || '—'}</dd></div>
                      <div><dt className="text-slate-500">Origem</dt><dd>{w.source ?? '—'}</dd></div>
                      <div><dt className="text-slate-500">Teste até</dt><dd>{formatDate(w.trial_ends_at)}</dd></div>
                      <div><dt className="text-slate-500">Período pago até</dt><dd>{formatDate(w.current_period_end)}</dd></div>
                      <div><dt className="text-slate-500">Pagamento</dt><dd>{w.billing_method ?? '—'}</dd></div>
                      <div><dt className="text-slate-500">Em atraso desde</dt><dd>{formatDate(w.past_due_since)}</dd></div>
                    </dl>
                    <WorkspaceActions ws={w} onDone={() => { void qc.invalidateQueries({ queryKey: ['admin'] }) }} />
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

function ErrorRow({ e }: { e: AdminError }) {
  const [open, setOpen] = useState(false)
  return (
    <Card className="p-3">
      <button type="button" className="flex w-full items-start justify-between gap-3 text-left" onClick={() => setOpen(!open)}>
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{e.message}</p>
          <p className="truncate text-xs text-slate-500">{e.kind ?? '—'} · {e.path || '—'} · v{e.app_version ?? '?'} · última {formatDate(e.last_seen, 'dd/MM HH:mm')}</p>
        </div>
        <div className="flex shrink-0 gap-1.5"><Badge tone="red">{e.count}x</Badge><Badge>{e.people} pessoa(s)</Badge></div>
      </button>
      {open && (
        <div className="mt-3 space-y-3 text-xs">
          {e.context && <pre className="overflow-x-auto rounded bg-slate-50 p-2 dark:bg-slate-900">{JSON.stringify(e.context, null, 2)}</pre>}
          {e.breadcrumbs && <div><p className="mb-1 font-medium">Rastro (mais antigo primeiro)</p><pre className="overflow-x-auto rounded bg-slate-50 p-2 dark:bg-slate-900">{e.breadcrumbs.map((b) => JSON.stringify(b)).join('\n')}</pre></div>}
          {e.stack && <div><p className="mb-1 font-medium">Pilha</p><pre className="max-h-64 overflow-auto rounded bg-slate-50 p-2 dark:bg-slate-900">{e.stack}</pre></div>}
          <p className="text-slate-500">{e.user_agent}</p>
        </div>
      )}
    </Card>
  )
}

function Errors() {
  const q = useQuery({ queryKey: ['admin', 'errors'], queryFn: adminErrors, retry: false })
  if (q.isLoading) return <Skeleton className="h-48" />
  if (q.error) return <p className="text-sm text-red-600">{message(q.error)}</p>
  if (!q.data?.length) return <p className="text-sm text-slate-500">Nenhum erro registrado. Bom sinal.</p>
  return <div className="space-y-2">{q.data.map((e) => <ErrorRow key={e.id} e={e} />)}</div>
}

function Audit() {
  const q = useQuery({ queryKey: ['admin', 'audit'], queryFn: adminAudit, retry: false })
  if (q.isLoading) return <Skeleton className="h-48" />
  if (q.error) return <p className="text-sm text-red-600">{message(q.error)}</p>
  if (!q.data?.length) return <p className="text-sm text-slate-500">Nenhuma ação registrada ainda.</p>
  return (
    <div className="space-y-2">
      {q.data.map((a, i) => (
        <Card key={i} className="p-3 text-sm">
          <div className="flex flex-wrap justify-between gap-2"><span className="font-medium">{actionLabel[a.action] ?? a.action}{a.workspace ? ` · ${a.workspace}` : ''}</span><span className="text-xs text-slate-500">{formatDate(a.created_at, 'dd/MM/yyyy HH:mm')} · {a.admin}</span></div>
          {Object.keys(a.detail ?? {}).length > 0 && <p className="mt-1 text-xs text-slate-500">{JSON.stringify(a.detail)}</p>}
        </Card>
      ))}
    </div>
  )
}

/** Painel do dono do SaaS: números gerais, negócios, erros e o registro das ações de administrador. */
export default function Admin() {
  const status = useAdminStatus()
  const [tab, setTab] = useState<Tab>('resumo')
  if (status.isLoading) return <Skeleton className="h-64" />
  // quem não é administrador não descobre que o painel existe
  if (status.data === 'none' || !status.data) return <p className="text-sm text-slate-500">Página não encontrada.</p>
  return (
    <div>
      <PageHeader
        title="Painel do Krono"
        description="Visão do dono da plataforma. Tudo aqui passa por checagem no servidor e as ações ficam registradas."
        actions={<Link to="/" className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-600 hover:underline"><ArrowLeft className="h-4 w-4" /> Voltar ao meu negócio</Link>}
      />
      {status.data === 'needs_2fa' ? <StepUp /> : (
        <div className="space-y-5">
          <Segmented value={tab} onChange={setTab} options={[{ value: 'resumo', label: 'Resumo' }, { value: 'negocios', label: 'Negócios' }, { value: 'erros', label: 'Erros' }, { value: 'auditoria', label: 'Registro' }]} />
          {tab === 'resumo' && <Overview />}
          {tab === 'negocios' && <Businesses />}
          {tab === 'erros' && <Errors />}
          {tab === 'auditoria' && <Audit />}
        </div>
      )}
    </div>
  )
}
