import { useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useFieldArray, useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { Ban, Check, Copy, Download, FileCheck2, MoreHorizontal, Pause, Pencil, Play, Plus, QrCode, Repeat, Save, Send, Trash2, Undo2 } from 'lucide-react'
import { useBillingConnection } from '@/components/billing/GatewayConnection'
import { useNavigate } from 'react-router-dom'
import { canIssueInvoice, nfseStatus } from '@/lib/nfse'
import { PrintPortal } from '@/components/proposals/PrintPortal'
import { QuoteDocument } from '@/components/quotes/QuoteDocument'
import { confirm } from '@/components/ui/confirm'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { Dropdown, DropdownContent, DropdownItem, DropdownSeparator, DropdownTrigger } from '@/components/ui/overlays'
import { Badge, Button, Card, EmptyState, Field, Input, PageHeader, Select, Textarea } from '@/components/ui/primitives'
import { useInsert, useRemove, useTable, useUpdate } from '@/hooks/useData'
import { itemsTotal } from '@/lib/proposal'
import { createCharge, overdueSuggestion, refreshPix, usesGateway } from '@/lib/billing'
import { listRows, updateRow } from '@/lib/db'
import { buildQuoteDoc, type QuoteDoc, type QuoteDraft } from '@/lib/quote'
import { DEFAULT_DEPOSIT_PCT, depositAmount, quoteProgress, registerQuotePayment, undoQuotePayment } from '@/lib/quote-finance'
import { endRecurrence, generationDate, lastQuoteOf, recurrenceState, runRecurrences, setRecurrenceActive, shiftDays, startRecurrence, updateRecurrence } from '@/lib/quote-recurrence'
import { formatCurrency, formatDate, formatProposalNumber, formatQuoteNumber, isoDay } from '@/lib/utils'
import { quoteStatus } from '@/lib/labels'
import { useUI } from '@/store/ui'
import type { Quote, QuoteRecurrence } from '@/types/database.types'

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

export default function QuoteGenerator() {
  const quotes = useTable('quotes')
  const clients = useTable('clients')
  const profile = useTable('profiles').data?.[0]
  const transactions = useTable('financial_transactions').data ?? []
  const proposals = useTable('proposals')
  const recurrences = useTable('quote_recurrences')
  const qc = useQueryClient()
  const insert = useInsert('quotes')
  const update = useUpdate('quotes')
  const remove = useRemove('quotes')
  const openModal = useUI((s) => s.openModal)
  const gateway = usesGateway(profile)
  const connection = useBillingConnection()
  const navigate = useNavigate()
  const openInvoice = (t: { id: string }) => navigate('/ferramentas/nota-fiscal', { state: { transactionId: t.id } })
  const [editing, setEditing] = useState<Quote | null>(null)
  // orçamento que está sendo mandado para a impressão (PDF)
  const [printing, setPrinting] = useState<QuoteDoc | null>(null)
  // mensalidade: o orçamento salvo vira o primeiro mês e o sistema gera os seguintes
  const [monthly, setMonthly] = useState(false)
  const [firstDue, setFirstDue] = useState('')
  const [leadDays, setLeadDays] = useState(7)
  const [endsOn, setEndsOn] = useState('')

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
    deposit_pct: !monthly && values.billing === 'deposit' ? Number(values.deposit_pct) || null : null,
    due_date: monthly ? firstDue || null : editing?.due_date ?? null,
    recurrence_id: editing?.recurrence_id ?? null,
    monthly,
  }
  const editingSeries = recurrences.data?.find((r) => r.id === editing?.recurrence_id) ?? null
  const progressOf = (q: Quote) => quoteProgress(transactions, q.id)
  const editingProgress = editing ? progressOf(editing) : null
  // com pagamento registrado, a forma de cobrança fica travada
  const billingLocked = (editingProgress?.received ?? 0) > 0
  const doc = buildQuoteDoc(draft, clientOf(draft.client_id), profile, editingProgress?.received ?? 0, editingProgress?.next)

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

  /** Gera no Asaas a cobrança do que o cliente deve pagar agora (o total, a entrada ou o saldo). */
  const chargeQuote = async (q: Pick<Quote, 'id' | 'quote_number' | 'validity_days'>) => {
    const { next } = quoteProgress(await listRows('financial_transactions'), q.id)
    if (!next) {
      toast.error('Este orçamento não tem valor a receber.')
      return false
    }
    // orçamento antigo: o vencimento original já passou e o Asaas não aceita data no passado
    const newDue = overdueSuggestion(next, Number(q.validity_days) || 3)
    if (newDue) {
      const ok = await confirm({
        title: 'O vencimento deste orçamento já passou',
        description: `O valor vencia em ${formatDate(next.due_date)}, e o Asaas não aceita cobrança com data no passado. Gerar a cobrança com vencimento em ${formatDate(newDue)}? A data também muda no Financeiro.`,
        confirmLabel: 'Gerar com a nova data',
        tone: 'default',
      })
      if (!ok) return false
      await updateRow('financial_transactions', next.id, { due_date: newDue })
    }
    const id = toast.loading('Gerando a cobrança no Asaas…')
    try {
      const { pixWarning } = await createCharge(next.id)
      await refreshLinked()
      if (pixWarning) toast.warning('Cobrança gerada, sem o QR Code Pix', { id, description: pixWarning, duration: 15000 })
      else toast.success('Cobrança gerada no Asaas', { id, description: `${formatCurrency(next.amount)} · ${formatQuoteNumber(q.quote_number)}. O PDF sai com o QR Code Pix e o link de pagamento.` })
      return true
    } catch (error) {
      toast.error('Não foi possível gerar a cobrança', { id, description: error instanceof Error ? error.message : undefined })
      return false
    }
  }

  /**
   * PDF do orçamento. No modo Asaas, se o valor a pagar agora ainda não tem
   * cobrança, ela é gerada antes: é dela que vêm o QR Code Pix e o link.
   */
  const printQuote = async (q: Quote) => {
    let progress = quoteProgress(await listRows('financial_transactions'), q.id)
    if (gateway && connection.data && progress.next && !progress.next.gateway_charge_id) {
      if (await chargeQuote(q)) progress = quoteProgress(await listRows('financial_transactions'), q.id)
    }
    setPrinting(buildQuoteDoc(q, clientOf(q.client_id), profile, progress.received, progress.next))
  }

  const updatePix = async (transactionId: string) => {
    const id = toast.loading('Buscando o QR Code Pix no Asaas…')
    try {
      const { pixWarning } = await refreshPix(transactionId)
      await refreshLinked()
      if (pixWarning) toast.warning('QR Code Pix indisponível', { id, description: pixWarning, duration: 15000 })
      else toast.success('QR Code Pix atualizado', { id })
    } catch (error) {
      toast.error('Não foi possível atualizar', { id, description: error instanceof Error ? error.message : undefined })
    }
  }

  const copyLink = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url)
      toast.success('Link de pagamento copiado')
    } catch {
      toast.error('Não foi possível copiar')
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
    setMonthly(false)
    setFirstDue('')
    setLeadDays(7)
    setEndsOn('')
  }

  /** Ligar a mensalidade: vencimento sugerido é o do orçamento (ou emissão + validade), sempre integral. */
  const toggleMonthly = (on: boolean) => {
    setMonthly(on)
    if (!on) return
    setValue('billing', 'full')
    if (!firstDue) {
      const open = editing ? progressOf(editing).next : null
      setFirstDue(editing?.due_date ?? open?.due_date ?? shiftDays(isoDay(new Date()), Number(values.validity_days) || 7))
    }
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
    const series = recurrences.data?.find((r) => r.id === q.recurrence_id)
    setMonthly(!!series && recurrenceState(series) !== 'ended')
    setFirstDue(q.due_date ?? progressOf(q).parts[0]?.due_date ?? '')
    setLeadDays(series?.lead_days ?? 7)
    setEndsOn(series?.ends_on ?? '')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const save = (thenDownload: boolean) =>
    handleSubmit(async () => {
      if (monthly && !firstDue) {
        toast.error('Informe o vencimento da mensalidade')
        return
      }
      // o número exibido é só uma prévia: quem numera é o banco (trigger) ou o repositório demo
      const { quote_number: _preview, created_at: _created, ...rest } = draft
      const { monthly: _monthly, recurrence_id: _series, ...fields } = rest
      const payload = { ...fields, proposal_id: values.proposal_id || null }
      try {
        const saved = editing
          ? await update.mutateAsync({ id: editing.id, patch: payload })
          : await insert.mutateAsync({ ...payload, status: 'pending' })
        // mensalidade: liga a série (ou ajusta a existente); desmarcar encerra a série
        if (monthly) {
          const settings = { firstDue, leadDays: Math.min(25, Math.max(0, Number(leadDays) || 0)), endsOn: endsOn || null }
          if (!editingSeries || recurrenceState(editingSeries) === 'ended') await startRecurrence(saved, settings)
          else await updateRecurrence(editingSeries, settings)
        } else if (editingSeries && recurrenceState(editingSeries) !== 'ended') await endRecurrence(editingSeries)
        await Promise.all(['quotes', 'quote_recurrences', 'financial_transactions'].map((key) => qc.invalidateQueries({ queryKey: [key] })))
        const hasCharge = !!editingProgress?.next?.gateway_charge_id
        // "Salvar e gerar PDF" já gera a cobrança (no modo Asaas); só salvar oferece gerar depois
        toast.success(`Orçamento ${formatQuoteNumber(saved.quote_number)} salvo`, gateway && !hasCharge && connection.data && !thenDownload ? { action: { label: 'Gerar cobrança', onClick: () => chargeQuote(saved) }, duration: 10000 } : undefined)
        if (thenDownload) await printQuote(saved)
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

  const refreshSeries = () => Promise.all(['quotes', 'quote_recurrences', 'financial_transactions'].map((key) => qc.invalidateQueries({ queryKey: [key] })))

  const generateNow = async (r: QuoteRecurrence) => {
    const id = toast.loading('Gerando a mensalidade…')
    try {
      const [created] = await runRecurrences({ onlyId: r.id, force: true })
      await refreshSeries()
      const fresh = (await listRows('quote_recurrences')).find((x) => x.id === r.id)
      if (!created) toast.error('Nada foi gerado', { id, description: fresh?.last_error ?? 'A mensalidade deste mês já tinha sido gerada.' })
      else if (fresh?.last_error) toast.warning(`Orçamento ${formatQuoteNumber(created.quote_number)} gerado`, { id, description: fresh.last_error, duration: 15000 })
      else toast.success(`Orçamento ${formatQuoteNumber(created.quote_number)} gerado`, { id, description: `Vence em ${formatDate(created.due_date)}${gateway ? ', com a cobrança no Asaas' : ''}.` })
    } catch (error) {
      toast.error('Não foi possível gerar', { id, description: error instanceof Error ? error.message : undefined })
    }
  }

  const toggleSeries = async (r: QuoteRecurrence, active: boolean) => {
    await setRecurrenceActive(r, active)
    await refreshSeries()
    toast.success(active ? 'Mensalidade retomada' : 'Mensalidade pausada')
  }

  const endSeries = async (r: QuoteRecurrence) => {
    const ok = await confirm({
      title: 'Encerrar a mensalidade?',
      description: 'Nenhum orçamento novo será gerado. Os que já foram gerados (e as cobranças deles) continuam como estão.',
      confirmLabel: 'Encerrar',
      cancelLabel: 'Voltar',
    })
    if (!ok) return
    await endRecurrence(r)
    await refreshSeries()
    toast.success('Mensalidade encerrada')
  }

  const editLast = async (r: QuoteRecurrence) => {
    const last = await lastQuoteOf(r)
    if (last) edit(last)
  }

  const seriesRows = (recurrences.data ?? [])
    .map((r) => ({ ...r, last: (quotes.data ?? []).find((q) => q.id === r.last_quote_id) ?? (quotes.data ?? []).find((q) => q.recurrence_id === r.id), state: recurrenceState(r) }))
    .sort((a, b) => (a.state === 'ended' ? 1 : 0) - (b.state === 'ended' ? 1 : 0) || a.next_due_date.localeCompare(b.next_due_date))

  const seriesColumns: Column<(typeof seriesRows)[number]>[] = [
    {
      header: 'Mensalidade',
      primary: true,
      cell: (r) => {
        const c = clientOf(r.client_id)
        return (
          <div className="min-w-0">
            <p className="truncate font-medium">{r.last?.title ?? '—'}</p>
            <p className="truncate text-xs text-slate-500 dark:text-slate-400">{c ? c.company_name ?? c.name : r.last?.customer_name ?? '—'}</p>
          </div>
        )
      },
    },
    { header: 'Valor', cell: (r) => <span className="tabular font-medium">{formatCurrency(r.last?.total_amount)}</span> },
    { header: 'Vencimento', cell: (r) => <span className="whitespace-nowrap text-slate-600 dark:text-slate-300">todo dia {r.day_of_month}</span> },
    {
      header: 'Próxima',
      cell: (r) =>
        r.state === 'ended' ? (
          <span className="text-xs text-slate-500 dark:text-slate-400">—</span>
        ) : (
          <div className="tabular whitespace-nowrap text-xs">
            <p className="text-slate-700 dark:text-slate-200">vence {formatDate(r.next_due_date)}</p>
            <p className="text-slate-500 dark:text-slate-400">{r.state === 'paused' ? 'pausada' : `gerada em ${formatDate(generationDate(r))}`}</p>
          </div>
        ),
    },
    {
      header: 'Situação',
      cell: (r) => (
        <div className="max-w-[260px]">
          <Badge tone={r.state === 'active' ? 'green' : r.state === 'paused' ? 'amber' : 'slate'}>{r.state === 'active' ? 'Ativa' : r.state === 'paused' ? 'Pausada' : 'Encerrada'}</Badge>
          {r.last_error && <p className="mt-1 text-[11px] leading-snug text-red-600 dark:text-red-400">{r.last_error}</p>}
        </div>
      ),
    },
    {
      header: '',
      className: 'w-12 text-right',
      cell: (r) => (
        <Dropdown>
          <DropdownTrigger asChild>
            <Button variant="ghost" size="icon" aria-label="Ações da mensalidade" className="h-8 w-8">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownTrigger>
          <DropdownContent>
            {r.state === 'active' && <DropdownItem icon={Repeat} onSelect={() => generateNow(r)}>Gerar a próxima agora</DropdownItem>}
            <DropdownItem icon={Pencil} onSelect={() => editLast(r)}>Editar o último orçamento</DropdownItem>
            {r.state === 'active' && <DropdownItem icon={Pause} onSelect={() => toggleSeries(r, false)}>Pausar</DropdownItem>}
            {r.state === 'paused' && <DropdownItem icon={Play} onSelect={() => toggleSeries(r, true)}>Retomar</DropdownItem>}
            {r.state !== 'ended' && (
              <>
                <DropdownSeparator />
                <DropdownItem icon={Ban} danger onSelect={() => endSeries(r)}>Encerrar mensalidade</DropdownItem>
              </>
            )}
          </DropdownContent>
        </Dropdown>
      ),
    },
  ]

  const columns: Column<Quote>[] = [
    { header: 'Nº', cell: (q) => <span className="tabular font-medium text-slate-500 dark:text-slate-400">{formatQuoteNumber(q.quote_number)}</span> },
    {
      header: 'Orçamento',
      primary: true,
      cell: (q) => {
        const c = clientOf(q.client_id)
        return (
          <div className="min-w-0">
            <p className="flex items-center gap-2 font-medium">
              <span className="truncate">{q.title}</span>
              {q.recurrence_id && (
                <span className="inline-flex shrink-0 items-center gap-1 rounded-md bg-brand-50 px-1.5 py-0.5 text-[11px] font-medium text-brand-700 dark:bg-brand-600/20 dark:text-brand-400" title="Mensalidade">
                  <Repeat className="h-3 w-3" /> Mensal
                </span>
              )}
            </p>
            <p className="truncate text-xs text-slate-500 dark:text-slate-400">
              {c ? c.company_name ?? c.name : q.customer_name ?? '—'}
              {q.due_date ? ` · vence ${formatDate(q.due_date)}` : ''}
            </p>
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
          {progressOf(q)
            .parts.filter((t) => t.nfse_status)
            .map((t) => (
              <p key={t.id} className="mt-0.5 whitespace-nowrap text-[11px] text-slate-500 dark:text-slate-400" title={t.nfse_error ?? undefined}>
                {nfseStatus[t.nfse_status!]?.label ?? t.nfse_status}
                {t.nfse_number ? ` nº ${t.nfse_number}` : ''}
                {q.deposit_pct ? ` · ${t.installment === 1 ? 'entrada' : 'saldo'}` : ''}
              </p>
            ))}
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
            <DropdownItem icon={Download} onSelect={() => printQuote(q)}>{gateway && connection.data && next && !next.gateway_charge_id ? 'Gerar cobrança e PDF' : 'Salvar em PDF / Imprimir'}</DropdownItem>
            {gateway && next && !next.gateway_charge_id && (
              <DropdownItem icon={Send} onSelect={() => chargeQuote(q)}>
                {q.deposit_pct ? `Gerar cobrança da ${next.installment === 1 ? 'entrada' : 'parte final'} no Asaas` : 'Gerar cobrança no Asaas'}
              </DropdownItem>
            )}
            {next?.gateway_invoice_url && <DropdownItem icon={Copy} onSelect={() => copyLink(next.gateway_invoice_url!)}>Copiar link de pagamento</DropdownItem>}
            {gateway &&
              progressOf(q)
                .parts.filter(canIssueInvoice)
                .map((t) => {
                  const part = q.deposit_pct ? (t.installment === 1 ? 'entrada' : 'saldo') : null
                  return (
                    <DropdownItem key={t.id} icon={FileCheck2} onSelect={() => openInvoice(t)}>
                      {part ? `Emitir nota fiscal ${part === 'entrada' ? 'da entrada' : 'do saldo'} (${formatCurrency(t.amount)})` : 'Emitir nota fiscal'}
                    </DropdownItem>
                  )
                })}
            {next?.gateway_charge_id && !next.gateway_pix_image && <DropdownItem icon={QrCode} onSelect={() => updatePix(next.id)}>Atualizar QR Code Pix</DropdownItem>}
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
        description={editing ? `Editando ${formatQuoteNumber(editing.quote_number)}` : `Próxima numeração: ${formatQuoteNumber(nextNumber)} · ${gateway ? 'cobrança pelo Asaas' : 'pagamento via Pix'}`}
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

      {profile && gateway && !connection.isLoading && !connection.data && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-200">
          <span>A forma de cobrança é o Asaas, mas a conta ainda não está conectada. Sem ela, não dá para gerar as cobranças.</span>
          <Button variant="secondary" size="sm" onClick={() => openModal({ type: 'profile', record: profile })}>
            Conectar o Asaas
          </Button>
        </div>
      )}

      {profile && !gateway && !profile.pix_key && !profile.pix_qr_image && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-200">
          <span>Você ainda não cadastrou sua chave Pix nem o QR Code. Sem eles, o orçamento sai sem o bloco de pagamento.</span>
          <Button variant="secondary" size="sm" onClick={() => openModal({ type: 'profile', record: profile })}>
            Cadastrar Pix
          </Button>
        </div>
      )}

      <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-2">
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
                <div key={f.id} className="flex flex-wrap items-start gap-2 border-b pb-3 last:border-0 last:pb-0 sm:flex-nowrap sm:border-0 sm:pb-0">
                  <div className="min-w-0 flex-1 basis-full sm:basis-0">
                    <Input placeholder="Descrição do serviço" aria-label={`Item ${i + 1}`} {...register(`items.${i}.description`)} />
                    {errors.items?.[i]?.description && <span className="mt-1 block text-xs text-red-600 dark:text-red-400">{errors.items[i]?.description?.message}</span>}
                  </div>
                  <Input type="number" min={0} step="0.5" aria-label="Quantidade" title="Quantidade" className="w-20 flex-1 sm:flex-none" {...register(`items.${i}.quantity`)} />
                  <Input type="number" min={0} step="0.01" aria-label="Valor unitário" title="Valor unitário (R$)" className="w-32 flex-1 sm:flex-none" {...register(`items.${i}.unit_price`)} />
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
                <Select disabled={billingLocked || monthly} {...register('billing')}>
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

          <Card className="space-y-3 p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="flex items-center gap-2 text-sm font-semibold">
                  <Repeat className="h-4 w-4 text-slate-400" /> Mensalidade
                </h2>
                <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">Para serviços cobrados todo mês: o sistema gera sozinho o orçamento de cada mês.</p>
              </div>
              <label className="flex shrink-0 cursor-pointer items-center gap-2 text-sm font-medium">
                <input
                  type="checkbox"
                  checked={monthly}
                  disabled={values.billing === 'deposit' && billingLocked}
                  onChange={(e) => toggleMonthly(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 accent-brand-600"
                />
                Cobrar todo mês
              </label>
            </div>
            {monthly && (
              <>
                <div className="grid gap-3 sm:grid-cols-3">
                  <Field label={editingSeries ? 'Vencimento deste orçamento' : 'Vencimento da 1ª mensalidade'}>
                    <Input type="date" value={firstDue} onChange={(e) => setFirstDue(e.target.value)} />
                  </Field>
                  <Field label="Gerar com antecedência (dias)">
                    <Input type="number" min={0} max={25} value={leadDays} onChange={(e) => setLeadDays(Number(e.target.value))} />
                  </Field>
                  <Field label="Até (opcional)">
                    <Input type="date" value={endsOn} min={firstDue || undefined} onChange={(e) => setEndsOn(e.target.value)} />
                  </Field>
                </div>
                <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs leading-relaxed text-slate-600 dark:bg-slate-800/60 dark:text-slate-300">
                  {firstDue ? (
                    <>
                      Vence todo dia <strong>{Number(firstDue.slice(8, 10))}</strong>. {editingSeries ? 'A próxima' : 'A partir do mês seguinte, cada mensalidade'} é gerada{' '}
                      <strong>{Math.max(0, Number(leadDays) || 0)} dias antes</strong> do vencimento, igual ao último orçamento da série (itens, valor e observações), só com a data nova
                      {gateway ? ', e a cobrança sai no Asaas, que avisa o cliente' : ', e entra no financeiro como pendente'}.
                      {editingSeries && recurrenceState(editingSeries) === 'active' && <> Próximo vencimento: <strong>{formatDate(editingSeries.next_due_date)}</strong>.</>}
                      {endsOn && <> Última mensalidade até <strong>{formatDate(endsOn)}</strong>.</>}
                    </>
                  ) : (
                    'Escolha o vencimento: ele define o dia de todo mês.'
                  )}
                </p>
                {editingSeries && recurrenceState(editingSeries) === 'paused' && <p className="text-xs text-amber-600 dark:text-amber-400">Esta mensalidade está pausada. Retome na lista de mensalidades.</p>}
              </>
            )}
            {!monthly && editingSeries && recurrenceState(editingSeries) !== 'ended' && <p className="text-xs text-amber-600 dark:text-amber-400">Ao salvar, a mensalidade é encerrada: nenhum orçamento novo será gerado.</p>}
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

      {seriesRows.length > 0 && (
        <Card className="mt-6">
          <div className="flex flex-wrap items-baseline justify-between gap-2 border-b px-5 py-3.5">
            <h2 className="flex items-center gap-2 text-sm font-semibold">
              <Repeat className="h-4 w-4 text-slate-400" /> Mensalidades
            </h2>
            <span className="text-xs text-slate-500 dark:text-slate-400">
              {seriesRows.filter((r) => r.state === 'active').length} ativa{seriesRows.filter((r) => r.state === 'active').length === 1 ? '' : 's'} · geradas sozinhas todo dia de manhã
            </span>
          </div>
          <DataTable columns={seriesColumns} rows={seriesRows} loading={recurrences.isLoading} pageSize={6} empty={null} />
        </Card>
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
