import { useEffect, useMemo, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { ArrowLeft, ArrowRight, Eye, FileCheck2, FileX2, Pencil, ReceiptText, RefreshCw, TriangleAlert, X } from 'lucide-react'
import { useBillingConnection } from '@/components/billing/GatewayConnection'
import { InvoicePreview } from '@/components/billing/InvoicePreview'
import { ServiceCodeSearch } from '@/components/billing/ServiceCodeSearch'
import { confirm } from '@/components/ui/confirm'
import { Pager, usePagination } from '@/components/ui/Pagination'
import { Badge, Button, Card, EmptyState, Field, Input, PageHeader, Select, Textarea } from '@/components/ui/primitives'
import { useTable, useUpdate } from '@/hooks/useData'
import { cancelInvoice, getFiscalInfo, issueInvoice, refreshInvoice, usesGateway, type FiscalInfo } from '@/lib/billing'
import { resolveProofUrl } from '@/lib/db'
import { canIssueInvoice, invoiceReference, invoiceTotals, nfseRegimes, nfseStatus } from '@/lib/nfse'
import { cn, formatCurrency, formatDate, isoDay } from '@/lib/utils'
import { useUI } from '@/store/ui'
import type { FinancialTransaction, NfseRegime, NfseService, NfseTaxes } from '@/types/database.types'

/** As etapas do Emissor Nacional da NFS-e, na mesma ordem. */
const steps = ['Pessoas', 'Serviço', 'Valores', 'Emitir NFS-e'] as const

const places: Record<NonNullable<FiscalInfo['serviceProvisionCityDefaultType']>, string> = {
  MY_ACCOUNT_CITY: 'Município do prestador (o da sua conta)',
  CUSTOMER_CITY: 'Município do tomador',
  CUSTOMER_CITY_WHEN_ISS_IS_RETAINED: 'Município do prestador (o do tomador quando o ISS é retido)',
}

/** Código nacional de 6 dígitos no formato do Emissor (01.07.01). */
const formatCode = (code: string) => (/^\d{6}$/.test(code) ? code.replace(/(\d{2})(\d{2})(\d{2})/, '$1.$2.$3') : code)

/**
 * Gerador de notas fiscais. Segue as etapas do Emissor Nacional (Pessoas,
 * Serviço, Valores, Emitir) a partir de um recebimento pago (orçamento
 * integral, entrada ou saldo, ou qualquer outra entrada) e emite pelo Asaas,
 * com o regime tributário da empresa: MEI, Simples Nacional ou fora dele.
 */
export default function InvoiceGenerator() {
  const profile = useTable('profiles').data?.[0]
  const clients = useTable('clients').data ?? []
  const quotes = useTable('quotes').data ?? []
  const transactions = useTable('financial_transactions')
  const updateProfile = useUpdate('profiles')
  const connection = useBillingConnection()
  const openModal = useUI((s) => s.openModal)
  const qc = useQueryClient()
  const preselected = (useLocation().state as { transactionId?: string } | null)?.transactionId

  const services = profile?.nfse_services ?? []
  const all = transactions.data ?? []
  const gateway = usesGateway(profile)
  const connected = gateway && !!connection.data
  const fiscal = useQuery({ queryKey: ['fiscal-info'], queryFn: getFiscalInfo, enabled: connected, staleTime: 5 * 60_000, retry: false })

  const [step, setStep] = useState(0)
  const [txId, setTxId] = useState(preselected ?? '')
  const [primaryId, setPrimaryId] = useState('')
  const [extras, setExtras] = useState<string[]>([])
  const [details, setDetails] = useState('')
  const [withReference, setWithReference] = useState(true)
  const [customText, setCustomText] = useState<string | null>(null)
  const [regime, setRegime] = useState<NfseRegime>('mei')
  const [taxes, setTaxes] = useState<NfseTaxes>({})
  const [deductions, setDeductions] = useState(0)
  const [observations, setObservations] = useState('')
  const [sending, setSending] = useState(false)

  // recebimentos pagos que ainda podem ganhar nota, do mais recente para o mais antigo
  const candidates = useMemo(
    () => all.filter(canIssueInvoice).sort((a, b) => (b.payment_date ?? b.due_date).localeCompare(a.payment_date ?? a.due_date)),
    [all],
  )
  const issued = useMemo(
    () => all.filter((t) => t.nfse_id).sort((a, b) => (b.nfse_synced_at ?? '').localeCompare(a.nfse_synced_at ?? '')),
    [all],
  )
  const issuedPage = usePagination(issued, 8)

  const tx = all.find((t) => t.id === txId)
  const client = clients.find((c) => c.id === tx?.client_id)
  const primary = services.find((s) => s.id === primaryId)
  const reference = tx ? invoiceReference(tx, quotes) : ''
  const value = Number(tx?.amount ?? 0)

  useEffect(() => {
    if (!primaryId && services.length) setPrimaryId((services.find((s) => s.code) ?? services[0]).id)
  }, [services, primaryId])
  // regime, alíquotas e observações da última nota
  useEffect(() => {
    if (!profile) return
    setRegime(profile.nfse_regime ?? 'mei')
    setTaxes(profile.nfse_taxes ?? {})
    setObservations(profile.nfse_observations ?? '')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.id])

  // descrição montada a partir das opções; vira texto livre quando você edita
  const builtText = [
    primary?.description,
    ...services.filter((s) => s.id !== primaryId && extras.includes(s.id)).map((s) => s.description),
    details.trim(),
    withReference && reference ? `Referente ao ${reference}.` : '',
  ]
    .filter((p) => p && p.trim())
    .join('\n')
  const description = customText ?? builtText
  const totals = invoiceTotals(value, regime, taxes, deductions)

  const optionLabel = (t: FinancialTransaction) => {
    const c = clients.find((x) => x.id === t.client_id)
    const who = c ? c.company_name || c.name : 'sem cliente'
    const what = invoiceReference(t, quotes) || t.description || t.category || 'Recebimento'
    return `${what} · ${who} · ${formatCurrency(t.amount)} · pago em ${formatDate(t.payment_date)}`
  }

  // o regime impresso na nota vem da configuração fiscal do Asaas: os dois precisam bater
  const asaasSimples = fiscal.data?.configured ? fiscal.data.simplesNacional : null
  const regimeMismatch =
    asaasSimples === false && regime !== 'normal'
      ? 'No Asaas, a empresa está como não optante pelo Simples Nacional, mas aqui o regime é do Simples. Escolha "Fora do Simples" em Valores ou corrija a configuração fiscal no Asaas.'
      : asaasSimples === true && regime === 'normal'
        ? 'No Asaas, a empresa está como optante pelo Simples Nacional, mas aqui o regime é "Fora do Simples". Escolha o regime certo em Valores ou corrija a configuração fiscal no Asaas.'
        : null

  const stepProblems: string[][] = [
    [
      !gateway && 'A forma de cobrança do perfil não é o Asaas.',
      gateway && !connection.isLoading && !connection.data && 'A conta do Asaas não está conectada.',
      fiscal.data && !fiscal.data.configured && 'As notas fiscais ainda não estão configuradas no Asaas.',
      !tx && 'Escolha o recebimento pago.',
      tx && !client && 'O recebimento não tem cliente (tomador).',
      client && ![11, 14].includes((client.document ?? '').replace(/\D/g, '').length) && 'O tomador está sem CPF/CNPJ.',
    ],
    [
      !primary && 'Cadastre os serviços no catálogo.',
      primary && !primary.code && 'Falta o código de tributação nacional do serviço.',
      description.trim().length < 10 && 'A descrição do serviço está vazia.',
    ],
    [
      regimeMismatch,
      regime !== 'mei' && !(Number(taxes.iss) > 0) && 'Informe a alíquota do ISS.',
      regime !== 'mei' && deductions >= value && value > 0 && 'As deduções precisam ser menores que o valor do serviço.',
    ],
    [],
  ].map((list) => list.filter(Boolean) as string[])
  const problems = stepProblems.flat()

  const toggleExtra = (id: string) => setExtras((list) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]))
  const editCatalog = () => profile && openModal({ type: 'profile', record: profile })
  const setTax = (patch: NfseTaxes) => setTaxes((t) => ({ ...t, ...patch }))

  // o código escolhido na busca fica salvo no catálogo, para as próximas notas
  const saveService = (patch: Partial<NfseService>) => {
    if (!profile || !primary) return
    updateProfile.mutate({ id: profile.id, patch: { nfse_services: services.map((s) => (s.id === primary.id ? { ...s, ...patch } : s)) } })
  }

  const emit = async () => {
    if (!tx || !primary || problems.length) return
    const ok = await confirm({
      title: `Emitir a nota de ${formatCurrency(value)}?`,
      description: `Para ${client?.company_name || client?.name}, código ${formatCode(primary.code)}, ${nfseRegimes[regime].label}. A nota é emitida no Portal Nacional pelo Asaas e enviada ao cliente. Depois de autorizada, só dá para corrigir cancelando.`,
      confirmLabel: 'Emitir nota fiscal',
      tone: 'default',
    })
    if (!ok) return
    setSending(true)
    try {
      const { transaction: saved } = await issueInvoice({
        transactionId: tx.id,
        serviceName: primary.label,
        serviceCode: primary.code,
        nbsCode: primary.nbs || undefined,
        serviceDescription: description.trim(),
        observations: observations.trim(),
        regime,
        deductions: regime === 'mei' ? 0 : deductions,
        taxes: regime === 'mei' ? {} : taxes,
      })
      if (profile && (profile.nfse_regime !== regime || JSON.stringify(profile.nfse_taxes ?? {}) !== JSON.stringify(taxes))) {
        updateProfile.mutate({ id: profile.id, patch: { nfse_regime: regime, nfse_taxes: taxes } })
      }
      await qc.invalidateQueries({ queryKey: ['financial_transactions'] })
      if (saved.nfse_status === 'AUTHORIZED') toast.success(`Nota fiscal emitida${saved.nfse_number ? ` · nº ${saved.nfse_number}` : ''}`, { description: 'O PDF também fica no campo "Nota fiscal" do lançamento.' })
      else if (saved.nfse_status === 'ERROR') toast.error('A nota foi recusada', { description: saved.nfse_error ?? undefined, duration: 15000 })
      else toast.success('Nota enviada para emissão', { description: 'Quando for autorizada, ela aparece como emitida na lista.' })
      setTxId('')
      setExtras([])
      setDetails('')
      setCustomText(null)
      setDeductions(0)
      setStep(0)
    } catch (error) {
      toast.error('Não foi possível emitir a nota', { description: error instanceof Error ? error.message : undefined })
    } finally {
      setSending(false)
    }
  }

  const act = async (label: string, run: () => Promise<unknown>, done: string) => {
    const id = toast.loading(label)
    try {
      await run()
      await qc.invalidateQueries({ queryKey: ['financial_transactions'] })
      toast.success(done, { id })
    } catch (error) {
      toast.error('Não deu certo', { id, description: error instanceof Error ? error.message : undefined })
    }
  }

  const cancelNfse = async (t: FinancialTransaction) => {
    const ok = await confirm({
      title: `Cancelar a nota fiscal${t.nfse_number ? ` nº ${t.nfse_number}` : ''}?`,
      description: 'O pedido de cancelamento vai para o Portal Nacional da NFS-e, que pode recusar (por exemplo, fora do prazo). O recebimento continua pago e poderá ganhar outra nota.',
      confirmLabel: 'Cancelar nota',
      cancelLabel: 'Voltar',
    })
    if (ok) act('Pedindo o cancelamento…', () => cancelInvoice(t.id), 'Cancelamento solicitado')
  }

  const viewPdf = async (path: string | null | undefined) => {
    if (!path) return
    const url = await resolveProofUrl(path)
    if (url.startsWith('data:')) {
      const win = window.open('')
      win?.document.write(`<iframe src="${url}" style="border:0;position:fixed;inset:0;width:100%;height:100%"></iframe>`)
    } else window.open(url, '_blank', 'noopener')
  }

  const muted = 'text-xs text-slate-500 dark:text-slate-400'
  const info = (label: string, content: React.ReactNode, className?: string) => (
    <div className={className}>
      <p className={muted}>{label}</p>
      <div className="text-sm font-medium">{content}</div>
    </div>
  )
  const rateField = (key: keyof Omit<NfseTaxes, 'retainIss'>, label: string, max: number) => (
    <Field label={label}>
      <Input type="number" inputMode="decimal" min={0} max={max} step="0.01" value={taxes[key] ?? ''} onChange={(e) => setTax({ [key]: e.target.value === '' ? undefined : Number(e.target.value) })} />
    </Field>
  )

  return (
    <>
      <PageHeader title="Gerador de notas fiscais" description="NFS-e a partir de um recebimento pago, nas mesmas etapas do Emissor Nacional, emitida pelo Asaas." />

      {(!gateway || (!connection.isLoading && !connection.data)) && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-200">
          <span>A emissão é feita pelo Asaas. Escolha o Asaas como forma de cobrança e conecte a conta em Minha empresa.</span>
          <Button variant="secondary" size="sm" onClick={editCatalog}>
            Abrir Minha empresa
          </Button>
        </div>
      )}

      <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-[minmax(0,500px)_1fr]">
        <div className="space-y-4">
          <Card className="overflow-hidden">
            <nav aria-label="Etapas da nota" className="grid grid-cols-4 border-b">
              {steps.map((name, i) => (
                <button
                  key={name}
                  type="button"
                  onClick={() => setStep(i)}
                  aria-current={step === i ? 'step' : undefined}
                  className={cn(
                    'relative px-1 py-3 text-center text-xs font-medium transition-colors sm:text-sm',
                    step === i ? 'text-brand-700 dark:text-brand-400' : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200',
                  )}
                >
                  <span className={cn('mr-1 hidden tabular sm:inline', stepProblems[i].length && i < step ? 'text-amber-600' : '')}>{i + 1}.</span>
                  {name}
                  {step === i && <span className="absolute inset-x-2 bottom-0 h-0.5 rounded bg-brand-600" />}
                </button>
              ))}
            </nav>

            <div className="space-y-4 p-5">
              {step === 0 && (
                <>
                  <Field label="Recebimento pago">
                    <Select value={txId} onChange={(e) => setTxId(e.target.value)}>
                      <option value="">Selecione…</option>
                      {candidates.map((t) => (
                        <option key={t.id} value={t.id}>
                          {optionLabel(t)}
                        </option>
                      ))}
                    </Select>
                    <span className={cn('mt-1 block', muted)}>Orçamentos pagos aparecem por parte: integral, entrada e saldo, cada um com a sua nota. Só entram recebimentos já pagos e ainda sem nota.</span>
                  </Field>
                  {info('Data de competência', `${formatDate(isoDay(new Date()))} (o Asaas emite com a data de hoje)`)}

                  <section className="space-y-3 rounded-lg border p-3">
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">Emitente</h3>
                    <div className="grid grid-cols-2 gap-3">
                      {info('Nome / razão social', profile?.company_name || profile?.full_name || '—', 'col-span-2')}
                      {info('CNPJ', profile?.document || '—')}
                      {info('Inscrição municipal', fiscal.data?.municipalInscription || '—')}
                      {info(
                        'Simples Nacional (no Asaas)',
                        fiscal.isLoading ? 'consultando…' : asaasSimples === true ? 'Optante' : asaasSimples === false ? 'Não optante' : '—',
                        'col-span-2',
                      )}
                    </div>
                  </section>

                  <section className="space-y-3 rounded-lg border p-3">
                    <div className="flex items-center justify-between">
                      <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">Tomador</h3>
                      {client && (
                        <Button variant="ghost" size="sm" onClick={() => openModal({ type: 'client', record: client })}>
                          <Pencil className="h-3.5 w-3.5" /> Editar
                        </Button>
                      )}
                    </div>
                    {client ? (
                      <div className="grid grid-cols-2 gap-3">
                        {info('Nome / razão social', client.company_name || client.name, 'col-span-2')}
                        {info('CPF / CNPJ', client.document || <span className="text-red-600 dark:text-red-400">sem documento</span>)}
                        {info('E-mail', client.email || '—')}
                      </div>
                    ) : (
                      <p className={muted}>Escolha o recebimento para preencher o tomador.</p>
                    )}
                  </section>
                </>
              )}

              {step === 1 && (
                <>
                  {info('Local da prestação', fiscal.data?.serviceProvisionCityDefaultType ? places[fiscal.data.serviceProvisionCityDefaultType] : 'Como estiver nas configurações fiscais do Asaas')}
                  {services.length === 0 ? (
                    <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-200">
                      <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
                      <span>Cadastre os serviços que você presta (um por CNAE) em Minha empresa → Nota fiscal.</span>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-end gap-2">
                        <Field label="Serviço prestado" className="flex-1">
                          <Select value={primaryId} onChange={(e) => setPrimaryId(e.target.value)}>
                            {services.map((s) => (
                              <option key={s.id} value={s.id}>
                                {s.label}
                                {s.cnae ? ` · CNAE ${s.cnae}` : ''}
                              </option>
                            ))}
                          </Select>
                        </Field>
                        <Button variant="ghost" size="sm" className="mb-0.5" onClick={editCatalog}>
                          Catálogo
                        </Button>
                      </div>

                      <div className="space-y-2">
                        <p className="text-xs font-medium text-slate-600 dark:text-slate-400">Código de tributação nacional</p>
                        {primary?.code ? (
                          <div className="flex items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2 text-sm dark:bg-slate-800/50">
                            <span className="tabular font-semibold">{formatCode(primary.code)}</span>
                            <Button variant="ghost" size="sm" onClick={() => saveService({ code: '' })}>
                              Trocar
                            </Button>
                          </div>
                        ) : (
                          <ServiceCodeSearch onPick={(item) => saveService({ code: item.code })} />
                        )}
                      </div>

                      <div className="space-y-2">
                        <p className="text-xs font-medium text-slate-600 dark:text-slate-400">Código NBS (só se a prefeitura exigir)</p>
                        {primary?.nbs ? (
                          <div className="flex items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2 text-sm dark:bg-slate-800/50">
                            <span className="tabular font-semibold">{primary.nbs}</span>
                            <Button variant="ghost" size="icon" aria-label="Tirar o NBS" className="h-7 w-7" onClick={() => saveService({ nbs: '' })}>
                              <X className="h-4 w-4" />
                            </Button>
                          </div>
                        ) : (
                          <ServiceCodeSearch kind="nbs" onPick={(item) => saveService({ nbs: item.code })} />
                        )}
                      </div>

                      {customText === null ? (
                        <>
                          {services.length > 1 && (
                            <div className="space-y-2">
                              <p className="text-xs font-medium text-slate-600 dark:text-slate-400">Também prestados neste trabalho</p>
                              {services
                                .filter((s) => s.id !== primaryId)
                                .map((s) => (
                                  <label key={s.id} className="flex cursor-pointer items-start gap-2.5 text-sm">
                                    <input type="checkbox" checked={extras.includes(s.id)} onChange={() => toggleExtra(s.id)} className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300 accent-brand-600" />
                                    {s.label}
                                  </label>
                                ))}
                            </div>
                          )}
                          <Field label="Detalhamento (opcional)">
                            <Textarea rows={3} value={details} onChange={(e) => setDetails(e.target.value)} maxLength={800} placeholder="Ex.: formatação de dois computadores, configuração da impressora de rede e treinamento da equipe no sistema de vendas." />
                          </Field>
                          {reference && (
                            <label className="flex cursor-pointer items-start gap-2.5 text-sm">
                              <input type="checkbox" checked={withReference} onChange={(e) => setWithReference(e.target.checked)} className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300 accent-brand-600" />
                              Citar a referência ({reference})
                            </label>
                          )}
                          <Button variant="secondary" size="sm" onClick={() => setCustomText(builtText)}>
                            <Pencil className="h-3.5 w-3.5" /> Editar a descrição à mão
                          </Button>
                        </>
                      ) : (
                        <Field label="Descrição do serviço">
                          <Textarea rows={6} value={customText} onChange={(e) => setCustomText(e.target.value)} maxLength={2000} />
                          <button type="button" onClick={() => setCustomText(null)} className="mt-1 text-xs font-medium text-brand-700 hover:underline dark:text-brand-400">
                            Voltar a montar pelas opções
                          </button>
                        </Field>
                      )}
                    </>
                  )}
                </>
              )}

              {step === 2 && (
                <>
                  {info('Valor do serviço', <span className="tabular text-base">{formatCurrency(value)}</span>)}
                  <Field label="Regime tributário">
                    <Select value={regime} onChange={(e) => setRegime(e.target.value as NfseRegime)}>
                      {(Object.keys(nfseRegimes) as NfseRegime[]).map((r) => (
                        <option key={r} value={r}>
                          {nfseRegimes[r].label}
                        </option>
                      ))}
                    </Select>
                    <span className={cn('mt-1 block', muted)}>{nfseRegimes[regime].hint}</span>
                  </Field>
                  {regimeMismatch && (
                    <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-200">
                      <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
                      <span>{regimeMismatch}</span>
                    </div>
                  )}

                  {regime !== 'mei' && (
                    <>
                      <div className="grid grid-cols-2 gap-3">
                        <Field label="Deduções (R$)">
                          <Input type="number" inputMode="decimal" min={0} step="0.01" value={deductions || ''} onChange={(e) => setDeductions(Math.max(0, Number(e.target.value) || 0))} />
                        </Field>
                        {rateField('iss', 'Alíquota do ISS (%)', 5)}
                      </div>
                      <label className="flex cursor-pointer items-start gap-2.5 text-sm">
                        <input type="checkbox" checked={!!taxes.retainIss} onChange={(e) => setTax({ retainIss: e.target.checked })} className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300 accent-brand-600" />
                        ISS retido pelo tomador
                      </label>
                    </>
                  )}
                  {regime === 'normal' && (
                    <div className="space-y-2">
                      <p className="text-xs font-medium text-slate-600 dark:text-slate-400">Retenções federais (deixe 0 quando o tomador não retém, como pessoa física)</p>
                      <div className="grid grid-cols-3 gap-3">
                        {rateField('ir', 'IR (%)', 30)}
                        {rateField('pis', 'PIS (%)', 30)}
                        {rateField('cofins', 'COFINS (%)', 30)}
                        {rateField('csll', 'CSLL (%)', 30)}
                        {rateField('inss', 'INSS (%)', 30)}
                      </div>
                    </div>
                  )}

                  <dl className="space-y-1 rounded-lg bg-slate-50 p-3 text-sm dark:bg-slate-800/50">
                    {regime !== 'mei' && (
                      <div className="flex justify-between">
                        <dt className={muted}>ISS{taxes.retainIss ? ' (retido)' : ''}</dt>
                        <dd className="tabular">{formatCurrency(totals.iss)}</dd>
                      </div>
                    )}
                    <div className="flex justify-between">
                      <dt className={muted}>Retenções</dt>
                      <dd className="tabular">{formatCurrency(totals.retentions)}</dd>
                    </div>
                    <div className="flex justify-between border-t pt-1 font-semibold">
                      <dt>Valor líquido</dt>
                      <dd className="tabular">{formatCurrency(totals.net)}</dd>
                    </div>
                  </dl>
                </>
              )}

              {step === 3 && (
                <>
                  <Field label="Informações complementares (opcional)">
                    <Textarea rows={2} value={observations} onChange={(e) => setObservations(e.target.value)} maxLength={1000} />
                  </Field>
                  {problems.length > 0 ? (
                    <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-200">
                      <p className="mb-1.5 text-xs font-semibold">Para emitir, falta:</p>
                      <ul className="space-y-1 text-xs">
                        {stepProblems.flatMap((list, i) =>
                          list.map((p) => (
                            <li key={p}>
                              <button type="button" onClick={() => setStep(i)} className="text-left hover:underline">
                                <strong>{steps[i]}:</strong> {p}
                              </button>
                            </li>
                          )),
                        )}
                      </ul>
                    </div>
                  ) : (
                    <p className={muted}>Confira a nota na pré-visualização. Ao emitir, ela vai para o Portal Nacional pelo Asaas, e o cliente recebe por e-mail.</p>
                  )}
                  <Button className="w-full" onClick={emit} loading={sending} disabled={problems.length > 0}>
                    <FileCheck2 className="h-4 w-4" /> Emitir nota fiscal
                  </Button>
                </>
              )}

              {step < 3 && (
                <div className="flex items-center justify-between border-t pt-4">
                  <Button variant="ghost" size="sm" onClick={() => setStep(step - 1)} disabled={step === 0}>
                    <ArrowLeft className="h-4 w-4" /> Voltar
                  </Button>
                  <div className="flex items-center gap-3">
                    {stepProblems[step].length > 0 && stepProblems[step][0] !== regimeMismatch && <span className="hidden text-xs text-amber-600 sm:inline dark:text-amber-400">{stepProblems[step][0]}</span>}
                    <Button size="sm" onClick={() => setStep(step + 1)}>
                      Avançar <ArrowRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </Card>

          <Card>
            <h2 className="border-b px-5 py-3.5 text-sm font-semibold">Notas emitidas</h2>
            {issued.length === 0 ? (
              <EmptyState icon={ReceiptText} title="Nenhuma nota ainda" description="As notas emitidas por aqui aparecem nesta lista." className="py-10" />
            ) : (
              <>
                <ul>
                  {issuedPage.visible.map((t) => {
                    const c = clients.find((x) => x.id === t.client_id)
                    const s = nfseStatus[t.nfse_status ?? ''] ?? { label: t.nfse_status ?? '—', tone: 'slate' as const }
                    return (
                      <li key={t.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b px-5 py-3 last:border-0">
                        <div className="min-w-0 flex-1 basis-full sm:basis-0">
                          <p className="truncate text-sm font-medium">
                            {t.nfse_number ? `NF nº ${t.nfse_number}` : 'NF sem número'} · {c ? c.company_name || c.name : '—'}
                          </p>
                          <p className="tabular truncate text-xs text-slate-500 dark:text-slate-400" title={t.nfse_error ?? undefined}>
                            {formatCurrency(t.amount)} · {t.nfse_service ?? 'serviço'} · {formatDate(t.nfse_synced_at ?? isoDay(new Date()))}
                            {t.nfse_error ? ` · ${t.nfse_error}` : ''}
                          </p>
                        </div>
                        <Badge tone={s.tone}>{s.label}</Badge>
                        {t.nfse_status === 'AUTHORIZED' && t.invoice_url && (
                          <Button variant="ghost" size="icon" aria-label="Ver PDF da nota" className="h-8 w-8" onClick={() => viewPdf(t.invoice_url)}>
                            <Eye className="h-4 w-4" />
                          </Button>
                        )}
                        <Button variant="ghost" size="icon" aria-label="Atualizar situação da nota" className="h-8 w-8" onClick={() => act('Consultando o Asaas…', () => refreshInvoice(t.id), 'Situação atualizada')}>
                          <RefreshCw className="h-4 w-4" />
                        </Button>
                        {t.nfse_status === 'AUTHORIZED' && (
                          <Button variant="ghost" size="icon" aria-label="Cancelar nota" className="h-8 w-8 text-red-600 hover:bg-red-50 dark:text-red-400" onClick={() => cancelNfse(t)}>
                            <FileX2 className="h-4 w-4" />
                          </Button>
                        )}
                      </li>
                    )
                  })}
                </ul>
                <Pager {...issuedPage} />
              </>
            )}
          </Card>
        </div>

        <div className="xl:sticky xl:top-20">
          <p className="mb-2 text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">Pré-visualização</p>
          <div className="max-h-[calc(100vh-8rem)] overflow-auto rounded-xl border bg-slate-100 p-4 dark:bg-slate-950">
            <InvoicePreview
              data={{
                number: null,
                status: 'draft',
                issuer: { name: profile?.company_name || profile?.full_name || '', document: profile?.document ?? '', email: profile?.email ?? '', phone: profile?.phone ?? '' },
                customer: client ? { name: client.company_name ? `${client.company_name} (${client.name})` : client.name, document: client.document ?? '', email: client.email ?? '' } : null,
                service: primary ? { label: primary.label, code: formatCode(primary.code), cnae: primary.cnae, nbs: primary.nbs } : null,
                place: fiscal.data?.serviceProvisionCityDefaultType ? places[fiscal.data.serviceProvisionCityDefaultType] : undefined,
                description,
                value,
                date: isoDay(new Date()),
                observations,
                regime,
                taxes,
                deductions,
              }}
            />
          </div>
        </div>
      </div>
    </>
  )
}
