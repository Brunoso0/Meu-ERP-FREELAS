import { useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useFieldArray, useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { Check, Download, MoreHorizontal, Pencil, Plus, QrCode, Save, Trash2, Undo2 } from 'lucide-react'
import { PrintPortal } from '@/components/proposals/PrintPortal'
import { QuoteDocument } from '@/components/quotes/QuoteDocument'
import { confirm } from '@/components/ui/confirm'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { Dropdown, DropdownContent, DropdownItem, DropdownSeparator, DropdownTrigger } from '@/components/ui/overlays'
import { Badge, Button, Card, EmptyState, Field, Input, PageHeader, Select, Textarea } from '@/components/ui/primitives'
import { useInsert, useRemove, useTable, useUpdate } from '@/hooks/useData'
import { itemsTotal } from '@/lib/proposal'
import { buildQuoteDoc, type QuoteDoc, type QuoteDraft } from '@/lib/quote'
import { DEFAULT_DEPOSIT_PCT, depositAmount, quoteProgress, registerQuotePayment, undoQuotePayment } from '@/lib/quote-finance'
import { formatCurrency, formatDate, formatProposalNumber, formatQuoteNumber } from '@/lib/utils'
import { useUI } from '@/store/ui'
import type { Quote } from '@/types/database.types'

const schema = z
  .object({
    client_id: z.string(),
    customer_name: z.string(),
    title: z.string().min(3, 'Informe um título'),
    validity_days: z.coerce.number().int('Use dias inteiros').min(1, 'Mínimo de 1 dia'),
    items: z
      .array(
        z.object({
          description: z.string().min(1, 'Descreva o item'),
          quantity: z.coerce.number().positive('Inválida'),
          unit_price: z.coerce.number().min(0, 'Inválido'),
        }),
      )
      .min(1, 'Adicione ao menos um item'),
    notes: z.string(),
    proposal_id: z.string(),
    billing: z.enum(['full', 'deposit']),
    deposit_pct: z.coerce.number(),
  })
  .refine((v) => v.billing === 'full' || (Number.isInteger(v.deposit_pct) && v.deposit_pct >= 1 && v.deposit_pct <= 99), {
    path: ['deposit_pct'],
    message: 'Use de 1 a 99%',
  })
  .refine((v) => v.client_id || v.customer_name.trim().length >= 2, {
    path: ['customer_name'],
    message: 'Selecione um cliente ou informe o nome',
  })

type Values = z.infer<typeof schema>

const blank: Values = {
  client_id: '',
  customer_name: '',
  title: '',
  validity_days: 7,
  items: [{ description: '', quantity: 1, unit_price: 0 }],
  notes: '',
  proposal_id: '',
  billing: 'full',
  deposit_pct: DEFAULT_DEPOSIT_PCT,
}

const quoteStatus = {
  pending: { label: 'Aguardando Pix', tone: 'amber' },
  partial: { label: 'Parcialmente pago', tone: 'blue' },
  paid: { label: 'Pago', tone: 'green' },
} as const

export default function QuoteGenerator() {
  const quotes = useTable('quotes')
  const clients = useTable('clients')
  const profile = useTable('profiles').data?.[0]
  const transactions = useTable('financial_transactions').data ?? []
  const proposals = useTable('proposals')
  const qc = useQueryClient()
  const insert = useInsert('quotes')
  const update = useUpdate('quotes')
  const remove = useRemove('quotes')
  const openModal = useUI((s) => s.openModal)
  const [editing, setEditing] = useState<Quote | null>(null)
  // orçamento que está sendo mandado para a impressão (PDF)
  const [printing, setPrinting] = useState<QuoteDoc | null>(null)

  useEffect(() => {
    if (!printing) return
    const done = () => setPrinting(null)
    window.addEventListener('afterprint', done)
    // espera as fontes do documento, senão o PDF sai com fonte errada
    const timer = setTimeout(() => document.fonts.ready.then(() => window.print()), 300)
    return () => {
      clearTimeout(timer)
      window.removeEventListener('afterprint', done)
    }
  }, [printing])

  const {
    register,
    control,
    handleSubmit,
    watch,
    reset,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<Values>({ resolver: zodResolver(schema), defaultValues: blank })
  const items = useFieldArray({ control, name: 'items' })

  const values = watch()
  const clientOf = (id: string | null) => clients.data?.find((c) => c.id === id)
  const nextNumber = Math.max(0, ...(quotes.data ?? []).map((q) => q.quote_number)) + 1

  const cleanItems = (values.items ?? []).map((i) => ({
    description: i.description,
    quantity: Number(i.quantity) || 0,
    unit_price: Number(i.unit_price) || 0,
  }))

  const draft: QuoteDraft = {
    quote_number: editing?.quote_number ?? nextNumber,
    client_id: values.client_id || null,
    customer_name: values.client_id ? null : values.customer_name.trim() || null,
    title: values.title,
    items: cleanItems,
    notes: values.notes || null,
    total_amount: itemsTotal(cleanItems),
    validity_days: Number(values.validity_days) || 0,
    created_at: editing?.created_at,
    deposit_pct: values.billing === 'deposit' ? Number(values.deposit_pct) || null : null,
  }
  const progressOf = (q: Quote) => quoteProgress(transactions, q.id)
  const editingProgress = editing ? progressOf(editing) : null
  // com pagamento registrado, a forma de cobrança fica travada
  const billingLocked = (editingProgress?.received ?? 0) > 0
  const doc = buildQuoteDoc(draft, clientOf(draft.client_id), profile, editingProgress?.received ?? 0)

  // propostas que podem originar este orçamento: as que ainda não têm orçamento (ou a deste)
  const linkedProposals = new Set((quotes.data ?? []).filter((q) => q.proposal_id && q.id !== editing?.id).map((q) => q.proposal_id))
  const proposalOptions = (proposals.data ?? []).filter((p) => !linkedProposals.has(p.id))

  // escolher a proposta puxa cliente, título, itens e condições dela
  const pickProposal = (id: string) => {
    setValue('proposal_id', id)
    const p = proposals.data?.find((x) => x.id === id)
    if (!p) return
    if (p.client_id) setValue('client_id', p.client_id)
    setValue('title', p.title)
    const fromProposal = p.content?.items?.filter((i) => i.description?.trim()) ?? []
    items.replace(fromProposal.length ? fromProposal : [{ description: p.title, quantity: 1, unit_price: Number(p.total_amount) }])
    setValue('notes', [`Referente à proposta ${formatProposalNumber(p.proposal_number)}.`, p.payment_terms].filter(Boolean).join(' '))
  }

  const refreshLinked = () => Promise.all(['quotes', 'financial_transactions'].map((key) => qc.invalidateQueries({ queryKey: [key] })))

  const pay = async (q: Quote) => {
    try {
      const paid = await registerQuotePayment(q)
      await refreshLinked()
      if (paid) toast.success('Pagamento registrado', { description: `${formatCurrency(paid.amount)} · ${formatQuoteNumber(q.quote_number)}` })
    } catch (error) {
      toast.error('Não foi possível registrar o pagamento', { description: error instanceof Error ? error.message : undefined })
    }
  }

  const undoPayment = async (q: Quote) => {
    try {
      const reopened = await undoQuotePayment(q)
      await refreshLinked()
      if (reopened) toast.success('Pagamento desfeito', { description: `${formatCurrency(reopened.amount)} voltou para pendente` })
    } catch (error) {
      toast.error('Não foi possível desfazer', { description: error instanceof Error ? error.message : undefined })
    }
  }

  const startNew = () => {
    setEditing(null)
    reset(blank)
  }

  const edit = (q: Quote) => {
    setEditing(q)
    reset({
      client_id: q.client_id ?? '',
      customer_name: q.customer_name ?? '',
      title: q.title,
      validity_days: q.validity_days,
      items: q.items?.length ? q.items : blank.items,
      notes: q.notes ?? '',
      proposal_id: q.proposal_id ?? '',
      billing: q.deposit_pct ? 'deposit' : 'full',
      deposit_pct: q.deposit_pct ?? DEFAULT_DEPOSIT_PCT,
    })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const save = (thenDownload: boolean) =>
    handleSubmit(async () => {
      // o número exibido é só uma prévia: quem numera é o banco (trigger) ou o repositório demo
      const { quote_number: _preview, created_at: _created, ...rest } = draft
      const payload = { ...rest, proposal_id: values.proposal_id || null }
      try {
        const saved = editing
          ? await update.mutateAsync({ id: editing.id, patch: payload })
          : await insert.mutateAsync({ ...payload, status: 'pending' })
        toast.success(`Orçamento ${formatQuoteNumber(saved.quote_number)} salvo`)
        if (thenDownload) setPrinting(buildQuoteDoc(saved, clientOf(saved.client_id), profile, editingProgress?.received ?? 0))
        startNew()
      } catch {
        // toast de erro já exibido pelo hook
      }
    })()

  const handleDelete = async (q: Quote) => {
    const description =
      q.status === 'paid'
        ? 'O recebimento já lançado no financeiro continua lá. Esta ação não pode ser desfeita.'
        : q.status === 'partial'
          ? 'O que já foi pago continua no financeiro; o que falta receber sai. Esta ação não pode ser desfeita.'
          : 'A cobrança pendente dele também sai do financeiro. Esta ação não pode ser desfeita.'
    if (!(await confirm({ title: `Excluir o orçamento ${formatQuoteNumber(q.quote_number)}?`, description }))) return
    remove.mutate(q.id, { onSuccess: () => toast.success('Orçamento excluído') })
    if (editing?.id === q.id) startNew()
  }

  const columns: Column<Quote>[] = [
    { header: 'Nº', cell: (q) => <span className="tabular font-medium text-slate-500 dark:text-slate-400">{formatQuoteNumber(q.quote_number)}</span> },
    {
      header: 'Orçamento',
      cell: (q) => {
        const c = clientOf(q.client_id)
        return (
          <div className="min-w-0">
            <p className="truncate font-medium">{q.title}</p>
            <p className="truncate text-xs text-slate-500 dark:text-slate-400">{c ? c.company_name ?? c.name : q.customer_name ?? '—'}</p>
          </div>
        )
      },
    },
    {
      header: 'Situação',
      cell: (q) => (
        <div>
          <Badge tone={quoteStatus[q.status].tone}>{quoteStatus[q.status].label}</Badge>
          {q.deposit_pct ? (
            <p className="tabular mt-1 whitespace-nowrap text-xs text-slate-500 dark:text-slate-400">
              {formatCurrency(progressOf(q).received)} de {formatCurrency(q.total_amount)}
            </p>
          ) : null}
        </div>
      ),
    },
    { header: 'Emitido em', cell: (q) => <span className="tabular text-slate-600 dark:text-slate-300">{formatDate(q.created_at)}</span> },
    { header: 'Valor', className: 'text-right', cell: (q) => <span className="tabular font-medium">{formatCurrency(q.total_amount)}</span> },
    {
      header: '',
      className: 'w-12 text-right',
      cell: (q) => {
        const { next, lastPaid, received } = progressOf(q)
        const payLabel = !next ? null : !q.deposit_pct ? 'Marcar como pago' : next.installment === 1 ? `Registrar entrada (${formatCurrency(next.amount)})` : `Registrar saldo (${formatCurrency(next.amount)})`
        return (
        <Dropdown>
          <DropdownTrigger asChild>
            <Button variant="ghost" size="icon" aria-label="Ações" className="h-8 w-8">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownTrigger>
          <DropdownContent>
            <DropdownItem icon={Download} onSelect={() => setPrinting(buildQuoteDoc(q, clientOf(q.client_id), profile, received))}>Salvar em PDF / Imprimir</DropdownItem>
            <DropdownItem icon={Pencil} onSelect={() => edit(q)}>Editar</DropdownItem>
            {payLabel && (
              <DropdownItem icon={Check} onSelect={() => pay(q)}>
                {payLabel}
              </DropdownItem>
            )}
            {lastPaid && (
              <DropdownItem icon={Undo2} onSelect={() => undoPayment(q)}>
                Desfazer último pagamento
              </DropdownItem>
            )}
            <DropdownSeparator />
            <DropdownItem icon={Trash2} danger onSelect={() => handleDelete(q)}>Excluir</DropdownItem>
          </DropdownContent>
        </Dropdown>
        )
      },
    },
  ]

  return (
    <>
      <PageHeader
        title="Gerador de orçamentos"
        description={editing ? `Editando ${formatQuoteNumber(editing.quote_number)}` : `Próxima numeração: ${formatQuoteNumber(nextNumber)} · pagamento via Pix`}
        actions={
          <>
            {editing && (
              <Button variant="ghost" onClick={startNew}>
                Cancelar edição
              </Button>
            )}
            <Button variant="secondary" loading={isSubmitting} onClick={() => save(true)}>
              <Download className="h-4 w-4" /> Salvar e gerar PDF
            </Button>
            <Button loading={isSubmitting} onClick={() => save(false)}>
              <Save className="h-4 w-4" /> Salvar orçamento
            </Button>
          </>
        }
      />

      {profile && !profile.pix_key && !profile.pix_qr_image && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-200">
          <span>Você ainda não cadastrou sua chave Pix nem o QR Code. Sem eles, o orçamento sai sem o bloco de pagamento.</span>
          <Button variant="secondary" size="sm" onClick={() => openModal({ type: 'profile', record: profile })}>
            Cadastrar Pix
          </Button>
        </div>
      )}

      <div className="grid items-start gap-4 xl:grid-cols-2">
        <form className="space-y-4" onSubmit={(e) => e.preventDefault()}>
          <Card className="grid gap-4 p-5 sm:grid-cols-2">
            <h2 className="text-sm font-semibold sm:col-span-2">Cliente e identificação</h2>
            <Field label="Referente à proposta (opcional)" className="sm:col-span-2">
              <Select value={values.proposal_id} onChange={(e) => (e.target.value ? pickProposal(e.target.value) : setValue('proposal_id', ''))}>
                <option value="">Nenhuma (orçamento avulso)</option>
                {proposalOptions.map((p) => (
                  <option key={p.id} value={p.id}>
                    {formatProposalNumber(p.proposal_number)} · {p.title} · {formatCurrency(p.total_amount)}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Cliente cadastrado">
              <Select {...register('client_id')}>
                <option value="">Cliente avulso (digitar nome)</option>
                {clients.data?.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.company_name ? `${c.name} — ${c.company_name}` : c.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Nome do cliente avulso" error={errors.customer_name?.message}>
              <Input disabled={!!values.client_id} placeholder={values.client_id ? 'Usando o cliente cadastrado' : 'Ex.: Padaria do Bairro'} {...register('customer_name')} />
            </Field>
            <Field label="Título do orçamento" error={errors.title?.message}>
              <Input placeholder="Ex.: Atualização do cadastro de clientes" {...register('title')} />
            </Field>
            <Field label="Validade (dias)" error={errors.validity_days?.message}>
              <Input type="number" min={1} {...register('validity_days')} />
            </Field>
          </Card>

          <Card className="p-5">
            <div className="mb-4 flex items-center justify-between gap-3">
              <h2 className="text-sm font-semibold">Itens</h2>
              <Button variant="secondary" size="sm" onClick={() => items.append({ description: '', quantity: 1, unit_price: 0 })}>
                <Plus className="h-3.5 w-3.5" /> Item
              </Button>
            </div>
            <div className="space-y-2">
              {items.fields.map((f, i) => (
                <div key={f.id} className="flex items-start gap-2">
                  <div className="flex-1">
                    <Input placeholder="Descrição do serviço" aria-label={`Item ${i + 1}`} {...register(`items.${i}.description`)} />
                    {errors.items?.[i]?.description && <span className="mt-1 block text-xs text-red-600 dark:text-red-400">{errors.items[i]?.description?.message}</span>}
                  </div>
                  <Input type="number" min={0} step="0.5" aria-label="Quantidade" title="Quantidade" className="w-20" {...register(`items.${i}.quantity`)} />
                  <Input type="number" min={0} step="0.01" aria-label="Valor unitário" title="Valor unitário (R$)" className="w-32" {...register(`items.${i}.unit_price`)} />
                  <Button variant="ghost" size="icon" aria-label="Remover item" onClick={() => items.remove(i)} className="shrink-0">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
              {(errors.items?.message || errors.items?.root?.message) && (
                <p className="text-xs text-red-600 dark:text-red-400">{errors.items?.message ?? errors.items?.root?.message}</p>
              )}
            </div>
            <div className="mt-4 flex items-center justify-between border-t pt-3">
              <span className="text-sm font-medium">Total</span>
              <span className="tabular text-lg font-semibold">{formatCurrency(draft.total_amount)}</span>
            </div>
          </Card>

          <Card className="space-y-3 p-5">
            <h2 className="text-sm font-semibold">Forma de pagamento</h2>
            <div className="flex flex-wrap items-end gap-3">
              <Field label="Cobrança" className="w-full sm:w-56">
                <Select disabled={billingLocked} {...register('billing')}>
                  <option value="full">Valor integral</option>
                  <option value="deposit">Entrada + saldo</option>
                </Select>
              </Field>
              {values.billing === 'deposit' && (
                <Field label="Entrada (%)" error={errors.deposit_pct?.message} className="w-28">
                  <Input type="number" min={1} max={99} step={1} disabled={billingLocked} {...register('deposit_pct')} />
                </Field>
              )}
            </div>
            {values.billing === 'deposit' && Number(values.deposit_pct) >= 1 && Number(values.deposit_pct) <= 99 && (
              <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600 dark:bg-slate-800/60 dark:text-slate-300">
                Entrada de <span className="tabular font-medium">{formatCurrency(depositAmount(draft.total_amount, Number(values.deposit_pct)))}</span> agora e saldo de{' '}
                <span className="tabular font-medium">{formatCurrency(draft.total_amount - depositAmount(draft.total_amount, Number(values.deposit_pct)))}</span> depois. O orçamento fica
                como parcialmente pago até o saldo entrar.
              </p>
            )}
            {billingLocked && <p className="text-xs text-slate-500 dark:text-slate-400">Já há pagamento registrado: a forma de cobrança não pode mais mudar.</p>}
          </Card>

          <Card className="p-5">
            <Field label="Observações (prazo de entrega, o que está incluso…)">
              <Textarea rows={3} {...register('notes')} />
            </Field>
          </Card>
        </form>

        <div className="xl:sticky xl:top-20">
          <p className="mb-2 text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">Pré-visualização</p>
          <div className="max-h-[calc(100vh-8rem)] overflow-y-auto rounded-xl">
            <QuoteDocument doc={doc} />
          </div>
        </div>
      </div>

      {printing && (
        <PrintPortal>
          <QuoteDocument doc={printing} />
        </PrintPortal>
      )}

      <Card className="mt-6">
        <h2 className="border-b px-5 py-3.5 text-sm font-semibold">Orçamentos salvos</h2>
        <DataTable
          columns={columns}
          rows={quotes.data}
          loading={quotes.isLoading}
          empty={<EmptyState icon={QrCode} title="Nenhum orçamento salvo" description="Monte um orçamento acima e salve para enviar o PDF com o QR Code do Pix." className="py-10" />}
        />
      </Card>
    </>
  )
}
