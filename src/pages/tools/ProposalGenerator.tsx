import { useMemo } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useFieldArray, useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { Download, Plus, Save, Trash2 } from 'lucide-react'
import { ProposalDocument } from '@/components/proposals/ProposalDocument'
import { Button, Card, Field, Input, PageHeader, Select, Textarea } from '@/components/ui/primitives'
import { useInsert, useTable } from '@/hooks/useData'
import { buildProposalDoc, itemsTotal } from '@/lib/proposal'
import { formatCurrency, formatProposalNumber } from '@/lib/utils'
import { useUI } from '@/store/ui'
import type { CalculatorPrefill } from './BudgetCalculator'

const schema = z.object({
  client_id: z.string().min(1, 'Selecione um cliente'),
  title: z.string().min(3, 'Informe um título'),
  validity_days: z.coerce.number().int('Use dias inteiros').min(1, 'Mínimo de 1 dia'),
  scope_text: z.string().min(10, 'Descreva o escopo em pelo menos uma frase'),
  deliverables: z.array(z.object({ text: z.string().min(1, 'Preencha ou remova') })),
  schedule: z.array(z.object({ label: z.string().min(1, 'Preencha ou remova'), duration: z.string() })),
  items: z
    .array(
      z.object({
        description: z.string().min(1, 'Descreva o item'),
        quantity: z.coerce.number().positive('Inválida'),
        unit_price: z.coerce.number().min(0, 'Inválido'),
      }),
    )
    .min(1, 'Adicione ao menos um item de preço'),
  payment_terms: z.string().min(3, 'Informe as condições de pagamento'),
})

type Values = z.infer<typeof schema>

function Block({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <Card className="p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold">{title}</h2>
        {action}
      </div>
      {children}
    </Card>
  )
}

const AddButton = ({ onClick, children }: { onClick: () => void; children: React.ReactNode }) => (
  <Button variant="secondary" size="sm" onClick={onClick}>
    <Plus className="h-3.5 w-3.5" /> {children}
  </Button>
)

const RemoveButton = ({ onClick }: { onClick: () => void }) => (
  <Button variant="ghost" size="icon" aria-label="Remover" onClick={onClick} className="shrink-0">
    <Trash2 className="h-4 w-4" />
  </Button>
)

export default function ProposalGenerator() {
  const navigate = useNavigate()
  const prefill = (useLocation().state as { prefill?: CalculatorPrefill } | null)?.prefill
  const openModal = useUI((s) => s.openModal)
  const clients = useTable('clients')
  const proposals = useTable('proposals')
  const profile = useTable('profiles').data?.[0]
  const insert = useInsert('proposals')

  const {
    register,
    control,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      client_id: '',
      title: '',
      validity_days: 15,
      scope_text: '',
      deliverables: [{ text: '' }],
      schedule: [{ label: '', duration: '' }],
      items: prefill?.items?.length ? prefill.items : [{ description: '', quantity: 1, unit_price: 0 }],
      payment_terms: '50% na aprovação e 50% na entrega, via PIX.',
    },
  })

  const deliverables = useFieldArray({ control, name: 'deliverables' })
  const schedule = useFieldArray({ control, name: 'schedule' })
  const items = useFieldArray({ control, name: 'items' })

  const values = watch()
  const client = clients.data?.find((c) => c.id === values.client_id)
  // numeração sequencial: último número + 1 (no Supabase o trigger confirma ao salvar)
  const nextNumber = Math.max(0, ...(proposals.data ?? []).map((p) => p.proposal_number)) + 1

  const cleanItems = (values.items ?? []).map((i) => ({
    description: i.description,
    quantity: Number(i.quantity) || 0,
    unit_price: Number(i.unit_price) || 0,
  }))
  const total = itemsTotal(cleanItems)

  const draft = useMemo(
    () => ({
      proposal_number: nextNumber,
      client_id: values.client_id || null,
      title: values.title,
      scope_text: values.scope_text,
      content: {
        deliverables: (values.deliverables ?? []).map((d) => d.text),
        schedule: values.schedule ?? [],
        items: cleanItems,
      },
      total_amount: total,
      validity_days: Number(values.validity_days) || 0,
      payment_terms: values.payment_terms,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [JSON.stringify(values), nextNumber],
  )

  const doc = buildProposalDoc(draft, client, profile)

  const save = (thenDownload: boolean) =>
    handleSubmit(async () => {
      try {
        // o número exibido é só uma prévia: quem numera é o banco (trigger) ou o repositório demo
        const { proposal_number: _preview, ...values } = draft
        const created = await insert.mutateAsync({ ...values, status: 'draft' })
        toast.success(`Proposta ${formatProposalNumber(created.proposal_number)} salva`)
        // o PDF sai da própria página da proposta, pela impressão do navegador
        navigate(`/propostas/${created.id}`, { state: { print: thenDownload } })
      } catch {
        // toast de erro já exibido pelo hook
      }
    })()

  return (
    <>
      <PageHeader
        title="Gerador de propostas"
        description={`Próxima numeração: ${formatProposalNumber(nextNumber)}`}
        actions={
          <>
            <Button variant="secondary" loading={isSubmitting} onClick={() => save(true)}>
              <Download className="h-4 w-4" /> Salvar e gerar PDF
            </Button>
            <Button loading={isSubmitting} onClick={() => save(false)}>
              <Save className="h-4 w-4" /> Salvar proposta
            </Button>
          </>
        }
      />

      <div className="grid items-start gap-4 xl:grid-cols-2">
        <form className="space-y-4" onSubmit={(e) => e.preventDefault()}>
          <Block
            title="Cliente e identificação"
            action={
              <Button variant="ghost" size="sm" onClick={() => openModal({ type: 'client' })}>
                <Plus className="h-3.5 w-3.5" /> Novo cliente
              </Button>
            }
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Cliente" error={errors.client_id?.message} className="sm:col-span-2">
                <Select {...register('client_id')}>
                  <option value="">Selecione…</option>
                  {clients.data?.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.company_name ? `${c.name} — ${c.company_name}` : c.name}
                    </option>
                  ))}
                </Select>
              </Field>
              {client && (
                <dl className="grid grid-cols-2 gap-x-4 gap-y-1 rounded-lg bg-slate-50 p-3 text-xs sm:col-span-2 dark:bg-slate-800/60">
                  {(
                    [
                      ['Documento', client.document],
                      ['E-mail', client.email],
                      ['WhatsApp', client.phone],
                      ['Empresa', client.company_name],
                    ] as const
                  ).map(([label, value]) => (
                    <div key={label} className="min-w-0">
                      <dt className="text-slate-500 dark:text-slate-400">{label}</dt>
                      <dd className="truncate font-medium">{value || '—'}</dd>
                    </div>
                  ))}
                </dl>
              )}
              <Field label="Título da proposta" error={errors.title?.message}>
                <Input placeholder="Ex.: Novo site institucional" {...register('title')} />
              </Field>
              <Field label="Validade (dias)" error={errors.validity_days?.message}>
                <Input type="number" min={1} {...register('validity_days')} />
              </Field>
            </div>
          </Block>

          <Block title="Escopo">
            <Field label="O que será feito" error={errors.scope_text?.message}>
              <Textarea rows={4} placeholder="Descreva o objetivo e os limites do trabalho." {...register('scope_text')} />
            </Field>
          </Block>

          <Block title="Entregáveis" action={<AddButton onClick={() => deliverables.append({ text: '' })}>Entregável</AddButton>}>
            <div className="space-y-2">
              {deliverables.fields.map((f, i) => (
                <div key={f.id} className="flex items-start gap-2">
                  <div className="flex-1">
                    <Input placeholder="Ex.: Layout responsivo em Figma" aria-label={`Entregável ${i + 1}`} {...register(`deliverables.${i}.text`)} />
                    {errors.deliverables?.[i]?.text && <span className="mt-1 block text-xs text-red-600 dark:text-red-400">{errors.deliverables[i]?.text?.message}</span>}
                  </div>
                  <RemoveButton onClick={() => deliverables.remove(i)} />
                </div>
              ))}
              {deliverables.fields.length === 0 && <p className="text-sm text-slate-500 dark:text-slate-400">Sem entregáveis listados — o bloco fica fora da proposta.</p>}
            </div>
          </Block>

          <Block title="Cronograma" action={<AddButton onClick={() => schedule.append({ label: '', duration: '' })}>Etapa</AddButton>}>
            <div className="space-y-2">
              {schedule.fields.map((f, i) => (
                <div key={f.id} className="flex items-start gap-2">
                  <div className="flex-1">
                    <Input placeholder="Etapa" aria-label={`Etapa ${i + 1}`} {...register(`schedule.${i}.label`)} />
                    {errors.schedule?.[i]?.label && <span className="mt-1 block text-xs text-red-600 dark:text-red-400">{errors.schedule[i]?.label?.message}</span>}
                  </div>
                  <Input placeholder="Duração" aria-label={`Duração da etapa ${i + 1}`} className="w-32" {...register(`schedule.${i}.duration`)} />
                  <RemoveButton onClick={() => schedule.remove(i)} />
                </div>
              ))}
              {schedule.fields.length === 0 && <p className="text-sm text-slate-500 dark:text-slate-400">Sem etapas — o bloco fica fora da proposta.</p>}
            </div>
          </Block>

          <Block title="Tabela de preços" action={<AddButton onClick={() => items.append({ description: '', quantity: 1, unit_price: 0 })}>Item</AddButton>}>
            <div className="space-y-2">
              {items.fields.map((f, i) => (
                <div key={f.id} className="flex items-start gap-2">
                  <div className="flex-1">
                    <Input placeholder="Descrição do item" aria-label={`Item ${i + 1}`} {...register(`items.${i}.description`)} />
                    {errors.items?.[i]?.description && <span className="mt-1 block text-xs text-red-600 dark:text-red-400">{errors.items[i]?.description?.message}</span>}
                  </div>
                  <Input type="number" min={0} step="0.5" aria-label="Quantidade" title="Quantidade" className="w-20" {...register(`items.${i}.quantity`)} />
                  <Input type="number" min={0} step="0.01" aria-label="Valor unitário" title="Valor unitário (R$)" className="w-32" {...register(`items.${i}.unit_price`)} />
                  <RemoveButton onClick={() => items.remove(i)} />
                </div>
              ))}
              {(errors.items?.message || errors.items?.root?.message) && (
                <p className="text-xs text-red-600 dark:text-red-400">{errors.items?.message ?? errors.items?.root?.message}</p>
              )}
            </div>
            <div className="mt-4 flex items-center justify-between border-t pt-3">
              <span className="text-sm font-medium">Total</span>
              <span className="tabular text-lg font-semibold">{formatCurrency(total)}</span>
            </div>
          </Block>

          <Block title="Condições de pagamento">
            <Field label="Como e quando o cliente paga" error={errors.payment_terms?.message}>
              <Textarea rows={3} {...register('payment_terms')} />
            </Field>
          </Block>
        </form>

        <div className="xl:sticky xl:top-20">
          <p className="mb-2 text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">Pré-visualização</p>
          <div className="max-h-[calc(100vh-8rem)] overflow-y-auto rounded-xl">
            <ProposalDocument doc={doc} />
          </div>
        </div>
      </div>
    </>
  )
}
