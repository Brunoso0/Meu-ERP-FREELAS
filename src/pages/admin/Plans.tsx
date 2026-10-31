import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { confirm } from '@/components/ui/confirm'
import { Badge, Button, Card, Field, Input, PageHeader } from '@/components/ui/primitives'
import { adminPlans, adminUpdatePlan, type AdminPlan } from '@/lib/admin'
import { formatCurrency } from '@/lib/utils'
import { Loaded, message } from '@/components/admin/parts'

/** Limites conhecidos, com nome em português. Vazio = sem limite. Chaves que não estão aqui são preservadas. */
const NUMERIC: Array<[string, string]> = [
  ['members', 'Membros'], ['viewers', 'Leitura (contador)'], ['clients', 'Clientes'], ['proposals_month', 'Propostas por mês'],
  ['quotes_month', 'Orçamentos por mês'], ['leads_month', 'Buscas de leads por mês'], ['storage_mb', 'Armazenamento (MB)'],
]
const FLAGS: Array<[string, string]> = [['signature', 'Assinatura de propostas'], ['billing', 'Cobrança pelo Asaas'], ['nfse', 'Notas fiscais'], ['reminders', 'Lembretes']]

const toCents = (reais: string) => Math.round(Number(reais.replace(',', '.')) * 100)

function PlanCard({ plan }: { plan: AdminPlan }) {
  const qc = useQueryClient()
  const [edit, setEdit] = useState(false)
  const [price, setPrice] = useState(String(plan.price_cents / 100))
  const [extra, setExtra] = useState(String(plan.extra_member_cents / 100))
  const [nums, setNums] = useState<Record<string, string>>(() => Object.fromEntries(NUMERIC.map(([k]) => [k, plan.limits[k] === undefined ? '' : String(plan.limits[k])])))
  const [flags, setFlags] = useState<Record<string, boolean>>(() => Object.fromEntries(FLAGS.map(([k]) => [k, plan.limits[k] === true])))
  const [note, setNote] = useState('')

  const save = useMutation({
    mutationFn: async () => {
      const limits: Record<string, number | boolean> = { ...plan.limits }
      for (const [k] of NUMERIC) {
        if (nums[k] === '') delete limits[k]
        else limits[k] = Number(nums[k])
      }
      for (const [k] of FLAGS) limits[k] = flags[k]
      const ok = await confirm({
        title: `Salvar o plano ${plan.name}?`,
        description: `Novo preço ${formatCurrency(toCents(price) / 100)}. Vale para quem assinar daqui para frente; assinaturas em andamento mantêm o valor já combinado no Asaas. Limites novos valem na hora para todos os negócios deste plano.`,
        confirmLabel: 'Salvar',
        tone: 'default',
      })
      if (!ok) return false
      await adminUpdatePlan(plan.id, toCents(price), toCents(extra), limits, note)
      return true
    },
    onSuccess: (done) => { if (done) { toast.success('Plano atualizado e registrado'); setEdit(false); void qc.invalidateQueries({ queryKey: ['admin'] }) } },
    onError: (e) => toast.error('Não foi possível salvar', { description: message(e) }),
  })

  const valid = Number.isFinite(toCents(price)) && toCents(price) >= 0 && Number.isFinite(toCents(extra)) && toCents(extra) >= 0

  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold">{plan.name}</h2>
          <p className="text-sm text-slate-500">{formatCurrency(plan.price_cents / 100)}/mês{plan.extra_member_cents > 0 && ` · membro extra ${formatCurrency(plan.extra_member_cents / 100)}`}</p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <Badge tone="green">{plan.paying} pagando</Badge><Badge tone="blue">{plan.trialing} em teste</Badge><Badge tone="indigo">{plan.courtesy} cortesia</Badge><Badge>{plan.workspaces} no total</Badge>
        </div>
      </div>
      {!edit ? (
        <>
          <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-xs sm:grid-cols-3">
            {NUMERIC.map(([k, label]) => <div key={k}><dt className="text-slate-500">{label}</dt><dd>{plan.limits[k] === undefined ? 'sem limite' : String(plan.limits[k])}</dd></div>)}
            {FLAGS.map(([k, label]) => <div key={k}><dt className="text-slate-500">{label}</dt><dd>{plan.limits[k] === true ? 'incluso' : 'não incluso'}</dd></div>)}
          </dl>
          <Button type="button" variant="secondary" className="mt-3" onClick={() => setEdit(true)}>Editar plano</Button>
        </>
      ) : (
        <div className="mt-4 space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Preço mensal (R$)"><Input value={price} onChange={(e) => setPrice(e.target.value)} inputMode="decimal" /></Field>
            <Field label="Membro extra (R$)"><Input value={extra} onChange={(e) => setExtra(e.target.value)} inputMode="decimal" /></Field>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            {NUMERIC.map(([k, label]) => (
              <Field key={k} label={label}><Input value={nums[k]} onChange={(e) => setNums({ ...nums, [k]: e.target.value.replace(/\D/g, '') })} inputMode="numeric" placeholder="sem limite" /></Field>
            ))}
          </div>
          <div className="flex flex-wrap gap-4 text-sm">
            {FLAGS.map(([k, label]) => (
              <label key={k} className="inline-flex items-center gap-2"><input type="checkbox" checked={flags[k]} onChange={(e) => setFlags({ ...flags, [k]: e.target.checked })} />{label}</label>
            ))}
          </div>
          <Field label="Motivo (fica no registro)"><Input value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} /></Field>
          <div className="flex gap-2">
            <Button type="button" variant="ghost" onClick={() => setEdit(false)} disabled={save.isPending}>Cancelar</Button>
            <Button type="button" onClick={() => save.mutate()} loading={save.isPending} disabled={!valid}>Salvar plano</Button>
          </div>
        </div>
      )}
    </Card>
  )
}

export default function Plans() {
  const q = useQuery({ queryKey: ['admin', 'plans'], queryFn: adminPlans, retry: false })
  return (
    <div>
      <PageHeader title="Planos" description="Preço, limites e quem usa cada plano. Toda alteração fica no registro de ações." />
      <Loaded query={q}>{(plans) => <div className="space-y-3">{plans.map((p) => <PlanCard key={p.id} plan={p} />)}</div>}</Loaded>
    </div>
  )
}
