import { Fragment, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { ArrowLeft, Check, ChevronDown, ChevronRight, FileCheck2, FileSignature, FileText, FolderKanban, MessageCircle, MoreHorizontal, Paperclip, Pencil, ReceiptText, Wallet, X } from 'lucide-react'
import { clientSchema } from '@/components/forms/GlobalModals'
import { InvoiceCell, ProofCell, useTransactionFiles } from '@/components/finance/useTransactionFiles'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { ListToolbar } from '@/components/ui/ListToolbar'
import { Pager, usePagination } from '@/components/ui/Pagination'
import { useListState } from '@/hooks/useListState'
import { matchesSearch, sortPair, sortRows, type SortOption } from '@/lib/list'
import { Dropdown, DropdownContent, DropdownItem, DropdownTrigger } from '@/components/ui/overlays'
import { Avatar, Badge, Button, Card, EmptyState, Field, Input, Select, Skeleton, Textarea } from '@/components/ui/primitives'
import { useTable, useUpdate } from '@/hooks/useData'
import { usesGateway } from '@/lib/billing'
import { clientStatus, contractStatus, effectiveStatus, projectStatus, proposalStatus, quoteStatus, toOptions, transactionStatus } from '@/lib/labels'
import { whatsappUrl } from '@/lib/leads'
import { canIssueInvoice, nfseStatus } from '@/lib/nfse'
import { quoteParts } from '@/lib/quote-finance'
import { cn, formatCurrency, formatDate, formatProposalNumber, formatQuoteNumber, isoDay, maskCpfCnpj, maskPhone, sum } from '@/lib/utils'
import { useUI } from '@/store/ui'
import type { Client, FinancialTransaction, Project, Quote } from '@/types/database.types'

type ClientForm = { name: string; company_name: string; email: string; phone: string; document: string; status: Client['status']; notes: string }
const formOf = (c: Client): ClientForm => ({
  name: c.name,
  company_name: c.company_name ?? '',
  email: c.email ?? '',
  phone: c.phone ?? '',
  document: c.document ?? '',
  status: c.status,
  notes: c.notes ?? '',
})

/** Nome da parte de um orçamento: integral, entrada ou saldo. */
const partLabel = (t: FinancialTransaction) => (!t.installments ? 'Integral' : t.installment === 1 ? `Entrada (1/${t.installments})` : `Saldo (${t.installment}/${t.installments})`)

/** Grupo da tabela de projetos: um projeto, ou os orçamentos que não estão ligados a nenhum. */
interface ProjectGroup {
  id: string
  project: Project | null
  quotes: Quote[]
  /** Lançamentos do projeto que não são de orçamento (parcelas lançadas à mão). */
  others: FinancialTransaction[]
}

/**
 * Tela geral do cliente: dados (editáveis só com a edição ligada), números,
 * projetos com os orçamentos de cada um (e as partes pagas ou a pagar, com
 * comprovante e nota fiscal), todos os pagamentos, notas fiscais, propostas
 * e contratos.
 */
export default function ClientView() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const openModal = useUI((s) => s.openModal)
  const clients = useTable('clients')
  const projects = useTable('projects').data ?? []
  const quotes = useTable('quotes').data ?? []
  const proposals = useTable('proposals').data ?? []
  const contracts = useTable('contracts').data ?? []
  const transactions = useTable('financial_transactions')
  const profile = useTable('profiles').data?.[0]
  const updateClient = useUpdate('clients')
  const updateTx = useUpdate('financial_transactions')
  const files = useTransactionFiles()
  const gateway = usesGateway(profile)

  const client = clients.data?.find((c) => c.id === id)
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState<ClientForm | null>(null)
  const [errors, setErrors] = useState<Partial<Record<keyof ClientForm, string>>>({})
  const [open, setOpen] = useState<string[]>([])

  useEffect(() => {
    if (client && !editing) setForm(formOf(client))
  }, [client, editing])

  const income = useMemo(
    () => (transactions.data ?? []).filter((t) => t.client_id === id && t.type === 'income').sort((a, b) => b.due_date.localeCompare(a.due_date)),
    [transactions.data, id],
  )
  const clientQuotes = quotes.filter((q) => q.client_id === id).sort((a, b) => b.quote_number - a.quote_number)
  const clientProjects = projects.filter((p) => p.client_id === id).sort((a, b) => b.created_at.localeCompare(a.created_at))
  const clientProposals = proposals.filter((p) => p.client_id === id).sort((a, b) => b.proposal_number - a.proposal_number)
  const clientContracts = contracts.filter((c) => c.client_id === id).sort((a, b) => b.created_at.localeCompare(a.created_at))
  const invoices = income.filter((t) => t.invoice_url || t.nfse_id)

  // projeto ↔ orçamento pela proposta de origem; o que sobra fica em "Orçamentos sem projeto"
  const groups = useMemo<ProjectGroup[]>(() => {
    const used = new Set<string>()
    const list: ProjectGroup[] = clientProjects.map((p) => {
      const qs = p.proposal_id ? clientQuotes.filter((q) => q.proposal_id === p.proposal_id) : []
      qs.forEach((q) => used.add(q.id))
      return { id: p.id, project: p, quotes: qs, others: income.filter((t) => t.project_id === p.id && !t.quote_id) }
    })
    const loose = clientQuotes.filter((q) => !used.has(q.id))
    if (loose.length) list.push({ id: 'loose', project: null, quotes: loose, others: [] })
    return list
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projects, quotes, income, id])

  const groupMoney = (g: ProjectGroup) => {
    const parts = [...g.quotes.flatMap((q) => quoteParts(income, q.id)), ...g.others]
    return { total: sum(parts.map((t) => t.amount)), received: sum(parts.filter((t) => t.status === 'paid').map((t) => t.amount)) }
  }

  const payList = useListState(`cliente-pagamentos:${id}`, { search: '', status: '', sort: 'due-desc' })
  const paySort: SortOption<FinancialTransaction>[] = [
    ...sortPair<FinancialTransaction>('due', ['Vencimento mais recente', 'Vencimento mais antigo'], (t) => t.due_date),
    ...sortPair<FinancialTransaction>('amount', ['Maior valor', 'Menor valor'], (t) => Number(t.amount)),
    ...sortPair<FinancialTransaction>('paid', ['Pagamento mais recente', 'Pagamento mais antigo'], (t) => t.payment_date),
  ]
  const payRows = useMemo(() => {
    const { search, status, sort } = payList.state
    const rows = income.filter((t) => {
      const s = effectiveStatus(t)
      return (!status || (status === 'open' ? s !== 'paid' : s === status)) && matchesSearch(search, [t.description, t.category, t.nfse_number, Number(t.amount).toFixed(2).replace('.', ',')])
    })
    return sortRows(rows, paySort, sort)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [income, payList.state])
  const groupPage = usePagination(groups)
  const invoicePage = usePagination(invoices)
  const proposalPage = usePagination(clientProposals)
  const contractPage = usePagination(clientContracts)

  if (clients.isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }
  if (!client || !form) {
    return (
      <EmptyState
        icon={FolderKanban}
        title="Cliente não encontrado"
        description="Ele pode ter sido excluído."
        action={
          <Button onClick={() => navigate('/clientes')}>
            <ArrowLeft className="h-4 w-4" /> Voltar para clientes
          </Button>
        }
      />
    )
  }

  const received = sum(income.filter((t) => t.status === 'paid').map((t) => t.amount))
  const receivable = income.filter((t) => t.status !== 'paid')
  const overdue = receivable.filter((t) => effectiveStatus(t) === 'overdue')
  const done = clientProjects.filter((p) => p.status === 'completed').length
  const wa = whatsappUrl(client.phone)

  const set = <K extends keyof ClientForm>(key: K, value: ClientForm[K]) => setForm((f) => (f ? { ...f, [key]: value } : f))
  const save = async () => {
    const parsed = clientSchema.safeParse(form)
    if (!parsed.success) {
      setErrors(Object.fromEntries(parsed.error.issues.map((i) => [i.path[0], i.message])))
      return
    }
    setErrors({})
    const blank = (v: string) => (v.trim() === '' ? null : v.trim())
    try {
      await updateClient.mutateAsync({
        id: client.id,
        patch: { name: form.name.trim(), company_name: blank(form.company_name), email: blank(form.email), phone: blank(form.phone), document: blank(form.document), status: form.status, notes: blank(form.notes) },
      })
      toast.success('Cliente atualizado')
      setEditing(false)
    } catch {
      // o hook já avisa e desfaz
    }
  }
  const cancelEdit = () => {
    setErrors({})
    setEditing(false)
  }

  const markPaid = (t: FinancialTransaction) => updateTx.mutate({ id: t.id, patch: { status: 'paid', payment_date: isoDay(new Date()) } }, { onSuccess: () => toast.success('Marcado como pago') })
  const toggle = (groupId: string) => setOpen((list) => (list.includes(groupId) ? list.filter((x) => x !== groupId) : [...list, groupId]))

  const statusBadge = (t: FinancialTransaction) => {
    const s = effectiveStatus(t)
    return <Badge tone={transactionStatus[s].tone}>{transactionStatus[s].label}</Badge>
  }

  const actions = (t: FinancialTransaction) => (
    <Dropdown>
      <DropdownTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Ações do pagamento" className="h-8 w-8">
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownTrigger>
      <DropdownContent>
        {t.status !== 'paid' && <DropdownItem icon={Check} onSelect={() => markPaid(t)}>Marcar como pago</DropdownItem>}
        <DropdownItem icon={Paperclip} onSelect={() => files.pick(t.id, 'proof_url')}>{t.proof_url ? 'Trocar comprovante' : 'Anexar comprovante'}</DropdownItem>
        {!t.nfse_id && <DropdownItem icon={FileText} onSelect={() => files.pick(t.id, 'invoice_url')}>{t.invoice_url ? 'Trocar nota fiscal' : 'Anexar nota fiscal'}</DropdownItem>}
        {gateway && canIssueInvoice(t) && (
          <DropdownItem icon={FileCheck2} onSelect={() => navigate('/ferramentas/nota-fiscal', { state: { transactionId: t.id } })}>Emitir nota fiscal</DropdownItem>
        )}
        <DropdownItem icon={Pencil} onSelect={() => openModal({ type: 'transaction', record: t })}>Editar lançamento</DropdownItem>
      </DropdownContent>
    </Dropdown>
  )

  /** Tabela das partes (integral, entrada, saldo) ou lançamentos dentro de um projeto. */
  const partsTable = (rows: FinancialTransaction[], label: (t: FinancialTransaction) => string) => (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] text-sm">
        <thead>
          <tr className="text-left text-[11px] uppercase tracking-wider text-slate-500 dark:text-slate-400">
            <th className="py-2 pr-3 font-medium">Parte</th>
            <th className="py-2 pr-3 font-medium">Vencimento</th>
            <th className="py-2 pr-3 font-medium">Pagamento</th>
            <th className="py-2 pr-3 font-medium">Situação</th>
            <th className="py-2 pr-3 font-medium">Comprovante</th>
            <th className="py-2 pr-3 font-medium">Nota fiscal</th>
            <th className="py-2 pr-3 text-right font-medium">Valor</th>
            <th className="w-10" />
          </tr>
        </thead>
        <tbody>
          {rows.map((t) => (
            <tr key={t.id} className="border-t">
              <td className="min-w-[160px] py-2 pr-3 font-medium">{label(t)}</td>
              <td className="tabular py-2 pr-3 text-slate-600 dark:text-slate-300">{formatDate(t.due_date)}</td>
              <td className="tabular py-2 pr-3 text-slate-600 dark:text-slate-300">{formatDate(t.payment_date)}</td>
              <td className="py-2 pr-3">{statusBadge(t)}</td>
              <td className="py-2 pr-3">
                <ProofCell t={t} files={files} />
              </td>
              <td className="py-2 pr-3">
                <InvoiceCell t={t} files={files} />
              </td>
              <td className="tabular py-2 pr-3 text-right font-medium">{formatCurrency(t.amount)}</td>
              <td className="py-1 text-right">{actions(t)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )

  const paymentColumns: Column<FinancialTransaction>[] = [
    {
      header: 'Descrição',
      primary: true,
      cell: (t) => (
        <div className="min-w-0">
          <p className="truncate font-medium">{t.description ?? t.category ?? '—'}</p>
          <p className="truncate text-xs text-slate-500 dark:text-slate-400">{[projects.find((p) => p.id === t.project_id)?.title, t.category].filter(Boolean).join(' · ') || '—'}</p>
        </div>
      ),
    },
    { header: 'Vencimento', cell: (t) => <span className="tabular text-slate-600 dark:text-slate-300">{formatDate(t.due_date)}</span> },
    { header: 'Pagamento', cell: (t) => <span className="tabular text-slate-600 dark:text-slate-300">{formatDate(t.payment_date)}</span> },
    { header: 'Situação', cell: statusBadge },
    { header: 'Comprovante', cell: (t) => <ProofCell t={t} files={files} /> },
    { header: 'Nota fiscal', cell: (t) => <InvoiceCell t={t} files={files} /> },
    { header: 'Valor', className: 'text-right', cell: (t) => <span className="tabular font-medium">{formatCurrency(t.amount)}</span> },
    { header: '', className: 'w-12 text-right', cell: actions },
  ]

  const muted = 'text-xs text-slate-500 dark:text-slate-400'
  const info = (label: string, value: React.ReactNode) => (
    <div>
      <dt className={muted}>{label}</dt>
      <dd className="mt-0.5 break-words text-sm font-medium">{value || '—'}</dd>
    </div>
  )

  return (
    <>
      {files.input}
      <Link to="/clientes" className="mb-3 inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200">
        <ArrowLeft className="h-4 w-4" /> Clientes
      </Link>

      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          <Avatar name={client.name} className="h-12 w-12 text-base" />
          <div className="min-w-0">
            <h1 className="flex flex-wrap items-center gap-2 text-xl font-semibold tracking-tight">
              <span className="truncate">{client.name}</span>
              <Badge tone={clientStatus[client.status].tone}>{clientStatus[client.status].label}</Badge>
            </h1>
            <p className="truncate text-sm text-slate-500 dark:text-slate-400">
              {client.company_name ?? 'Pessoa física'} · cliente desde {formatDate(client.created_at, "MMMM 'de' yyyy")}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {wa && (
            <a href={wa} target="_blank" rel="noopener noreferrer" className="inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-800">
              <MessageCircle className="h-4 w-4" /> Entrar em contato
            </a>
          )}
          {!editing && (
            <Button variant="secondary" onClick={() => setEditing(true)}>
              <Pencil className="h-4 w-4" /> Habilitar edição
            </Button>
          )}
        </div>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-4 xl:grid-cols-4">
        {[
          { label: 'Total recebido', value: formatCurrency(received), hint: `${income.filter((t) => t.status === 'paid').length} pagamentos` },
          { label: 'A receber', value: formatCurrency(sum(receivable.map((t) => t.amount))), hint: overdue.length ? `${overdue.length} em atraso` : 'nada em atraso', tone: overdue.length ? 'bad' : undefined },
          { label: 'Projetos', value: String(clientProjects.length), hint: `${done} concluído${done === 1 ? '' : 's'}` },
          { label: 'Notas fiscais', value: String(invoices.filter((t) => t.invoice_url || t.nfse_status === 'AUTHORIZED').length), hint: `${income.filter((t) => t.status === 'paid' && !t.invoice_url && !t.nfse_id).length} pagamentos sem nota` },
        ].map((s) => (
          <Card key={s.label} className="p-4 sm:p-5">
            <p className="text-sm text-slate-500 dark:text-slate-400">{s.label}</p>
            <p className="tabular mt-1.5 text-xl font-semibold tracking-tight sm:text-2xl">{s.value}</p>
            <p className={cn('mt-1 text-xs', s.tone === 'bad' ? 'text-red-600 dark:text-red-400' : 'text-slate-500 dark:text-slate-400')}>{s.hint}</p>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-[340px_1fr]">
        <Card className="p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-semibold">Informações</h2>
            {editing && <Badge tone="amber">Editando</Badge>}
          </div>
          {editing ? (
            <form
              noValidate
              className="space-y-3"
              onSubmit={(e) => {
                e.preventDefault()
                save()
              }}
            >
              <Field label="Nome do contato" error={errors.name}>
                <Input value={form.name} onChange={(e) => set('name', e.target.value)} />
              </Field>
              <Field label="Empresa" error={errors.company_name}>
                <Input value={form.company_name} onChange={(e) => set('company_name', e.target.value)} />
              </Field>
              <Field label="CPF / CNPJ" error={errors.document}>
                <Input value={form.document} onChange={(e) => set('document', maskCpfCnpj(e.target.value))} placeholder="00.000.000/0000-00" />
              </Field>
              <Field label="E-mail" error={errors.email}>
                <Input type="email" value={form.email} onChange={(e) => set('email', e.target.value)} />
              </Field>
              <Field label="WhatsApp" error={errors.phone}>
                <Input value={form.phone} onChange={(e) => set('phone', maskPhone(e.target.value))} placeholder="(00) 00000-0000" />
              </Field>
              <Field label="Status">
                <Select value={form.status} onChange={(e) => set('status', e.target.value as Client['status'])}>
                  {toOptions(clientStatus).map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Observações" error={errors.notes}>
                <Textarea rows={3} value={form.notes} onChange={(e) => set('notes', e.target.value)} />
              </Field>
              <div className="flex gap-2 pt-1">
                <Button type="submit" loading={updateClient.isPending} className="flex-1">
                  <Check className="h-4 w-4" /> Salvar
                </Button>
                <Button type="button" variant="secondary" onClick={cancelEdit}>
                  <X className="h-4 w-4" /> Cancelar
                </Button>
              </div>
            </form>
          ) : (
            <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-1">
              {info('Nome do contato', client.name)}
              {info('Empresa', client.company_name)}
              {info('CPF / CNPJ', client.document && <span className="tabular">{client.document}</span>)}
              {info('E-mail', client.email && <a href={`mailto:${client.email}`} className="text-brand-600 hover:underline dark:text-brand-400">{client.email}</a>)}
              {info('WhatsApp', client.phone && <span className="tabular">{client.phone}</span>)}
              {info('Observações', client.notes && <span className="whitespace-pre-line font-normal">{client.notes}</span>)}
            </dl>
          )}
        </Card>

        <Card>
          <div className="flex items-center justify-between border-b px-5 py-3.5">
            <h2 className="text-sm font-semibold">Projetos e orçamentos</h2>
            <span className={muted}>Clique num projeto para ver os orçamentos</span>
          </div>
          {groups.length === 0 ? (
            <EmptyState icon={FolderKanban} title="Nenhum projeto ainda" description="Os projetos e orçamentos deste cliente aparecem aqui." className="py-10" />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-sm">
                <thead>
                  <tr className="border-b text-left text-xs text-slate-500 dark:text-slate-400">
                    <th className="w-8 py-2.5 pl-4" />
                    <th className="py-2.5 pr-3 font-medium">Projeto</th>
                    <th className="py-2.5 pr-3 font-medium">Situação</th>
                    <th className="py-2.5 pr-3 font-medium">Prazo</th>
                    <th className="py-2.5 pr-3 text-right font-medium">Recebido</th>
                    <th className="py-2.5 pr-5 text-right font-medium">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {groupPage.visible.map((g) => {
                    const expanded = open.includes(g.id)
                    const money = groupMoney(g)
                    const count = g.quotes.length
                    return (
                      <Fragment key={g.id}>
                        <tr onClick={() => toggle(g.id)} aria-expanded={expanded} className={cn('cursor-pointer border-b hover:bg-slate-50 dark:hover:bg-slate-800/50', expanded && 'bg-slate-50 dark:bg-slate-800/40')}>
                          <td className="py-3 pl-4 text-slate-400">{expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}</td>
                          <td className="py-3 pr-3">
                            <p className="font-medium">{g.project ? g.project.title : 'Orçamentos sem projeto'}</p>
                            <p className={muted}>
                              {count} orçamento{count === 1 ? '' : 's'}
                              {g.others.length ? ` · ${g.others.length} lançamento${g.others.length === 1 ? '' : 's'}` : ''}
                            </p>
                          </td>
                          <td className="py-3 pr-3">{g.project ? <Badge tone={projectStatus[g.project.status].tone}>{projectStatus[g.project.status].label}</Badge> : <span className={muted}>—</span>}</td>
                          <td className="tabular py-3 pr-3 text-slate-600 dark:text-slate-300">{formatDate(g.project?.deadline)}</td>
                          <td className="tabular py-3 pr-3 text-right">{formatCurrency(money.received)}</td>
                          <td className="tabular py-3 pr-5 text-right font-medium">{formatCurrency(money.total || g.project?.budget || 0)}</td>
                        </tr>
                        {expanded && (
                          <tr className="border-b bg-slate-50/60 dark:bg-slate-900/40">
                            <td colSpan={6} className="px-4 py-3 sm:pl-12">
                              <div className="space-y-3">
                                {g.quotes.length === 0 && g.others.length === 0 && <p className={cn(muted, 'py-2')}>Este projeto ainda não tem orçamento nem lançamentos.</p>}
                                {g.quotes.map((q) => {
                                  const parts = quoteParts(income, q.id)
                                  return (
                                    <div key={q.id} className="rounded-lg border bg-white p-3 dark:bg-slate-900">
                                      <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
                                        <div className="min-w-0">
                                          <p className="truncate font-medium">
                                            <span className="tabular text-slate-500 dark:text-slate-400">{formatQuoteNumber(q.quote_number)}</span> · {q.title}
                                          </p>
                                          <p className={muted}>
                                            Criado em {formatDate(q.created_at)} · {q.deposit_pct ? `entrada de ${q.deposit_pct}% + saldo` : 'pagamento integral'}
                                          </p>
                                        </div>
                                        <div className="flex items-center gap-2">
                                          <Badge tone={quoteStatus[q.status].tone}>{quoteStatus[q.status].label}</Badge>
                                          <span className="tabular font-semibold">{formatCurrency(q.total_amount)}</span>
                                        </div>
                                      </div>
                                      {parts.length ? partsTable(parts, partLabel) : <p className={cn(muted, 'pt-1')}>Sem lançamentos no financeiro.</p>}
                                    </div>
                                  )
                                })}
                                {g.others.length > 0 && (
                                  <div className="rounded-lg border bg-white p-3 dark:bg-slate-900">
                                    <p className="mb-1 font-medium">Outros lançamentos do projeto</p>
                                    {partsTable(g.others, (t) => t.description ?? t.category ?? 'Lançamento')}
                                  </div>
                                )}
                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
          <Pager {...groupPage} />
        </Card>
      </div>

      <Card className="mt-4">
        <h2 className="flex items-center gap-2 border-b px-5 py-3.5 text-sm font-semibold">
          <Wallet className="h-4 w-4 text-slate-400" /> Pagamentos
        </h2>
        {income.length > 0 && (
          <ListToolbar
            search={{ value: payList.state.search, onChange: (v) => payList.set('search', v), placeholder: 'Buscar por descrição, categoria, nota ou valor' }}
            filters={[
              {
                label: 'Filtrar pagamentos por situação',
                value: payList.state.status,
                onChange: (v) => payList.set('status', v),
                allLabel: 'Todas as situações',
                options: [{ value: 'open', label: 'Em aberto (pendente ou atrasado)' }, ...toOptions(transactionStatus)],
              },
            ]}
            sort={{ value: payList.state.sort, onChange: (v) => payList.set('sort', v), options: paySort }}
            count={{ shown: payRows.length, total: income.length, noun: ['pagamento', 'pagamentos'] }}
            filtering={payList.filtering}
            onClear={payList.reset}
          />
        )}
        <DataTable
          columns={paymentColumns}
          rows={payRows}
          loading={transactions.isLoading}
          pageSize={10}
          empty={
            income.length > 0 ? (
              <EmptyState icon={Wallet} title="Nenhum pagamento encontrado" description="Ajuste a busca ou o filtro." className="py-10" />
            ) : (
              <EmptyState icon={Wallet} title="Nenhum pagamento ainda" description="Os recebimentos deste cliente aparecem aqui." className="py-10" />
            )
          }
        />
      </Card>

      <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Card>
          <h2 className="flex items-center gap-2 border-b px-5 py-3.5 text-sm font-semibold">
            <ReceiptText className="h-4 w-4 text-slate-400" /> Notas fiscais
          </h2>
          {invoices.length === 0 ? (
            <p className={cn(muted, 'px-5 py-6 text-center')}>Nenhuma nota fiscal ainda.</p>
          ) : (
            <ul>
              {invoicePage.visible.map((t) => {
                const s = t.nfse_status ? nfseStatus[t.nfse_status] : null
                return (
                  <li key={t.id} className="flex items-center gap-3 border-b px-5 py-3 last:border-0">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{t.nfse_number ? `NF nº ${t.nfse_number}` : t.nfse_id ? 'NF sem número' : 'NF anexada'}</p>
                      <p className={cn(muted, 'truncate')}>
                        {formatCurrency(t.amount)} · {t.description ?? t.category ?? ''}
                      </p>
                    </div>
                    {s && <Badge tone={s.tone}>{s.label}</Badge>}
                    {t.invoice_url && (
                      <Button variant="ghost" size="sm" onClick={() => files.view(t.invoice_url)}>
                        Ver
                      </Button>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
          <Pager {...invoicePage} />
        </Card>

        <Card>
          <h2 className="flex items-center gap-2 border-b px-5 py-3.5 text-sm font-semibold">
            <FileText className="h-4 w-4 text-slate-400" /> Propostas
          </h2>
          {clientProposals.length === 0 ? (
            <p className={cn(muted, 'px-5 py-6 text-center')}>Nenhuma proposta ainda.</p>
          ) : (
            <ul>
              {proposalPage.visible.map((p) => (
                <li key={p.id}>
                  <Link to={`/propostas/${p.id}`} className="flex items-center gap-3 border-b px-5 py-3 last:border-0 hover:bg-slate-50 dark:hover:bg-slate-800/50">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{p.title}</p>
                      <p className={cn(muted, 'tabular')}>
                        {formatProposalNumber(p.proposal_number)} · {formatCurrency(p.total_amount)} · {formatDate(p.created_at)}
                      </p>
                    </div>
                    <Badge tone={proposalStatus[p.status].tone}>{proposalStatus[p.status].label}</Badge>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          <Pager {...proposalPage} />
        </Card>

        <Card>
          <h2 className="flex items-center gap-2 border-b px-5 py-3.5 text-sm font-semibold">
            <FileSignature className="h-4 w-4 text-slate-400" /> Contratos
          </h2>
          {clientContracts.length === 0 ? (
            <p className={cn(muted, 'px-5 py-6 text-center')}>Nenhum contrato ainda.</p>
          ) : (
            <ul>
              {contractPage.visible.map((c) => (
                <li key={c.id} className="flex items-center gap-3 border-b px-5 py-3 last:border-0">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{c.title}</p>
                    <p className={cn(muted, 'tabular')}>
                      {c.monthly_amount ? `${formatCurrency(c.monthly_amount)}/mês · ` : ''}
                      {c.signed_at ? `assinado em ${formatDate(c.signed_at)}` : `criado em ${formatDate(c.created_at)}`}
                    </p>
                  </div>
                  <Badge tone={contractStatus[c.status].tone}>{contractStatus[c.status].label}</Badge>
                </li>
              ))}
            </ul>
          )}
          <Pager {...contractPage} />
        </Card>
      </div>
    </>
  )
}
