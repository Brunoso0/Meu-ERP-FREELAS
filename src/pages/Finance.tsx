import { useMemo, useState } from 'react'
import * as Tabs from '@radix-ui/react-tabs'
import { addMonths, addQuarters, addYears, endOfMonth, endOfQuarter, endOfYear, format, startOfMonth, startOfQuarter, startOfYear } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { toast } from 'sonner'
import { useQueryClient } from '@tanstack/react-query'
import { Ban, Check, ChevronLeft, ChevronRight, Copy, ExternalLink, Eye, FileCheck2, FileText, FileX2, MessageCircle, MoreHorizontal, Paperclip, Pencil, Plus, RefreshCw, Search, Send, Wallet } from 'lucide-react'
import { ListToolbar } from '@/components/ui/ListToolbar'
import { useListState } from '@/hooks/useListState'
import { distinctOptions, linkOptions, matchesSearch, sortPair, sortRows, type SortOption } from '@/lib/list'
import { FinanceCharts } from '@/components/finance/FinanceCharts'
import { RecurrenceList } from '@/components/finance/RecurrenceList'
import { InvoiceCell, ProofCell, useTransactionFiles } from '@/components/finance/useTransactionFiles'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { confirm } from '@/components/ui/confirm'
import { Dropdown, DropdownContent, DropdownItem, DropdownSeparator, DropdownTrigger } from '@/components/ui/overlays'
import { Badge, Button, Card, EmptyState, PageHeader, Segmented, Skeleton } from '@/components/ui/primitives'
import { useTable, useUpdate } from '@/hooks/useData'
import { useNavigate } from 'react-router-dom'
import { cancelCharge, cancelInvoice, chargeMessage, createCharge, gatewayStatusOf, hasOpenCharge, overdueSuggestion, refreshCharge, refreshInvoice, usesGateway } from '@/lib/billing'
import { canIssueInvoice } from '@/lib/nfse'
import { updateRow } from '@/lib/db'
import { whatsappUrl } from '@/lib/leads'
import { effectiveStatus, toOptions, transactionStatus } from '@/lib/labels'
import { cn, formatCurrency, formatDate, isoDay, sum, toDate } from '@/lib/utils'
import { useUI } from '@/store/ui'
import type { FinancialTransaction } from '@/types/database.types'

type Tab = 'income' | 'expenses'
type Period = 'month' | 'quarter' | 'year' | 'all'

const periods: Record<Exclude<Period, 'all'>, { start: (d: Date) => Date; end: (d: Date) => Date; move: (d: Date, step: number) => Date; label: (d: Date) => string }> = {
  month: { start: startOfMonth, end: endOfMonth, move: addMonths, label: (d) => format(d, "MMMM 'de' yyyy", { locale: ptBR }) },
  quarter: { start: startOfQuarter, end: endOfQuarter, move: addQuarters, label: (d) => `${format(d, 'Qº')} trimestre de ${format(d, 'yyyy')}` },
  year: { start: startOfYear, end: endOfYear, move: addYears, label: (d) => format(d, 'yyyy') },
}

function Summary({ label, value, hint, tone, loading }: { label: string; value: number; hint: string; tone?: 'good' | 'bad'; loading: boolean }) {
  return (
    <Card className="p-5">
      <p className="text-sm text-slate-500 dark:text-slate-400">{label}</p>
      {loading ? (
        <Skeleton className="mt-3 h-8 w-32" />
      ) : (
        <p className={cn('tabular mt-2 text-2xl font-semibold tracking-tight', tone === 'good' && 'text-emerald-600 dark:text-emerald-400', tone === 'bad' && 'text-red-600 dark:text-red-400')}>
          {formatCurrency(value)}
        </p>
      )}
      <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">{hint}</p>
    </Card>
  )
}

export default function Finance() {
  const openModal = useUI((s) => s.openModal)
  const transactions = useTable('financial_transactions')
  const clients = useTable('clients')
  const projects = useTable('projects')
  const update = useUpdate('financial_transactions')
  const profile = useTable('profiles').data?.[0]
  const gateway = usesGateway(profile)
  const qc = useQueryClient()
  const navigate = useNavigate()
  const openInvoice = (t: FinancialTransaction) => navigate('/ferramentas/nota-fiscal', { state: { transactionId: t.id } })
  const [tab, setTab] = useState<Tab>('income')
  const [period, setPeriod] = useState<Period>('month')
  const [cursor, setCursor] = useState(() => new Date())
  const files = useTransactionFiles()

  const all = transactions.data ?? []

  // null = sem recorte (todo o histórico)
  const range = useMemo(() => (period === 'all' ? null : { start: periods[period].start(cursor), end: periods[period].end(cursor) }), [period, cursor])
  const isCurrent = !range || (range.start <= new Date() && new Date() <= range.end)

  const summary = useMemo(() => {
    const inPeriod = (day: string) => !range || (toDate(day) >= range.start && toDate(day) <= range.end)
    const due = all.filter((t) => inPeriod(t.due_date))
    // saldo do período: o que foi efetivamente pago dentro dele (pela data do pagamento)
    const paid = all.filter((t) => t.status === 'paid' && inPeriod(t.payment_date ?? t.due_date))
    return {
      balance: sum(paid.filter((t) => t.type === 'income').map((t) => t.amount)) - sum(paid.filter((t) => t.type === 'expense').map((t) => t.amount)),
      receivable: sum(due.filter((t) => t.type === 'income' && t.status !== 'paid').map((t) => t.amount)),
      payable: sum(due.filter((t) => t.type === 'expense' && t.status !== 'paid').map((t) => t.amount)),
      profit: sum(due.filter((t) => t.type === 'income').map((t) => t.amount)) - sum(due.filter((t) => t.type === 'expense').map((t) => t.amount)),
    }
  }, [all, range])

  const counterpart = (t: FinancialTransaction) => {
    const c = clients.data?.find((x) => x.id === t.client_id)
    return c ? c.company_name ?? c.name : undefined
  }
  const projectTitle = (id: string | null) => projects.data?.find((p) => p.id === id)?.title

  const list = useListState('financeiro', { search: '', status: '', category: '', client: '', origin: '', docs: '', sort: 'due-desc' })
  const { search, status: statusFilter, category: categoryFilter, client: clientFilter, origin: originFilter, docs: docFilter, sort } = list.state
  const hasInvoice = (t: FinancialTransaction) => t.nfse_status === 'AUTHORIZED' || !!t.invoice_url
  /** De onde veio o lançamento: mensalidade, orçamento, contrato, parcela recorrente ou lançado à mão. */
  const originOf = (t: FinancialTransaction) =>
    t.category === 'Mensalidade' ? 'monthly' : t.quote_id ? 'quote' : t.contract_id ? 'contract' : t.recurrence_id ? 'recurrence' : 'manual'
  const sortOptions: SortOption<FinancialTransaction>[] = [
    ...sortPair<FinancialTransaction>('due', ['Vencimento mais recente', 'Vencimento mais antigo'], (t) => t.due_date),
    ...sortPair<FinancialTransaction>('amount', ['Maior valor', 'Menor valor'], (t) => Number(t.amount)),
    ...sortPair<FinancialTransaction>('paid', ['Pagamento mais recente', 'Pagamento mais antigo'], (t) => t.payment_date),
    ...sortPair<FinancialTransaction>('description', ['Descrição Z–A', 'Descrição A–Z'], (t) => t.description).reverse(),
  ]

  const rowsByTab: Record<Tab, FinancialTransaction[]> = useMemo(() => {
    const inRange = (day: string | null) => !!day && (!range || (toDate(day) >= range.start && toDate(day) <= range.end))
    const shown = all.filter((t) => inRange(t.due_date) || (t.status === 'paid' && inRange(t.payment_date)))
    // entrada e saldo andam juntos: se uma parte do orçamento aparece, as outras aparecem ao lado
    const quoteIds = new Set(shown.map((t) => t.quote_id).filter(Boolean))
    const rows = [...shown, ...all.filter((t) => t.quote_id && quoteIds.has(t.quote_id) && !shown.includes(t))]
    // ordem: vencimento mais recente primeiro, com as partes de um orçamento juntas (1/2 antes de 2/2)
    const anchor = new Map<string, string>()
    for (const t of rows) if (t.quote_id && (anchor.get(t.quote_id) ?? '') < t.due_date) anchor.set(t.quote_id, t.due_date)
    const key = (t: FinancialTransaction) => (t.quote_id ? anchor.get(t.quote_id)! : t.due_date)
    const dir = sort === 'due-asc' ? -1 : 1
    const grouped = (a: FinancialTransaction, b: FinancialTransaction) =>
      key(b).localeCompare(key(a)) * dir || (a.quote_id ?? a.id).localeCompare(b.quote_id ?? b.id) || (a.installment ?? 0) - (b.installment ?? 0)
    // por vencimento, as partes de um orçamento ficam juntas; nas demais ordens, cada lançamento vale por si
    const order = (items: FinancialTransaction[]) => (sort === 'due-desc' || sort === 'due-asc' ? [...items].sort(grouped) : sortRows(items, sortOptions, sort))
    const visible = rows.filter((t) => {
      const status = effectiveStatus(t)
      const docs = t.type === 'income' ? docFilter : docFilter.startsWith('invoice') ? '' : docFilter
      return (
        (!statusFilter || (statusFilter === 'open' ? status !== 'paid' : status === statusFilter)) &&
        (!categoryFilter || (t.category ?? '') === categoryFilter) &&
        (!clientFilter || t.type !== 'income' || (clientFilter === 'none' ? !t.client_id : t.client_id === clientFilter)) &&
        (!originFilter || originOf(t) === originFilter) &&
        (!docs ||
          (docs === 'proof' ? !!t.proof_url : docs === 'no-proof' ? !t.proof_url : docs === 'invoice' ? hasInvoice(t) : !hasInvoice(t))) &&
        matchesSearch(search, [t.description, t.category, counterpart(t), projectTitle(t.project_id), t.nfse_number, Number(t.amount).toFixed(2).replace('.', ',')])
      )
    })
    return {
      income: order(visible.filter((t) => t.type === 'income')),
      expenses: order(visible.filter((t) => t.type === 'expense')),
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [all, range, clients.data, projects.data, search, statusFilter, categoryFilter, clientFilter, originFilter, docFilter, sort])

  const totalByTab = useMemo(() => {
    const inRange = (day: string | null) => !!day && (!range || (toDate(day) >= range.start && toDate(day) <= range.end))
    const shown = all.filter((t) => inRange(t.due_date) || (t.status === 'paid' && inRange(t.payment_date)))
    return { income: shown.filter((t) => t.type === 'income').length, expenses: shown.filter((t) => t.type === 'expense').length }
  }, [all, range])

  /** A linha está na lista por outro motivo que não o vencimento no período (pago nele ou parte do mesmo orçamento). */
  const outsideDue = (t: FinancialTransaction) => !!range && (toDate(t.due_date) < range.start || toDate(t.due_date) > range.end)

  const markPaid = (t: FinancialTransaction) =>
    update.mutate({ id: t.id, patch: { status: 'paid', payment_date: isoDay(new Date()) } }, { onSuccess: () => toast.success('Marcado como pago') })

  /** Ação de cobrança no gateway com aviso de andamento, sucesso e erro. */
  const charge = async (label: string, run: () => Promise<unknown>, done: string) => {
    const id = toast.loading(label)
    try {
      const result = (await run()) as { pixWarning?: string | null } | undefined
      if (result?.pixWarning) toast.warning(`${done}, sem o QR Code Pix`, { id, description: result.pixWarning, duration: 15000 })
      else toast.success(done, { id })
    } catch (error) {
      toast.error('Não deu certo', { id, description: error instanceof Error ? error.message : undefined })
    }
    await qc.invalidateQueries({ queryKey: ['financial_transactions'] })
    await qc.invalidateQueries({ queryKey: ['quotes'] })
  }

  const copy = async (text: string, done: string) => {
    try {
      await navigator.clipboard.writeText(text)
      toast.success(done)
    } catch {
      toast.error('Não foi possível copiar')
    }
  }

  const clientOf = (t: FinancialTransaction) => clients.data?.find((x) => x.id === t.client_id)
  const issuer = profile?.company_name || profile?.full_name || ''

  const generate = async (t: FinancialTransaction) => {
    const newDue = overdueSuggestion(t)
    if (newDue) {
      const ok = await confirm({
        title: 'O vencimento já passou',
        description: `Este lançamento vencia em ${formatDate(t.due_date)}, e o Asaas não aceita cobrança com data no passado. Gerar a cobrança com vencimento em ${formatDate(newDue)}? A data do lançamento também muda.`,
        confirmLabel: 'Gerar com a nova data',
        tone: 'default',
      })
      if (!ok) return
      await updateRow('financial_transactions', t.id, { due_date: newDue })
    }
    charge('Gerando a cobrança no Asaas…', () => createCharge(t.id), 'Cobrança gerada no Asaas')
  }

  const cancelNfse = async (t: FinancialTransaction) => {
    const ok = await confirm({
      title: `Cancelar a nota fiscal${t.nfse_number ? ` nº ${t.nfse_number}` : ''}?`,
      description: 'O pedido de cancelamento vai para o Portal Nacional da NFS-e, que pode recusar (por exemplo, fora do prazo de cancelamento). O recebimento continua pago.',
      confirmLabel: 'Cancelar nota',
      cancelLabel: 'Voltar',
    })
    if (ok) charge('Pedindo o cancelamento da nota…', () => cancelInvoice(t.id), 'Cancelamento da nota solicitado')
  }

  const cancel = async (t: FinancialTransaction) => {
    const ok = await confirm({
      title: 'Cancelar a cobrança no Asaas?',
      description: 'O link de pagamento deixa de funcionar e o cliente não consegue mais pagar por ele. O lançamento continua aqui, pendente, e você pode gerar outra cobrança depois.',
      confirmLabel: 'Cancelar cobrança',
      cancelLabel: 'Voltar',
    })
    if (ok) charge('Cancelando a cobrança…', () => cancelCharge(t.id), 'Cobrança cancelada no Asaas')
  }

  const invoiceColumn: Column<FinancialTransaction> = { header: 'Nota fiscal', cell: (t) => <InvoiceCell t={t} files={files} /> }

  const columns: Column<FinancialTransaction>[] = [
    {
      header: 'Descrição',
      cell: (t) => (
        <div className="min-w-0">
          <p className="flex items-center gap-2 font-medium">
            <span className="truncate">{t.description ?? t.category ?? '—'}</span>
            {t.installment && t.installments ? (
              <span className="tabular shrink-0 rounded-md bg-slate-100 px-1.5 py-0.5 text-xs font-normal text-slate-500 dark:bg-slate-800 dark:text-slate-400" title={`Parcela ${t.installment} de ${t.installments}`}>
                {t.installment}/{t.installments}
              </span>
            ) : null}
          </p>
          <p className="truncate text-xs text-slate-500 dark:text-slate-400">
            {[counterpart(t), projectTitle(t.project_id), t.category].filter(Boolean).join(' · ') || '—'}
          </p>
        </div>
      ),
    },
    {
      header: 'Vencimento',
      cell: (t) => (
        <span className="tabular text-slate-600 dark:text-slate-300">
          {formatDate(t.due_date)}
          {outsideDue(t) && <span className="block text-[11px] text-slate-400 dark:text-slate-500">fora do período</span>}
        </span>
      ),
    },
    { header: 'Pagamento', cell: (t) => <span className="tabular text-slate-600 dark:text-slate-300">{formatDate(t.payment_date)}</span> },
    {
      header: 'Situação',
      cell: (t) => {
        const s = effectiveStatus(t)
        const g = gatewayStatusOf(t.gateway_status)
        return (
          <div className="flex flex-col items-end gap-1 md:items-start">
            <Badge tone={transactionStatus[s].tone}>{transactionStatus[s].label}</Badge>
            {t.gateway_charge_id && g && (
              <span className="text-[11px] leading-tight text-slate-500 dark:text-slate-400" title={`Cobrança ${t.gateway_charge_id} no Asaas`}>
                Asaas{t.gateway_env === 'sandbox' ? ' (teste)' : ''}: {g.label}
              </span>
            )}
          </div>
        )
      },
    },
    {
      header: 'Comprovante',
      cell: (t) => <ProofCell t={t} files={files} />,
    },
    { header: 'Valor', className: 'text-right', cell: (t) => <span className="tabular font-medium">{formatCurrency(t.amount)}</span> },
    {
      header: '',
      className: 'w-12 text-right',
      cell: (t) => (
        <Dropdown>
          <DropdownTrigger asChild>
            <Button variant="ghost" size="icon" aria-label="Ações" className="h-8 w-8">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownTrigger>
          <DropdownContent>
            {t.type === 'income' && gateway && t.status !== 'paid' && !t.gateway_charge_id && (
              <DropdownItem icon={Send} onSelect={() => generate(t)}>Gerar cobrança no Asaas</DropdownItem>
            )}
            {t.gateway_invoice_url && (
              <>
                <DropdownItem icon={ExternalLink} onSelect={() => window.open(t.gateway_invoice_url!, '_blank', 'noopener')}>Abrir página de pagamento</DropdownItem>
                {hasOpenCharge(t) && <DropdownItem icon={Copy} onSelect={() => copy(t.gateway_invoice_url!, 'Link de pagamento copiado')}>Copiar link de pagamento</DropdownItem>}
                {hasOpenCharge(t) && t.gateway_pix_payload && <DropdownItem icon={Copy} onSelect={() => copy(t.gateway_pix_payload!, 'Pix copia e cola copiado')}>Copiar Pix copia e cola</DropdownItem>}
                {hasOpenCharge(t) && clientOf(t)?.phone && (
                  <DropdownItem icon={MessageCircle} onSelect={() => window.open(whatsappUrl(clientOf(t)!.phone, chargeMessage(t, issuer)) ?? undefined, '_blank', 'noopener')}>Enviar link pelo WhatsApp</DropdownItem>
                )}
              </>
            )}
            {t.gateway_charge_id && <DropdownItem icon={RefreshCw} onSelect={() => charge('Consultando o Asaas…', () => refreshCharge(t.id), 'Situação atualizada')}>Atualizar situação</DropdownItem>}
            {hasOpenCharge(t) && <DropdownItem icon={Ban} danger onSelect={() => cancel(t)}>Cancelar cobrança</DropdownItem>}
            {(t.gateway_charge_id || (t.type === 'income' && gateway && t.status !== 'paid')) && <DropdownSeparator />}
            {t.status !== 'paid' && <DropdownItem icon={Check} onSelect={() => markPaid(t)}>{hasOpenCharge(t) ? 'Marcar como pago (recebido por fora)' : 'Marcar como pago'}</DropdownItem>}
            <DropdownItem icon={Paperclip} onSelect={() => files.pick(t.id, 'proof_url')}>{t.proof_url ? 'Trocar comprovante' : 'Anexar comprovante'}</DropdownItem>
            {t.proof_url && <DropdownItem icon={Eye} onSelect={() => files.view(t.proof_url)}>Ver comprovante</DropdownItem>}
            {gateway && canIssueInvoice(t) && <DropdownItem icon={FileCheck2} onSelect={() => openInvoice(t)}>{t.nfse_status === 'ERROR' ? 'Emitir nota fiscal de novo' : 'Emitir nota fiscal'}</DropdownItem>}
            {t.nfse_id && <DropdownItem icon={RefreshCw} onSelect={() => charge('Consultando a nota no Asaas…', () => refreshInvoice(t.id), 'Nota fiscal atualizada')}>Atualizar nota fiscal</DropdownItem>}
            {t.nfse_status === 'AUTHORIZED' && <DropdownItem icon={FileX2} danger onSelect={() => cancelNfse(t)}>Cancelar nota fiscal</DropdownItem>}
            {t.type === 'income' && !t.nfse_id && <DropdownItem icon={FileText} onSelect={() => files.pick(t.id, 'invoice_url')}>{t.invoice_url ? 'Trocar nota fiscal' : 'Anexar nota fiscal'}</DropdownItem>}
            {t.type === 'income' && t.invoice_url && <DropdownItem icon={Eye} onSelect={() => files.view(t.invoice_url)}>Ver nota fiscal</DropdownItem>}
            {t.type === 'income' && t.invoice_url && !t.nfse_id && <DropdownItem icon={FileText} onSelect={() => update.mutate({ id: t.id, patch: { invoice_url: null } }, { onSuccess: () => toast.success('Nota fiscal removida') })}>Remover nota fiscal</DropdownItem>}
            <DropdownItem icon={Pencil} onSelect={() => openModal({ type: 'transaction', record: t })}>Editar</DropdownItem>
          </DropdownContent>
        </Dropdown>
      ),
    },
  ]

  const tabs: Array<{ value: Tab; label: string; defaults: Record<string, unknown>; emptyTitle: string; emptyText: string }> = [
    { value: 'income', label: 'A receber', defaults: { type: 'income', category: 'Projeto' }, emptyTitle: 'Nenhum recebimento neste período', emptyText: 'Lance uma parcela ou navegue para outro período.' },
    { value: 'expenses', label: 'Despesas', defaults: { type: 'expense', category: 'Ferramentas' }, emptyTitle: 'Nenhuma despesa neste período', emptyText: 'Ferramentas, hospedagem, impostos e demais gastos do seu trabalho entram aqui.' },
  ]
  // a nota fiscal é do que você recebe: só a aba de entradas tem a coluna, logo depois do comprovante
  const proofIndex = columns.findIndex((c) => c.header === 'Comprovante')
  const incomeColumns = [...columns.slice(0, proofIndex + 1), invoiceColumn, ...columns.slice(proofIndex + 1)]
  const currentTab = tabs.find((t) => t.value === tab)!
  const newTransaction = () => openModal({ type: 'transaction', defaults: currentTab.defaults })
  const loading = transactions.isLoading

  return (
    <>
      <PageHeader
        title="Financeiro"
        description="O que você recebe, o que gasta e o resultado de cada período."
        actions={
          <Button onClick={newTransaction}>
            <Plus className="h-4 w-4" /> Nova transação
          </Button>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Segmented
          value={period}
          onChange={setPeriod}
          options={[
            { value: 'month', label: 'Mês' },
            { value: 'quarter', label: 'Trimestre' },
            { value: 'year', label: 'Ano' },
            { value: 'all', label: 'Tudo' },
          ]}
        />
        {period !== 'all' && (
          <>
            <Button variant="secondary" size="icon" onClick={() => setCursor(periods[period].move(cursor, -1))} aria-label="Período anterior">
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="secondary" size="icon" onClick={() => setCursor(periods[period].move(cursor, 1))} aria-label="Próximo período">
              <ChevronRight className="h-4 w-4" />
            </Button>
            <span className="inline-block text-sm font-semibold first-letter:uppercase">{periods[period].label(cursor)}</span>
            {!isCurrent && (
              <Button variant="ghost" size="sm" onClick={() => setCursor(new Date())}>
                Voltar para hoje
              </Button>
            )}
          </>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Summary label={range ? 'Saldo do período' : 'Saldo'} value={summary.balance} hint={range ? 'Recebido menos pago dentro do período' : 'Tudo que entrou menos tudo que saiu'} loading={loading} />
        <Summary label="A receber" value={summary.receivable} hint="Clientes, vence no período e ainda não foi pago" loading={loading} />
        <Summary label="A pagar" value={summary.payable} hint="Despesas que vencem no período e ainda não foram pagas" loading={loading} />
        <Summary label={isCurrent ? 'Lucro líquido projetado' : 'Resultado do período'} value={summary.profit} hint="Entradas menos saídas com vencimento no período" tone={summary.profit >= 0 ? 'good' : 'bad'} loading={loading} />
      </div>

      <FinanceCharts transactions={all} clients={clients.data ?? []} range={range} loading={loading} />

      <RecurrenceList transactions={all} clients={clients.data ?? []} />

      {files.input}

      <Tabs.Root
        value={tab}
        onValueChange={(v) => {
          setTab(v as Tab)
          // categoria, cliente, origem e nota fiscal são de cada aba: não valem na outra
          list.set('category', '')
          list.set('client', '')
          list.set('origin', '')
          if (docFilter.startsWith('invoice')) list.set('docs', '')
        }}
        className="mt-4"
      >
        <Card>
          <Tabs.List className="flex gap-1 overflow-x-auto border-b px-3">
            {tabs.map((t) => (
              <Tabs.Trigger
                key={t.value}
                value={t.value}
                className="-mb-px whitespace-nowrap border-b-2 border-transparent px-3 py-3 text-sm font-medium text-slate-500 transition-colors hover:text-slate-800 data-[state=active]:border-brand-600 data-[state=active]:text-slate-900 dark:hover:text-slate-200 dark:data-[state=active]:text-slate-100"
              >
                {t.label}
                <span className="tabular ml-2 rounded-md bg-slate-100 px-1.5 py-0.5 text-xs text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                  {list.filtering ? `${rowsByTab[t.value].length} de ${totalByTab[t.value]}` : rowsByTab[t.value].length}
                </span>
              </Tabs.Trigger>
            ))}
          </Tabs.List>
          <ListToolbar
            search={{ value: search, onChange: (v) => list.set('search', v), placeholder: 'Buscar por descrição, cliente, projeto, categoria ou valor' }}
            filters={[
              {
                label: 'Filtrar por situação',
                value: statusFilter,
                onChange: (v) => list.set('status', v),
                allLabel: 'Todas as situações',
                options: [{ value: 'open', label: 'Em aberto (pendente ou atrasado)' }, ...toOptions(transactionStatus)],
              },
              {
                label: 'Filtrar por categoria',
                value: categoryFilter,
                onChange: (v) => list.set('category', v),
                allLabel: 'Todas as categorias',
                options: distinctOptions(all.filter((t) => t.type === (tab === 'income' ? 'income' : 'expense')).map((t) => t.category)),
              },
              ...(tab === 'income'
                ? [
                    {
                      label: 'Filtrar por cliente',
                      value: clientFilter,
                      onChange: (v: string) => list.set('client', v),
                      allLabel: 'Todos os clientes',
                      options: linkOptions(all.filter((t) => t.type === 'income').map((t) => t.client_id), (id) => clients.data?.find((c) => c.id === id)?.company_name ?? clients.data?.find((c) => c.id === id)?.name ?? 'Cliente removido', 'Sem cliente'),
                    },
                  ]
                : []),
              {
                label: 'Filtrar por origem',
                value: originFilter,
                onChange: (v) => list.set('origin', v),
                allLabel: 'Qualquer origem',
                options: [
                  ...(tab === 'income'
                    ? [
                        { value: 'quote', label: 'Orçamentos' },
                        { value: 'monthly', label: 'Mensalidades' },
                        { value: 'contract', label: 'Contratos' },
                      ]
                    : []),
                  { value: 'recurrence', label: 'Recorrências' },
                  { value: 'manual', label: 'Lançados à mão' },
                ],
              },
              {
                label: 'Filtrar por documentos',
                value: docFilter,
                onChange: (v) => list.set('docs', v),
                allLabel: 'Com ou sem documentos',
                options: [
                  { value: 'proof', label: 'Com comprovante' },
                  { value: 'no-proof', label: 'Sem comprovante' },
                  ...(tab === 'income'
                    ? [
                        { value: 'invoice', label: 'Com nota fiscal' },
                        { value: 'invoice-none', label: 'Sem nota fiscal' },
                      ]
                    : []),
                ],
              },
            ]}
            sort={{ value: sort, onChange: (v) => list.set('sort', v), options: sortOptions }}
            filtering={list.filtering}
            onClear={list.reset}
          />
          {tabs.map((t) => (
            <Tabs.Content key={t.value} value={t.value} className="focus:outline-none">
              <DataTable
                columns={t.value === 'income' ? incomeColumns : columns}
                rows={rowsByTab[t.value]}
                loading={loading}
                empty={
                  list.filtering && totalByTab[t.value] > 0 ? (
                    <EmptyState
                      icon={Search}
                      title="Nenhum lançamento encontrado"
                      description="Ajuste a busca ou os filtros, ou escolha outro período."
                      action={
                        <Button variant="secondary" onClick={list.reset}>
                          Limpar filtros
                        </Button>
                      }
                    />
                  ) : (
                    <EmptyState
                      icon={Wallet}
                      title={t.emptyTitle}
                      description={t.emptyText}
                      action={
                        <Button onClick={newTransaction}>
                          <Plus className="h-4 w-4" /> Nova transação
                        </Button>
                      }
                    />
                  )
                }
              />
            </Tabs.Content>
          ))}
        </Card>
      </Tabs.Root>
    </>
  )
}
