import { useMemo, useRef, useState } from 'react'
import * as Tabs from '@radix-ui/react-tabs'
import { addMonths, addQuarters, addYears, endOfMonth, endOfQuarter, endOfYear, format, isBefore, startOfDay, startOfMonth, startOfQuarter, startOfYear } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { toast } from 'sonner'
import { useQueryClient } from '@tanstack/react-query'
import { Ban, Check, ChevronLeft, ChevronRight, Copy, ExternalLink, Eye, FileCheck2, FileText, FileX2, MessageCircle, MoreHorizontal, Paperclip, Pencil, Plus, RefreshCw, Send, Wallet } from 'lucide-react'
import { FinanceCharts } from '@/components/finance/FinanceCharts'
import { RecurrenceList } from '@/components/finance/RecurrenceList'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { confirm } from '@/components/ui/confirm'
import { Dropdown, DropdownContent, DropdownItem, DropdownSeparator, DropdownTrigger } from '@/components/ui/overlays'
import { Badge, Button, Card, EmptyState, PageHeader, Segmented, Skeleton } from '@/components/ui/primitives'
import { useTable, useUpdate } from '@/hooks/useData'
import { useNavigate } from 'react-router-dom'
import { cancelCharge, cancelInvoice, chargeMessage, createCharge, gatewayStatusOf, hasOpenCharge, overdueSuggestion, refreshCharge, refreshInvoice, usesGateway } from '@/lib/billing'
import { canIssueInvoice, nfseStatus } from '@/lib/nfse'
import { resolveProofUrl, updateRow, uploadProof } from '@/lib/db'
import { whatsappUrl } from '@/lib/leads'
import { transactionStatus } from '@/lib/labels'
import { cn, formatCurrency, formatDate, isoDay, sum, toDate } from '@/lib/utils'
import { useUI } from '@/store/ui'
import type { FinancialTransaction, TransactionStatus } from '@/types/database.types'

type Tab = 'income' | 'expenses'
type Period = 'month' | 'quarter' | 'year' | 'all'

/** Arquivos que um lançamento pode guardar: o comprovante do pagamento e a nota fiscal emitida. */
type Attachment = 'proof_url' | 'invoice_url'
const attachments: Record<Attachment, { noun: string; accept: string; types: RegExp; formats: string; attached: string }> = {
  proof_url: { noun: 'O comprovante', accept: 'image/png,image/jpeg,image/webp,application/pdf', types: /^image\/(png|jpe?g|webp)$|^application\/pdf$/, formats: 'PNG, JPG, WEBP ou PDF', attached: 'Comprovante anexado' },
  invoice_url: { noun: 'A nota fiscal', accept: 'application/pdf', types: /^application\/pdf$/, formats: 'PDF', attached: 'Nota fiscal anexada' },
}

const periods: Record<Exclude<Period, 'all'>, { start: (d: Date) => Date; end: (d: Date) => Date; move: (d: Date, step: number) => Date; label: (d: Date) => string }> = {
  month: { start: startOfMonth, end: endOfMonth, move: addMonths, label: (d) => format(d, "MMMM 'de' yyyy", { locale: ptBR }) },
  quarter: { start: startOfQuarter, end: endOfQuarter, move: addQuarters, label: (d) => `${format(d, 'Qº')} trimestre de ${format(d, 'yyyy')}` },
  year: { start: startOfYear, end: endOfYear, move: addYears, label: (d) => format(d, 'yyyy') },
}

/** "Atrasado" é derivado: pendente com vencimento antes de hoje. */
const effectiveStatus = (t: FinancialTransaction): TransactionStatus =>
  t.status !== 'paid' && isBefore(toDate(t.due_date), startOfDay(new Date())) ? 'overdue' : t.status

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
  const fileInput = useRef<HTMLInputElement>(null)
  const uploadTarget = useRef<{ id: string; field: Attachment } | null>(null)

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

  const rowsByTab: Record<Tab, FinancialTransaction[]> = useMemo(() => {
    const byDue = (a: FinancialTransaction, b: FinancialTransaction) => b.due_date.localeCompare(a.due_date)
    const due = all.filter((t) => !range || (toDate(t.due_date) >= range.start && toDate(t.due_date) <= range.end))
    return {
      income: due.filter((t) => t.type === 'income').sort(byDue),
      expenses: due.filter((t) => t.type === 'expense').sort(byDue),
    }
  }, [all, range])

  const counterpart = (t: FinancialTransaction) => {
    const c = clients.data?.find((x) => x.id === t.client_id)
    return c ? c.company_name ?? c.name : undefined
  }
  const projectTitle = (id: string | null) => projects.data?.find((p) => p.id === id)?.title

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

  const pickFile = (id: string, field: Attachment) => {
    uploadTarget.current = { id, field }
    if (fileInput.current) {
      fileInput.current.accept = attachments[field].accept
      fileInput.current.click()
    }
  }

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    const target = uploadTarget.current
    e.target.value = ''
    if (!file || !target) return
    const kind = attachments[target.field]
    // o `accept` do input é só sugestão do navegador; a checagem de verdade é esta
    if (!kind.types.test(file.type)) {
      toast.error('Formato não aceito', { description: `${kind.noun} precisa estar em ${kind.formats}.` })
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error('Arquivo muito grande', { description: `${kind.noun} pode ter até 5 MB.` })
      return
    }
    try {
      const path = await uploadProof(file)
      await update.mutateAsync({ id: target.id, patch: { [target.field]: path } })
      toast.success(kind.attached)
    } catch (error) {
      toast.error('Não foi possível anexar', { description: error instanceof Error ? error.message : undefined })
    }
  }

  const viewFile = async (path: string | null | undefined) => {
    if (!path) return
    try {
      const url = await resolveProofUrl(path)
      if (url.startsWith('data:')) {
        // navegadores bloqueiam abrir data: direto na barra; mostra dentro de uma página em branco
        const win = window.open('')
        win?.document.write(`<iframe src="${url}" style="border:0;position:fixed;inset:0;width:100%;height:100%"></iframe>`)
      } else window.open(url, '_blank', 'noopener')
    } catch (error) {
      toast.error('Não foi possível abrir o arquivo', { description: error instanceof Error ? error.message : undefined })
    }
  }

  const invoiceColumn: Column<FinancialTransaction> = {
    header: 'Nota fiscal',
    cell: (t) =>
      t.nfse_status && t.nfse_status !== 'AUTHORIZED' && t.nfse_status !== 'CANCELED' ? (
        <span className={cn('text-xs font-medium', t.nfse_status === 'ERROR' || t.nfse_status === 'CANCELLATION_DENIED' ? 'text-red-600 dark:text-red-400' : 'text-slate-500 dark:text-slate-400')} title={t.nfse_error ?? undefined}>
          {nfseStatus[t.nfse_status]?.label ?? t.nfse_status}
        </span>
      ) : t.invoice_url ? (
        <button type="button" onClick={() => viewFile(t.invoice_url)} className="inline-flex items-center gap-1.5 text-xs font-medium text-brand-600 hover:underline dark:text-brand-400">
          <FileText className="h-3.5 w-3.5" /> {t.nfse_number ? `nº ${t.nfse_number}` : 'Ver'}
        </button>
      ) : (
        <button type="button" onClick={() => pickFile(t.id, 'invoice_url')} className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-slate-800 dark:hover:text-slate-200">
          <Paperclip className="h-3.5 w-3.5" /> Anexar
        </button>
      ),
  }

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
    { header: 'Vencimento', cell: (t) => <span className="tabular text-slate-600 dark:text-slate-300">{formatDate(t.due_date)}</span> },
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
      cell: (t) =>
        t.proof_url ? (
          <button type="button" onClick={() => viewFile(t.proof_url)} className="inline-flex items-center gap-1.5 text-xs font-medium text-brand-600 hover:underline dark:text-brand-400">
            <Eye className="h-3.5 w-3.5" /> Ver
          </button>
        ) : (
          <button type="button" onClick={() => pickFile(t.id, 'proof_url')} className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-slate-800 dark:hover:text-slate-200">
            <Paperclip className="h-3.5 w-3.5" /> Anexar
          </button>
        ),
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
            <DropdownItem icon={Paperclip} onSelect={() => pickFile(t.id, 'proof_url')}>{t.proof_url ? 'Trocar comprovante' : 'Anexar comprovante'}</DropdownItem>
            {t.proof_url && <DropdownItem icon={Eye} onSelect={() => viewFile(t.proof_url)}>Ver comprovante</DropdownItem>}
            {gateway && canIssueInvoice(t) && <DropdownItem icon={FileCheck2} onSelect={() => openInvoice(t)}>{t.nfse_status === 'ERROR' ? 'Emitir nota fiscal de novo' : 'Emitir nota fiscal'}</DropdownItem>}
            {t.nfse_id && <DropdownItem icon={RefreshCw} onSelect={() => charge('Consultando a nota no Asaas…', () => refreshInvoice(t.id), 'Nota fiscal atualizada')}>Atualizar nota fiscal</DropdownItem>}
            {t.nfse_status === 'AUTHORIZED' && <DropdownItem icon={FileX2} danger onSelect={() => cancelNfse(t)}>Cancelar nota fiscal</DropdownItem>}
            {t.type === 'income' && !t.nfse_id && <DropdownItem icon={FileText} onSelect={() => pickFile(t.id, 'invoice_url')}>{t.invoice_url ? 'Trocar nota fiscal' : 'Anexar nota fiscal'}</DropdownItem>}
            {t.type === 'income' && t.invoice_url && <DropdownItem icon={Eye} onSelect={() => viewFile(t.invoice_url)}>Ver nota fiscal</DropdownItem>}
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

      <input ref={fileInput} type="file" className="hidden" onChange={onFile} aria-label="Arquivo do lançamento" />

      <Tabs.Root value={tab} onValueChange={(v) => setTab(v as Tab)} className="mt-4">
        <Card>
          <Tabs.List className="flex gap-1 overflow-x-auto border-b px-3">
            {tabs.map((t) => (
              <Tabs.Trigger
                key={t.value}
                value={t.value}
                className="-mb-px whitespace-nowrap border-b-2 border-transparent px-3 py-3 text-sm font-medium text-slate-500 transition-colors hover:text-slate-800 data-[state=active]:border-brand-600 data-[state=active]:text-slate-900 dark:hover:text-slate-200 dark:data-[state=active]:text-slate-100"
              >
                {t.label}
                <span className="tabular ml-2 rounded-md bg-slate-100 px-1.5 py-0.5 text-xs text-slate-500 dark:bg-slate-800 dark:text-slate-400">{rowsByTab[t.value].length}</span>
              </Tabs.Trigger>
            ))}
          </Tabs.List>
          {tabs.map((t) => (
            <Tabs.Content key={t.value} value={t.value} className="focus:outline-none">
              <DataTable
                columns={t.value === 'income' ? incomeColumns : columns}
                rows={rowsByTab[t.value]}
                loading={loading}
                empty={
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
                }
              />
            </Tabs.Content>
          ))}
        </Card>
      </Tabs.Root>
    </>
  )
}
