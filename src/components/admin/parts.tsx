import { useState, type ReactNode } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { ShieldCheck } from 'lucide-react'
import { toast } from 'sonner'
import { Button, Card, Input, Skeleton } from '@/components/ui/primitives'
import { ADMIN_STATUS_KEY } from '@/lib/admin'
import { activeFactor, verifyCode } from '@/lib/mfa'

export const message = (e: unknown) => (e instanceof Error ? e.message : 'Erro inesperado.')
export const planLabel: Record<string, string> = { free: 'Grátis', essential: 'Essencial', pro: 'Profissional' }
export const statusLabel: Record<string, string> = { none: 'Sem plano', trialing: 'Em teste', active: 'Ativo', past_due: 'Em atraso', canceled: 'Cancelado', courtesy: 'Cortesia' }
export const statusTone: Record<string, 'slate' | 'green' | 'amber' | 'red' | 'blue' | 'indigo'> = { none: 'slate', trialing: 'blue', active: 'green', past_due: 'red', canceled: 'amber', courtesy: 'indigo' }
export const businessLabel: Record<string, string> = { mei: 'MEI', me: 'ME', epp: 'EPP', outra_pj: 'Outra PJ', pf: 'Sem CNPJ' }

export function Stat({ label, value, hint, tone }: { label: string; value: ReactNode; hint?: string; tone?: 'red' }) {
  return (
    <Card className="p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className={`mt-1 text-2xl font-semibold tabular-nums ${tone === 'red' ? 'text-red-600' : ''}`}>{value}</p>
      {hint && <p className="mt-0.5 text-xs text-slate-500">{hint}</p>}
    </Card>
  )
}

/** Carrega um bloco do painel e mostra erro ou esqueleto enquanto isso. */
export function Loaded<T>({ query, children }: { query: { isLoading: boolean; error: unknown; data?: T }; children: (data: T) => ReactNode }) {
  if (query.isLoading) return <Skeleton className="h-64" />
  if (query.error || !query.data) return <p className="text-sm text-red-600">{message(query.error)}</p>
  return <>{children(query.data)}</>
}

/** Barras horizontais simples para distribuições (origem, tipo de negócio, estado...). */
export function Distribution({ data, labels }: { data: Record<string, number>; labels?: Record<string, string> }) {
  const entries = Object.entries(data).sort((a, b) => b[1] - a[1])
  const max = Math.max(1, ...entries.map(([, n]) => n))
  if (!entries.length) return <p className="text-sm text-slate-500">Sem dados ainda.</p>
  return (
    <ul className="space-y-2">
      {entries.map(([k, n]) => (
        <li key={k} className="text-sm">
          <div className="mb-0.5 flex justify-between"><span>{labels?.[k] ?? k}</span><span className="tabular-nums text-slate-500">{n}</span></div>
          <div className="h-1.5 rounded-full bg-slate-100 dark:bg-slate-800"><div className="h-1.5 rounded-full bg-brand-500" style={{ width: `${(n / max) * 100}%` }} /></div>
        </li>
      ))}
    </ul>
  )
}

/** Confirma o código do autenticador nesta sessão: o banco só entrega os dados do painel depois disso. */
export function StepUp() {
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
    <Card className="mx-auto mt-10 max-w-md p-6">
      <div className="mb-3 flex items-center gap-2 text-lg font-semibold"><ShieldCheck className="h-5 w-5 text-brand-600" /> Confirme que é você</div>
      {factor.isLoading ? <Skeleton className="h-20" /> : factor.data ? (
        <div className="space-y-3">
          <p className="text-sm text-slate-500">O modo administrador mostra dados de todos os clientes. Digite o código de 6 dígitos do aplicativo autenticador para entrar.</p>
          <Input value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} onKeyDown={(e) => e.key === 'Enter' && code.length === 6 && void confirmCode()} inputMode="numeric" placeholder="000000" autoFocus />
          <Button type="button" onClick={confirmCode} loading={busy} disabled={code.length !== 6}>Entrar no modo administrador</Button>
        </div>
      ) : (
        <div className="space-y-3 text-sm text-slate-500">
          <p>Para usar o modo administrador você precisa ter a <strong>verificação em duas etapas</strong> ativa.</p>
          <p>Ative em Minha empresa &gt; Segurança, saia e entre de novo, e volte aqui.</p>
          <Link to="/minha-empresa" className="font-medium text-brand-600 underline">Ir para Minha empresa</Link>
        </div>
      )}
    </Card>
  )
}
