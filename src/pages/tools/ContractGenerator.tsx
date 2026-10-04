import { Fragment, useEffect, useMemo, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { useForm, type UseFormRegisterReturn } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { Download, Lock, Repeat, Save, ScrollText } from 'lucide-react'
import { Pager, usePagination } from '@/components/ui/Pagination'
import { Button, Card, EmptyState, Field, Input, PageHeader, Select, Textarea } from '@/components/ui/primitives'
import { useInsert, useRemove, useTable, useUpdate } from '@/hooks/useData'
import { buildContractMarkdown, contractClauses, defaultClauses, serviceKinds } from '@/lib/contract'
import { contractStatus, proposalStatus, toOptions } from '@/lib/labels'
import { downloadContractPdf } from '@/lib/pdf'
import { MAX_INSTALLMENTS } from '@/lib/recurrence'
import { cn, formatCurrency, formatDate, formatProposalNumber, isoDay } from '@/lib/utils'
import type { Contract, ContractStatus } from '@/types/database.types'

const days = (min: number, message: string) => z.coerce.number().int('Use um número inteiro').min(min, message)
const pct = z.coerce.number().min(0, 'Não pode ser negativa').max(100, 'Máximo de 100%')
const money = z.coerce.number({ invalid_type_error: 'Informe um número' }).min(0, 'Não pode ser negativo')

const schema = z.object({
  proposal_id: z.string(),
  client_id: z.string().min(1, 'Selecione o cliente'),
  title: z.string().min(3, 'Informe um título'),
  objectDetails: z.string(),
  executionDays: days(1, 'Mínimo de 1 dia'),
  termMonths: days(1, 'Mínimo de 1 mês').max(MAX_INSTALLMENTS, `Máximo de ${MAX_INSTALLMENTS} meses`),
  monthlyAmount: money,
  firstDueDate: z.string(),
  infoDeadlineDays: days(1, 'Mínimo de 1 dia'),
  infoGraceDays: days(0, 'Não pode ser negativo'),
  infoDailyFee: money,
  revisionLimit: days(0, 'Não pode ser negativo'),
  paymentDays: days(0, 'Não pode ser negativo'),
  latePenaltyPct: pct,
  terminationPenaltyPct: pct,
  noticeDays: days(0, 'Não pode ser negativo'),
  warrantyDays: days(0, 'Não pode ser negativo'),
  responseHours: days(1, 'Mínimo de 1 hora'),
  forum: z.string().min(2, 'Informe a comarca'),
})
type Values = z.infer<typeof schema>
type NumericField = Exclude<keyof Values, 'proposal_id' | 'client_id' | 'title' | 'objectDetails' | 'forum' | 'firstDueDate'>

/** Parâmetros que cada cláusula expõe quando está ligada. */
const clauseParams: Record<string, Array<{ name: NumericField; label: string; step?: string }>> = {
  term: [{ name: 'executionDays', label: 'Prazo (dias corridos)' }],
  // valor mensal e vigência ficam no cartão "Recorrência"
  recurring: [{ name: 'noticeDays', label: 'Aviso prévio (dias)' }],
  client_delay: [
    { name: 'infoDeadlineDays', label: 'Prazo para enviar (dias)' },
    { name: 'infoGraceDays', label: 'Diária após (dias de atraso)' },
    { name: 'infoDailyFee', label: 'Valor da diária (R$)', step: '0.01' },
  ],
  payment: [
    { name: 'paymentDays', label: 'Vencimento (dias após a cobrança)' },
    { name: 'latePenaltyPct', label: 'Multa por atraso (%)', step: '0.5' },
  ],
  revisions: [{ name: 'revisionLimit', label: 'Rodadas de ajuste incluídas' }],
  warranty: [{ name: 'warrantyDays', label: 'Garantia (dias)' }],
  sla: [{ name: 'responseHours', label: 'Primeira resposta (horas úteis)' }],
  termination: [
    { name: 'noticeDays', label: 'Aviso prévio (dias)' },
    { name: 'terminationPenaltyPct', label: 'Multa rescisória (%)' },
  ],
}

// prazo único e vigência mensal descrevem modelos de contrato diferentes
const exclusive: Record<string, string> = { term: 'recurring', recurring: 'term' }

/** Renderiza o markdown simples do contrato (#, ##, parágrafos, **negrito**). */
function Markdown({ source }: { source: string }) {
  const bold = (text: string) =>
    text.split(/\*\*(.+?)\*\*/g).map((part, i) => (i % 2 ? <strong key={i}>{part}</strong> : <Fragment key={i}>{part}</Fragment>))
  return (
    <>
      {source.split('\n').map((raw, i) => {
        const line = raw.trim()
        if (!line) return null
        if (line.startsWith('# ')) return <h2 key={i} className="mb-6 text-center text-xl font-semibold tracking-tight">{line.slice(2)}</h2>
        if (line.startsWith('## ')) return <h3 key={i} className="mb-1.5 mt-6 text-sm font-semibold">{line.slice(3)}</h3>
        return <p key={i} className="mb-2.5 text-justify">{bold(line)}</p>
      })}
    </>
  )
}

function Check({ checked, disabled, onChange, label }: { checked: boolean; disabled?: boolean; onChange: () => void; label: string }) {
  return (
    <input
      type="checkbox"
      aria-label={label}
      checked={checked}
      disabled={disabled}
      onChange={onChange}
      className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300 accent-brand-600 disabled:opacity-60"
    />
  )
}

export default function ContractGenerator() {
  const preselected = (useLocation().state as { proposalId?: string } | null)?.proposalId
  const proposals = useTable('proposals')
  const clients = useTable('clients')
  const contracts = useTable('contracts')
  const transactions = useTable('financial_transactions')
  const removeTransaction = useRemove('financial_transactions')
  const profile = useTable('profiles').data?.[0]
  const insert = useInsert('contracts')
  const update = useUpdate('contracts')
  const remove = useRemove('contracts')
  const [clauses, setClauses] = useState<string[]>(defaultClauses)
  const [services, setServices] = useState<string[]>(['maintenance', 'data'])
  const saved = usePagination(contracts.data)

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    setError,
    getValues,
    formState: { errors, isSubmitting },
  } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      proposal_id: preselected ?? '',
      client_id: '',
      title: '',
      objectDetails: '',
      executionDays: 30,
      termMonths: 12,
      monthlyAmount: 0,
      firstDueDate: '',
      infoDeadlineDays: 7,
      infoGraceDays: 3,
      infoDailyFee: 90,
      revisionLimit: 2,
      paymentDays: 5,
      latePenaltyPct: 2,
      terminationPenaltyPct: 20,
      noticeDays: 15,
      warrantyDays: 30,
      responseHours: 24,
      forum: '',
    },
  })

  const values = watch()
  const proposal = proposals.data?.find((p) => p.id === values.proposal_id)
  const client = clients.data?.find((c) => c.id === values.client_id)

  // escolher a proposta puxa cliente, título e escopo dela
  useEffect(() => {
    if (!proposal) return
    if (proposal.client_id) setValue('client_id', proposal.client_id)
    setValue('title', `Contrato — ${proposal.title}`)
    setValue('objectDetails', proposal.scope_text ?? '')
    if (!Number(getValues('monthlyAmount'))) setValue('monthlyAmount', proposal.total_amount)
  }, [proposal?.id, setValue]) // eslint-disable-line react-hooks/exhaustive-deps

  // aprovadas primeiro: são as que normalmente viram contrato
  const proposalOptions = useMemo(
    () => [...(proposals.data ?? [])].sort((a, b) => Number(b.status === 'approved') - Number(a.status === 'approved')),
    [proposals.data],
  )

  const toggleClause = (id: string) =>
    setClauses((current) => (current.includes(id) ? current.filter((c) => c !== id) : [...current.filter((c) => c !== exclusive[id]), id]))
  const toggleService = (id: string) => setServices((current) => (current.includes(id) ? current.filter((s) => s !== id) : [...current, id]))

  const num = (name: NumericField) => Number(values[name]) || 0
  const markdown = buildContractMarkdown(
    {
      title: values.title,
      services,
      objectDetails: values.objectDetails ?? '',
      executionDays: num('executionDays'),
      termMonths: num('termMonths'),
      monthlyAmount: num('monthlyAmount'),
      infoDeadlineDays: num('infoDeadlineDays'),
      infoGraceDays: num('infoGraceDays'),
      infoDailyFee: num('infoDailyFee'),
      revisionLimit: num('revisionLimit'),
      paymentDays: num('paymentDays'),
      latePenaltyPct: num('latePenaltyPct'),
      terminationPenaltyPct: num('terminationPenaltyPct'),
      noticeDays: num('noticeDays'),
      warrantyDays: num('warrantyDays'),
      responseHours: num('responseHours'),
      forum: values.forum,
      clauses,
    },
    proposal,
    client,
    profile,
  )

  const issuer = profile?.company_name || profile?.full_name || 'Contrato'
  const activeCount = contractClauses.filter((c) => c.required || clauses.includes(c.id)).length

  const guard = (run: (v: Values) => void | Promise<void>) =>
    handleSubmit(run, () => toast.error('Revise os campos destacados antes de continuar'))

  const recurring = clauses.includes('recurring')

  /** Contrato com mensalidade precisa do valor mensal antes de salvar ou exportar. */
  const recurrenceReady = (v: Values) => {
    if (!recurring || v.monthlyAmount > 0) return true
    setError('monthlyAmount', { message: 'Informe o valor mensal' })
    toast.error('Informe o valor mensal da recorrência')
    return false
  }

  const save = guard(async (v) => {
    if (!recurrenceReady(v)) return
    try {
      await insert.mutateAsync({
        proposal_id: v.proposal_id || null,
        client_id: v.client_id,
        title: v.title,
        content_markdown: markdown,
        status: 'draft',
        // só vão para o banco quando há mensalidade
        ...(recurring ? { monthly_amount: v.monthlyAmount, term_months: v.termMonths, first_due_date: v.firstDueDate || null } : {}),
      })
      toast.success('Contrato salvo')
    } catch {
      // toast de erro já exibido pelo hook
    }
  })

  const download = guard((v) => {
    if (recurrenceReady(v)) downloadContractPdf(v.title, markdown, issuer)
  })

  /**
   * Assinar lança as mensalidades (feito no hook de atualização). Encerrar
   * oferece tirar do financeiro as que ainda não venceram.
   */
  const changeStatus = async (contract: Contract, status: ContractStatus) => {
    try {
      await update.mutateAsync({ id: contract.id, patch: { status } })
    } catch {
      return // toast de erro já exibido pelo hook
    }
    if (status !== 'terminated') return
    const today = isoDay(new Date())
    const future = (transactions.data ?? []).filter((t) => t.contract_id === contract.id && t.status !== 'paid' && t.due_date > today)
    if (future.length === 0) return
    if (!window.confirm(`Remover do financeiro as ${future.length} mensalidades deste contrato que ainda não venceram? As pagas e as já vencidas continuam lá.`)) return
    try {
      for (const t of future) await removeTransaction.mutateAsync(t.id)
      toast.success('Mensalidades futuras removidas')
    } catch {
      // toast de erro já exibido pelo hook
    }
  }

  const paramInput = (reg: UseFormRegisterReturn, label: string, error: string | undefined, step?: string) => (
    <Field key={reg.name} label={label} error={error} className="w-full sm:w-44">
      <Input type="number" min={0} step={step ?? '1'} {...reg} />
    </Field>
  )

  return (
    <>
      <PageHeader
        title="Gerador de contratos"
        description="Parta de uma proposta, escolha as cláusulas e exporte."
        actions={
          <>
            <Button variant="secondary" onClick={download}>
              <Download className="h-4 w-4" /> Baixar PDF
            </Button>
            <Button loading={isSubmitting} onClick={save}>
              <Save className="h-4 w-4" /> Salvar contrato
            </Button>
          </>
        }
      />

      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,460px)_1fr]">
        <div className="space-y-4">
          <Card className="space-y-4 p-5">
            <h2 className="text-sm font-semibold">Origem</h2>
            <Field label="Proposta">
              <Select {...register('proposal_id')}>
                <option value="">Sem proposta (contrato avulso)</option>
                {proposalOptions.map((p) => (
                  <option key={p.id} value={p.id}>
                    {formatProposalNumber(p.proposal_number)} · {p.title} ({proposalStatus[p.status].label.toLowerCase()})
                  </option>
                ))}
              </Select>
            </Field>
            {proposal && proposal.status !== 'approved' && (
              <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-950/50 dark:text-amber-300">
                Esta proposta ainda não foi aprovada pelo cliente.
              </p>
            )}
            <Field label="Cliente" error={errors.client_id?.message}>
              <Select {...register('client_id')}>
                <option value="">Selecione…</option>
                {clients.data?.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.company_name ? `${c.name} — ${c.company_name}` : c.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Título do contrato" error={errors.title?.message}>
              <Input {...register('title')} />
            </Field>
            {proposal && (
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Valor da proposta: <span className="tabular font-medium text-slate-900 dark:text-slate-100">{formatCurrency(proposal.total_amount)}</span>
              </p>
            )}
          </Card>

          <Card className="space-y-4 p-5">
            <div>
              <h2 className="text-sm font-semibold">Recorrência</h2>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">Para contrato com mensalidade. As parcelas entram no financeiro quando o contrato for marcado como assinado.</p>
            </div>
            <label className="flex cursor-pointer items-start gap-2.5 text-sm">
              <Check checked={recurring} onChange={() => toggleClause('recurring')} label="Este contrato tem mensalidade" />
              Este contrato tem mensalidade
            </label>
            {recurring && (
              <>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Valor mensal (R$)" error={errors.monthlyAmount?.message}>
                    <Input type="number" min={0} step="0.01" {...register('monthlyAmount')} />
                  </Field>
                  <Field label="Tempo de contrato (meses)" error={errors.termMonths?.message}>
                    <Input type="number" min={1} max={MAX_INSTALLMENTS} step="1" {...register('termMonths')} />
                  </Field>
                  <Field label="Primeiro vencimento (opcional)" error={errors.firstDueDate?.message} className="sm:col-span-2">
                    <Input type="date" {...register('firstDueDate')} />
                  </Field>
                </div>
                <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600 dark:bg-slate-800/60 dark:text-slate-300">
                  {num('termMonths')} mensalidades de <span className="tabular font-medium">{formatCurrency(num('monthlyAmount'))}</span>, total de{' '}
                  <span className="tabular font-medium">{formatCurrency(num('termMonths') * num('monthlyAmount'))}</span>.{' '}
                  {values.firstDueDate ? `A primeira vence em ${formatDate(values.firstDueDate)}.` : 'Sem data informada, a primeira vence um mês após a assinatura.'}
                </p>
              </>
            )}
          </Card>

          <Card className="space-y-4 p-5">
            <div>
              <h2 className="text-sm font-semibold">Serviços do objeto</h2>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">Marque o que descreve o trabalho. O texto precisa bater com o que você entrega e com a nota fiscal.</p>
            </div>
            <div className="space-y-2">
              {serviceKinds.map((k) => (
                <label key={k.id} className="flex cursor-pointer items-start gap-2.5 text-sm">
                  <Check checked={services.includes(k.id)} onChange={() => toggleService(k.id)} label={k.label} />
                  {k.label}
                </label>
              ))}
            </div>
            <Field label="Detalhamento (opcional)">
              <Textarea rows={3} placeholder="Ex.: atualização mensal da lista de clientes e correção de cadastros duplicados no sistema de vendas." {...register('objectDetails')} />
            </Field>
          </Card>

          <Card>
            <div className="flex items-center justify-between gap-3 border-b px-5 py-3.5">
              <div>
                <h2 className="text-sm font-semibold">Cláusulas</h2>
                <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{activeCount} no contrato · a numeração se ajusta sozinha</p>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setClauses(defaultClauses)}>
                Restaurar recomendadas
              </Button>
            </div>
            <ul>
              {contractClauses.map((clause) => {
                const active = clause.required || clauses.includes(clause.id)
                // o aviso prévio é um campo só: com a rescisão ligada, ele é editado lá
                const params = (active ? clauseParams[clause.id] ?? [] : []).filter(
                  (p) => !(clause.id === 'recurring' && p.name === 'noticeDays' && clauses.includes('termination')),
                )
                return (
                  <li key={clause.id} className={cn('border-b px-5 py-3 last:border-0', !active && 'opacity-70')}>
                    <label className={cn('flex items-start gap-2.5', !clause.required && 'cursor-pointer')}>
                      <Check checked={active} disabled={clause.required} onChange={() => toggleClause(clause.id)} label={clause.title} />
                      <span className="min-w-0">
                        <span className="flex items-center gap-1.5 text-sm font-medium">
                          {clause.title}
                          {clause.required && <Lock className="h-3 w-3 text-slate-400" aria-label="Obrigatória" />}
                        </span>
                        <span className="block text-xs text-slate-500 dark:text-slate-400">{clause.hint}</span>
                      </span>
                    </label>
                    {(params.length > 0 || (active && clause.id === 'forum')) && (
                      <div className="mt-3 flex flex-wrap gap-3 pl-6">
                        {params.map((p) => paramInput(register(p.name), p.label, errors[p.name]?.message, p.step))}
                        {clause.id === 'forum' && (
                          <Field label="Comarca" error={errors.forum?.message} className="w-full sm:w-64">
                            <Input placeholder="Ex.: São Paulo/SP" {...register('forum')} />
                          </Field>
                        )}
                      </div>
                    )}
                  </li>
                )
              })}
            </ul>
          </Card>

          <Card>
            <h2 className="border-b px-5 py-3.5 text-sm font-semibold">Contratos salvos</h2>
            {saved.total === 0 ? (
              <EmptyState icon={ScrollText} title="Nenhum contrato salvo" description="Os contratos que você salvar aparecem aqui." className="py-8" />
            ) : (
              <>
                <ul>
                  {saved.visible.map((c) => (
                    <li key={c.id} className="flex items-center gap-3 border-b px-5 py-3 last:border-0">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{c.title}</p>
                        <p className="tabular flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                          {formatDate(c.created_at)}
                          {c.monthly_amount && c.term_months ? (
                            <>
                              <Repeat className="h-3 w-3" aria-hidden />
                              {c.term_months} × {formatCurrency(c.monthly_amount)}
                            </>
                          ) : null}
                        </p>
                      </div>
                      <Select
                        aria-label="Alterar status"
                        value={c.status}
                        onChange={(e) => changeStatus(c, e.target.value as ContractStatus)}
                        className="h-8 w-28 text-xs"
                      >
                        {toOptions(contractStatus).map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.label}
                          </option>
                        ))}
                      </Select>
                      <Button variant="ghost" size="icon" aria-label="Baixar PDF" className="h-8 w-8" onClick={() => downloadContractPdf(c.title, c.content_markdown, issuer)}>
                        <Download className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="danger"
                        size="sm"
                        onClick={() => window.confirm(`Excluir "${c.title}"?`) && remove.mutate(c.id, { onSuccess: () => toast.success('Contrato excluído') })}
                      >
                        Excluir
                      </Button>
                    </li>
                  ))}
                </ul>
                <Pager {...saved} />
              </>
            )}
          </Card>
        </div>

        <div className="xl:sticky xl:top-20">
          <p className="mb-2 text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">Pré-visualização A4</p>
          <div className="max-h-[calc(100vh-8rem)] overflow-auto rounded-xl border bg-slate-100 p-4 dark:bg-slate-950">
            {/* folha sempre clara: é o documento que vai para impressão */}
            <article className="mx-auto aspect-[210/297] w-full max-w-[794px] bg-white px-[8%] py-[7%] text-[13px] leading-relaxed text-slate-900 shadow-sm">
              <Markdown source={markdown} />
            </article>
          </div>
        </div>
      </div>
    </>
  )
}
