import { useEffect, useState } from 'react'
import { useFieldArray, useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { Check, Download, MoreHorizontal, Pencil, Plus, QrCode, Save, Trash2, Undo2 } from 'lucide-react'
import { PrintPortal } from '@/components/proposals/PrintPortal'
import { QuoteDocument } from '@/components/quotes/QuoteDocument'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { Dropdown, DropdownContent, DropdownItem, DropdownSeparator, DropdownTrigger } from '@/components/ui/overlays'
import { Badge, Button, Card, EmptyState, Field, Input, PageHeader, Select, Textarea } from '@/components/ui/primitives'
import { useInsert, useRemove, useTable, useUpdate } from '@/hooks/useData'
import { itemsTotal } from '@/lib/proposal'
import { buildQuoteDoc, type QuoteDoc, type QuoteDraft } from '@/lib/quote'
import { formatCurrency, formatDate, formatQuoteNumber } from '@/lib/utils'
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
}

const quoteStatus = { pending: { label: 'Aguardando Pix', tone: 'amber' }, paid: { label: 'Pago', tone: 'green' } } as const

export default function QuoteGenerator() {
  const quotes = useTable('quotes')
  const clients = useTable('clients')
  const profile = useTable('profiles').data?.[0]
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
  }
  const doc = buildQuoteDoc(draft, clientOf(draft.client_id), profile)

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
    })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const save = (thenDownload: boolean) =>
    handleSubmit(async () => {
      // o número exibido é só uma prévia: quem numera é o banco (trigger) ou o repositório demo
      const { quote_number: _preview, created_at: _created, ...payload } = draft
      try {
        const saved = editing
          ? await update.mutateAsync({ id: editing.id, patch: payload })
          : await insert.mutateAsync({ ...payload, status: 'pending' })
        toast.success(`Orçamento ${formatQuoteNumber(saved.quote_number)} salvo`)
        if (thenDownload) setPrinting(buildQuoteDoc(saved, clientOf(saved.client_id), profile))
        startNew()
      } catch {
        // toast de erro já exibido pelo hook
      }
    })()

  const handleDelete = (q: Quote) => {
    if (!window.confirm(`Excluir o orçamento ${formatQuoteNumber(q.quote_number)}?`)) return
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
    { header: 'Situação', cell: (q) => <Badge tone={quoteStatus[q.status].tone}>{quoteStatus[q.status].label}</Badge> },
    { header: 'Emitido em', cell: (q) => <span className="tabular text-slate-600 dark:text-slate-300">{formatDate(q.created_at)}</span> },
    { header: 'Valor', className: 'text-right', cell: (q) => <span className="tabular font-medium">{formatCurrency(q.total_amount)}</span> },
    {
      header: '',
      className: 'w-12 text-right',
      cell: (q) => (
        <Dropdown>
          <DropdownTrigger asChild>
            <Button variant="ghost" size="icon" aria-label="Ações" className="h-8 w-8">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownTrigger>
          <DropdownContent>
            <DropdownItem icon={Download} onSelect={() => setPrinting(buildQuoteDoc(q, clientOf(q.client_id), profile))}>Salvar em PDF / Imprimir</DropdownItem>
            <DropdownItem icon={Pencil} onSelect={() => edit(q)}>Editar</DropdownItem>
            {q.status === 'pending' ? (
              <DropdownItem icon={Check} onSelect={() => update.mutate({ id: q.id, patch: { status: 'paid' } }, { onSuccess: () => toast.success('Orçamento marcado como pago') })}>
                Marcar como pago
              </DropdownItem>
            ) : (
              <DropdownItem icon={Undo2} onSelect={() => update.mutate({ id: q.id, patch: { status: 'pending' } })}>Voltar para aguardando</DropdownItem>
            )}
            <DropdownSeparator />
            <DropdownItem icon={Trash2} danger onSelect={() => handleDelete(q)}>Excluir</DropdownItem>
          </DropdownContent>
        </Dropdown>
      ),
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
