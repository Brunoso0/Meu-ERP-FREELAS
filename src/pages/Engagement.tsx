import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { useFieldArray, useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { ArrowLeft, ArrowRight, CheckCircle2, Copy, ExternalLink, FileQuestion, MessageCircle, Plus, Trash2, UserPlus, Users } from 'lucide-react'
import { StepTrack } from '@/components/EngagementProgress'
import { choosePayment } from '@/components/quotes/PaymentChoice'
import { Badge, Button, Card, EmptyState, Field, Input, Select, Skeleton, Textarea } from '@/components/ui/primitives'
import { useApproveProposal, useInsert, useTable, useUpdate } from '@/hooks/useData'
import { buildContractMarkdown } from '@/lib/contract'
import { contractIsSigned, defaultContractParams, engagementOf, ENGAGEMENT_STEPS, proposalIsSigned } from '@/lib/engagement'
import { contractStatus, projectStatus, quoteStatus } from '@/lib/labels'
import { itemsTotal } from '@/lib/proposal'
import { usePlan } from '@/lib/plan'
import { signatureLink } from '@/lib/proposal-share'
import { cn, formatCurrency, formatDate, formatProposalNumber, formatQuoteNumber, maskCpfCnpj, maskPhone } from '@/lib/utils'
import type { Client, Contract, Proposal } from '@/types/database.types'

function StepCard({ eyebrow, title, description, children }: { eyebrow: string; title: string; description?: string; children: React.ReactNode }) {
  return (
    <Card className="mx-auto mt-8 max-w-3xl p-5 sm:p-7">
      <p className="text-xs font-semibold uppercase tracking-wider text-brand-600 dark:text-brand-400">{eyebrow}</p>
      <h2 className="mt-1 text-xl font-semibold tracking-tight">{title}</h2>
      {description && <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{description}</p>}
      <div className="mt-5">{children}</div>
    </Card>
  )
}

const clientLabel = (c: Pick<Client, 'name' | 'company_name'>) => (c.company_name ? `${c.name} — ${c.company_name}` : c.name)

/* ------------------------------ etapa 1: cliente ------------------------------ */

const clientSchema = z.object({
  name: z.string().trim().min(2, 'Informe o nome'),
  company_name: z.string(),
  phone: z.string().refine((v) => v === '' || v.replace(/\D/g, '').length >= 10, 'Telefone incompleto'),
  email: z.string().email('E-mail inválido').or(z.literal('')),
  document: z.string().refine((v) => [0, 11, 14].includes(v.replace(/\D/g, '').length), 'CPF ou CNPJ incompleto'),
})
type ClientValues = z.infer<typeof clientSchema>

function ClientStep({ clients, onChosen }: { clients: Client[]; onChosen: (id: string) => void }) {
  const insert = useInsert('clients')
  const [mode, setMode] = useState<'existing' | 'new'>(clients.length > 0 ? 'existing' : 'new')
  const [existing, setExisting] = useState('')
  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<ClientValues>({ resolver: zodResolver(clientSchema), defaultValues: { name: '', company_name: '', phone: '', email: '', document: '' } })

  const create = handleSubmit(async (v) => {
    try {
      const created = await insert.mutateAsync({
        name: v.name.trim(),
        company_name: v.company_name.trim() || null,
        phone: v.phone || null,
        email: v.email || null,
        document: v.document || null,
        status: 'active',
      })
      onChosen(created.id)
    } catch {
      // toast de erro já exibido pelo hook
    }
  })

  return (
    <StepCard eyebrow="Etapa 1 de 7" title="Para quem é o trabalho?" description="Escolha um cliente que você já cadastrou ou cadastre um novo agora.">
      <div className="mb-5 inline-flex rounded-lg border p-0.5" role="tablist">
        {([['existing', 'Já é cliente', Users], ['new', 'Cliente novo', UserPlus]] as const).map(([value, label, Icon]) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={mode === value}
            onClick={() => setMode(value)}
            className={cn('flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors', mode === value ? 'bg-brand-50 text-brand-700 dark:bg-brand-600/20 dark:text-brand-400' : 'text-slate-500 hover:text-slate-900 dark:hover:text-slate-100')}
          >
            <Icon className="h-4 w-4" />{label}
          </button>
        ))}
      </div>

      {mode === 'existing' ? (
        <div className="space-y-5">
          <Field label="Cliente">
            <Select value={existing} onChange={(e) => setExisting(e.target.value)}>
              <option value="">Selecione…</option>
              {clients.map((c) => <option key={c.id} value={c.id}>{clientLabel(c)}</option>)}
            </Select>
          </Field>
          <div className="flex justify-end border-t pt-4">
            <Button disabled={!existing} onClick={() => onChosen(existing)}>Continuar <ArrowRight className="h-4 w-4" /></Button>
          </div>
        </div>
      ) : (
        <form onSubmit={create} noValidate className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Nome do contato" error={errors.name?.message}><Input autoFocus {...register('name')} /></Field>
            <Field label="Empresa (opcional)"><Input {...register('company_name')} /></Field>
            <Field label="WhatsApp" error={errors.phone?.message}>
              <Input placeholder="(00) 90000-0000" inputMode="tel" {...register('phone', { onChange: (e) => setValue('phone', maskPhone(e.target.value)) })} />
            </Field>
            <Field label="E-mail" error={errors.email?.message}><Input type="email" {...register('email')} /></Field>
            <Field label="CPF ou CNPJ (vai na proposta e no contrato)" error={errors.document?.message} className="sm:col-span-2">
              <Input inputMode="numeric" {...register('document', { onChange: (e) => setValue('document', maskCpfCnpj(e.target.value)) })} />
            </Field>
          </div>
          <div className="flex justify-end border-t pt-4">
            <Button type="submit" loading={isSubmitting}>Cadastrar e continuar <ArrowRight className="h-4 w-4" /></Button>
          </div>
        </form>
      )}
    </StepCard>
  )
}

/* ------------------------------ etapa 2: proposta ------------------------------ */

const proposalSchema = z.object({
  title: z.string().trim().min(3, 'Informe um título'),
  scope_text: z.string().trim().min(10, 'Descreva o trabalho em pelo menos uma frase'),
  validity_days: z.coerce.number().int('Use dias inteiros').min(1, 'Mínimo de 1 dia'),
  payment_terms: z.string().trim().min(3, 'Informe as condições de pagamento'),
  items: z
    .array(z.object({ description: z.string().trim().min(1, 'Descreva o item'), quantity: z.coerce.number().positive('Inválida'), unit_price: z.coerce.number().min(0, 'Inválido') }))
    .min(1, 'Adicione ao menos um item'),
})
type ProposalValues = z.infer<typeof proposalSchema>

function ProposalStep({ client, onCreated }: { client: Client; onCreated: (id: string) => void }) {
  const insert = useInsert('proposals')
  const {
    register,
    control,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<ProposalValues>({
    resolver: zodResolver(proposalSchema),
    defaultValues: {
      title: `Proposta para ${client.company_name || client.name}`,
      scope_text: '',
      validity_days: 15,
      payment_terms: '50% na aprovação e 50% na entrega, via PIX.',
      items: [{ description: '', quantity: 1, unit_price: 0 }],
    },
  })
  const items = useFieldArray({ control, name: 'items' })
  const total = itemsTotal((watch('items') ?? []).map((i) => ({ description: i.description, quantity: Number(i.quantity) || 0, unit_price: Number(i.unit_price) || 0 })))

  const save = handleSubmit(async (v) => {
    try {
      const cleanItems = v.items.map((i) => ({ description: i.description, quantity: Number(i.quantity), unit_price: Number(i.unit_price) }))
      const created = await insert.mutateAsync({
        client_id: client.id,
        title: v.title,
        scope_text: v.scope_text,
        content: { deliverables: [], schedule: [], items: cleanItems },
        total_amount: itemsTotal(cleanItems),
        validity_days: Number(v.validity_days),
        payment_terms: v.payment_terms,
        status: 'draft',
      })
      toast.success(`Proposta ${formatProposalNumber(created.proposal_number)} criada`)
      onCreated(created.id)
    } catch {
      // toast de erro já exibido pelo hook
    }
  })

  return (
    <StepCard eyebrow="Etapa 2 de 7" title="O que você vai entregar?" description={`Proposta para ${clientLabel(client)}. Dá para refinar depois no gerador de propostas.`}>
      <form onSubmit={save} noValidate className="space-y-4">
        <Field label="Título" error={errors.title?.message}><Input {...register('title')} /></Field>
        <Field label="Escopo do trabalho" error={errors.scope_text?.message}>
          <Textarea rows={4} placeholder="O que será feito, o que está incluso e o que não está." {...register('scope_text')} />
        </Field>

        <div>
          <p className="mb-2 text-sm font-medium">Itens e valores</p>
          <div className="space-y-2">
            {items.fields.map((field, index) => (
              <div key={field.id} className="grid grid-cols-[1fr_72px_112px_auto] items-start gap-2">
                <Field label="" error={errors.items?.[index]?.description?.message}><Input aria-label="Descrição" placeholder="Descrição" {...register(`items.${index}.description`)} /></Field>
                <Field label="" error={errors.items?.[index]?.quantity?.message}><Input aria-label="Quantidade" type="number" step="any" {...register(`items.${index}.quantity`)} /></Field>
                <Field label="" error={errors.items?.[index]?.unit_price?.message}><Input aria-label="Valor unitário" type="number" step="0.01" placeholder="R$" {...register(`items.${index}.unit_price`)} /></Field>
                <Button type="button" variant="ghost" size="icon" aria-label="Remover item" disabled={items.fields.length === 1} onClick={() => items.remove(index)}><Trash2 className="h-4 w-4" /></Button>
              </div>
            ))}
          </div>
          <div className="mt-2 flex items-center justify-between">
            <Button type="button" variant="secondary" size="sm" onClick={() => items.append({ description: '', quantity: 1, unit_price: 0 })}><Plus className="h-3.5 w-3.5" />Item</Button>
            <p className="text-sm">Total <strong className="tabular">{formatCurrency(total)}</strong></p>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-[1fr_140px]">
          <Field label="Condições de pagamento" error={errors.payment_terms?.message}><Input {...register('payment_terms')} /></Field>
          <Field label="Validade (dias)" error={errors.validity_days?.message}><Input type="number" {...register('validity_days')} /></Field>
        </div>

        <div className="flex justify-end border-t pt-4">
          <Button type="submit" loading={isSubmitting}>Criar proposta e continuar <ArrowRight className="h-4 w-4" /></Button>
        </div>
      </form>
    </StepCard>
  )
}

/* ------------------------------ peças das etapas seguintes ------------------------------ */

function LinkBox({ url, message, phone }: { url: string; message: string; phone?: string | null }) {
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url)
      toast.success('Link copiado')
    } catch {
      toast.error('Não foi possível copiar', { description: 'Selecione o link e copie manualmente.' })
    }
  }
  const digits = (phone ?? '').replace(/\D/g, '')
  const whatsapp = `https://wa.me/${digits ? (digits.startsWith('55') ? digits : `55${digits}`) : ''}?text=${encodeURIComponent(`${message} ${url}`)}`
  return (
    <div className="space-y-2 rounded-lg border bg-slate-50 p-3 dark:bg-slate-800/40">
      <input readOnly value={url} onFocus={(e) => e.currentTarget.select()} aria-label="Link de assinatura" className="w-full rounded-md border bg-white px-2 py-1.5 text-xs dark:bg-slate-900" />
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="secondary" onClick={copy}><Copy className="h-3.5 w-3.5" />Copiar link</Button>
        <a href={whatsapp} target="_blank" rel="noreferrer" className="inline-flex h-8 items-center gap-1.5 rounded-lg border px-3 text-xs font-medium hover:bg-slate-100 dark:hover:bg-slate-800">
          <MessageCircle className="h-3.5 w-3.5" />Enviar no WhatsApp
        </a>
      </div>
    </div>
  )
}

function Footer({ onBack, children }: { onBack?: () => void; children?: React.ReactNode }) {
  return (
    <div className="mt-6 flex items-center justify-between gap-2 border-t pt-4">
      {onBack ? <Button variant="ghost" onClick={onBack}><ArrowLeft className="h-4 w-4" />Voltar</Button> : <span />}
      <div className="flex flex-wrap items-center justify-end gap-2">{children}</div>
    </div>
  )
}

/* ------------------------------ etapa 3: assinatura ------------------------------ */

function SignatureStep({ proposal, client, onBack, onNext }: { proposal: Proposal; client?: Client; onBack: () => void; onNext: () => void }) {
  const update = useUpdate('proposals')
  const qc = useQueryClient()
  const canSign = usePlan().has('signature')
  const signed = proposalIsSigned(proposal)
  const awaiting = !signed && proposal.status === 'awaiting_signature' && !!proposal.share_token

  // o cliente assina por fora do sistema: confere de tempos em tempos se já assinou
  useEffect(() => {
    if (!awaiting) return
    const timer = setInterval(() => void qc.invalidateQueries({ queryKey: ['proposals'] }), 15000)
    return () => clearInterval(timer)
  }, [awaiting, qc])

  const generate = async () => {
    try {
      await update.mutateAsync({ id: proposal.id, patch: { share_token: proposal.share_token ?? crypto.randomUUID(), status: 'awaiting_signature' } })
    } catch {
      // toast de erro já exibido pelo hook
    }
  }

  const markSigned = async () => {
    try {
      await update.mutateAsync({
        id: proposal.id,
        patch: { status: 'signed', signed_at: new Date().toISOString(), signature_method: 'manual', signer_name: client?.name ?? null, signer_document: client?.document?.replace(/\D/g, '') || null, signature_image: null },
      })
      toast.success('Proposta marcada como assinada')
    } catch {
      // toast de erro já exibido pelo hook
    }
  }

  return (
    <StepCard eyebrow="Etapa 3 de 7" title="Assinatura da proposta" description={signed ? undefined : 'O cliente abre o link, lê a proposta e assina na tela, sem precisar de conta.'}>
      {signed ? (
        <div className="flex items-start gap-3 rounded-lg bg-emerald-50 p-4 text-sm text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">
          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" />
          <div>
            <p className="font-medium">Proposta assinada</p>
            <p>{proposal.signer_name ? `${proposal.signer_name} · ` : ''}{proposal.signed_at ? formatDate(proposal.signed_at, "dd/MM/yyyy 'às' HH:mm") : ''}{proposal.signature_method === 'manual' ? ' · cópia recebida por fora' : ''}</p>
          </div>
        </div>
      ) : awaiting && proposal.share_token ? (
        <div className="space-y-3">
          <p className="text-sm text-slate-600 dark:text-slate-300">Envie o link para {client?.name ?? 'o cliente'}. Esta tela confere sozinha quando a assinatura chegar.</p>
          <LinkBox url={signatureLink(proposal.share_token)} phone={client?.phone} message={`Olá${client ? `, ${client.name.split(' ')[0]}` : ''}! Segue a proposta "${proposal.title}" para você ler e assinar:`} />
        </div>
      ) : (
        <p className="text-sm text-slate-600 dark:text-slate-300">A proposta <strong>{formatProposalNumber(proposal.proposal_number)}</strong> ({formatCurrency(proposal.total_amount)}) está pronta como rascunho. Gere o link para o cliente assinar.{!canSign && ' A assinatura online é do plano Essencial: com o plano atual, envie o PDF e marque como assinada quando receber.'}</p>
      )}

      <Footer onBack={onBack}>
        <Link to={`/propostas/${proposal.id}`} className="inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-sm font-medium hover:bg-slate-100 dark:hover:bg-slate-800"><ExternalLink className="h-4 w-4" />Ver proposta / PDF</Link>
        {!signed && !awaiting && <Button onClick={generate} loading={update.isPending} disabled={!canSign}>Gerar link de assinatura</Button>}
        {!signed && <Button variant="secondary" onClick={markSigned} loading={update.isPending}>Já recebi assinada por fora</Button>}
        {signed && <Button onClick={onNext}>Continuar <ArrowRight className="h-4 w-4" /></Button>}
      </Footer>
    </StepCard>
  )
}

/* ------------------------------ etapa 4: cobrança ------------------------------ */

function BillingStep({ e, onBack, onNext }: { e: ReturnType<typeof engagementOf>; onBack: () => void; onNext: () => void }) {
  const approve = useApproveProposal()
  const [busy, setBusy] = useState(false)
  const { proposal, quote } = e

  const create = async () => {
    const depositPct = await choosePayment(proposal.title, Number(proposal.total_amount))
    if (depositPct === undefined) return
    setBusy(true)
    await approve(proposal, depositPct)
    setBusy(false)
  }

  return (
    <StepCard eyebrow="Etapa 4 de 7" title="Cobrança" description={quote ? undefined : 'Defina como o cliente vai pagar: valor integral ou entrada e saldo. O orçamento com Pix já entra no financeiro.'}>
      {quote ? (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-4">
            <div>
              <p className="text-sm font-medium">Orçamento {formatQuoteNumber(quote.quote_number)}</p>
              <p className="tabular text-lg font-semibold">{formatCurrency(quote.total_amount)}</p>
            </div>
            <Badge tone={quoteStatus[quote.status].tone}>{quoteStatus[quote.status].label}</Badge>
          </div>
          <p className="text-sm text-slate-500 dark:text-slate-400">O acompanhamento do pagamento fica no financeiro. Você pode seguir sem esperar o Pix.</p>
        </div>
      ) : (
        <p className="text-sm text-slate-600 dark:text-slate-300">Valor da proposta: <strong>{formatCurrency(proposal.total_amount)}</strong></p>
      )}
      <Footer onBack={onBack}>
        {quote && <Link to="/financeiro" className="inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-sm font-medium hover:bg-slate-100 dark:hover:bg-slate-800"><ExternalLink className="h-4 w-4" />Abrir financeiro</Link>}
        {!quote && <Button onClick={create} loading={busy}>Definir cobrança</Button>}
        {quote && <Button onClick={onNext}>Continuar <ArrowRight className="h-4 w-4" /></Button>}
      </Footer>
    </StepCard>
  )
}

/* ------------------------------ etapa 5: contrato ------------------------------ */

function ContractStep({ e, onBack, onNext }: { e: ReturnType<typeof engagementOf>; onBack: () => void; onNext: () => void }) {
  const { proposal, client, contract } = e
  const profile = useTable('profiles').data?.[0]
  const insert = useInsert('contracts')
  const update = useUpdate('contracts')
  const qc = useQueryClient()
  const navigate = useNavigate()
  const canSign = usePlan().has('signature')
  const signed = !!contract && contractIsSigned(contract)
  const awaiting = !!contract && contract.status === 'awaiting_signature' && !!contract.share_token

  useEffect(() => {
    if (!awaiting) return
    const timer = setInterval(() => void qc.invalidateQueries({ queryKey: ['contracts'] }), 15000)
    return () => clearInterval(timer)
  }, [awaiting, qc])

  const generate = async () => {
    try {
      const markdown = buildContractMarkdown(defaultContractParams(`Contrato — ${proposal.title}`, proposal.scope_text ?? ''), proposal, client, profile)
      await insert.mutateAsync({ proposal_id: proposal.id, client_id: proposal.client_id, title: `Contrato — ${proposal.title}`, content_markdown: markdown, status: 'draft' })
      toast.success('Contrato gerado')
    } catch {
      // toast de erro já exibido pelo hook
    }
  }

  const patch = async (c: Contract, changes: Partial<Contract>) => {
    try {
      await update.mutateAsync({ id: c.id, patch: changes })
    } catch {
      // toast de erro já exibido pelo hook
    }
  }

  return (
    <StepCard eyebrow="Etapa 5 de 7" title="Contrato" description={!contract ? 'Gere o contrato com as cláusulas recomendadas, a partir dos dados da proposta e do cliente.' : undefined}>
      {!contract && <p className="text-sm text-slate-600 dark:text-slate-300">Se preferir escolher as cláusulas antes, use o gerador de contratos e volte depois: o atendimento continua daqui.</p>}
      {contract && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-4">
            <p className="text-sm font-medium">{contract.title}</p>
            <Badge tone={contractStatus[contract.status].tone}>{contractStatus[contract.status].label}</Badge>
          </div>
          {awaiting && contract.share_token && (
            <>
              <p className="text-sm text-slate-600 dark:text-slate-300">Envie o link para o cliente assinar. Esta tela confere sozinha quando chegar.</p>
              <LinkBox url={signatureLink(contract.share_token, 'contract')} phone={client?.phone} message={`Olá${client ? `, ${client.name.split(' ')[0]}` : ''}! Segue o contrato para você ler e assinar:`} />
            </>
          )}
          {signed && (
            <div className="flex items-start gap-3 rounded-lg bg-emerald-50 p-4 text-sm text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">
              <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" />
              <p>Contrato assinado{contract.signed_at ? ` em ${formatDate(contract.signed_at)}` : ''}.</p>
            </div>
          )}
        </div>
      )}
      <Footer onBack={onBack}>
        {!contract && <Button variant="secondary" onClick={() => navigate('/ferramentas/contrato', { state: { proposalId: proposal.id } })}>Escolher cláusulas</Button>}
        {!contract && <Button onClick={generate} loading={insert.isPending}>Gerar contrato padrão</Button>}
        {contract && contract.status === 'draft' && (
          <Button onClick={() => patch(contract, { share_token: contract.share_token ?? crypto.randomUUID(), status: 'awaiting_signature' })} loading={update.isPending} disabled={!canSign} title={canSign ? undefined : 'Assinatura online: plano Essencial ou superior'}>Gerar link de assinatura</Button>
        )}
        {contract && !signed && (
          <Button variant="secondary" loading={update.isPending} onClick={() => patch(contract, { status: 'signed', signed_at: new Date().toISOString(), signature_method: 'manual', signer_name: client?.name ?? null })}>
            Já recebi assinado por fora
          </Button>
        )}
        {!signed && <Button variant="ghost" onClick={onNext}>Pular por agora</Button>}
        {signed && <Button onClick={onNext}>Continuar <ArrowRight className="h-4 w-4" /></Button>}
      </Footer>
    </StepCard>
  )
}

/* ------------------------------ etapas 6 e 7: projeto e pronto ------------------------------ */

function ProjectStep({ e, onBack, onNext }: { e: ReturnType<typeof engagementOf>; onBack: () => void; onNext: () => void }) {
  const project = e.project
  return (
    <StepCard eyebrow="Etapa 6 de 7" title="Projeto" description="O projeto nasce junto com a proposta e acompanha o andamento do trabalho.">
      {project ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-4">
          <div>
            <p className="text-sm font-medium">{project.title}</p>
            <p className="text-xs text-slate-500">{project.deadline ? `Prazo: ${formatDate(project.deadline)}` : 'Sem prazo definido'}</p>
          </div>
          <Badge tone={projectStatus[project.status].tone}>{projectStatus[project.status].label}</Badge>
        </div>
      ) : (
        <p className="text-sm text-slate-500">O projeto ainda não foi criado.</p>
      )}
      <Footer onBack={onBack}>
        <Link to="/projetos" className="inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-sm font-medium hover:bg-slate-100 dark:hover:bg-slate-800"><ExternalLink className="h-4 w-4" />Abrir projetos</Link>
        <Button onClick={onNext}>Concluir <ArrowRight className="h-4 w-4" /></Button>
      </Footer>
    </StepCard>
  )
}

function DoneStep({ e, onBack }: { e: ReturnType<typeof engagementOf>; onBack: () => void }) {
  const navigate = useNavigate()
  const rows: { label: string; value: string; to?: string }[] = [
    { label: 'Cliente', value: e.client ? clientLabel(e.client) : '—', to: e.client ? `/clientes/${e.client.id}` : undefined },
    { label: 'Proposta', value: `${formatProposalNumber(e.proposal.proposal_number)} · ${formatCurrency(e.proposal.total_amount)}`, to: `/propostas/${e.proposal.id}` },
    { label: 'Cobrança', value: e.quote ? `${formatQuoteNumber(e.quote.quote_number)} · ${quoteStatus[e.quote.status].label}` : 'Ainda não gerada', to: '/financeiro' },
    { label: 'Contrato', value: e.contract ? contractStatus[e.contract.status].label : 'Não gerado', to: '/ferramentas/contrato' },
    { label: 'Projeto', value: e.project ? e.project.title : '—', to: '/projetos' },
  ]
  return (
    <StepCard eyebrow="Etapa 7 de 7" title="Tudo pronto" description="Esse atendimento chegou ao fim. Está tudo guardado nas telas de cada área.">
      <ul className="divide-y rounded-lg border">
        {rows.map((r) => (
          <li key={r.label} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
            <span className="text-slate-500">{r.label}</span>
            {r.to ? <Link to={r.to} className="truncate font-medium text-brand-600 hover:underline dark:text-brand-400">{r.value}</Link> : <span className="truncate font-medium">{r.value}</span>}
          </li>
        ))}
      </ul>
      <Footer onBack={onBack}>
        <Button variant="secondary" onClick={() => navigate('/acesso-rapido')}>Ir para o acesso rápido</Button>
        <Button onClick={() => navigate('/atendimentos/novo')}>Novo atendimento</Button>
      </Footer>
    </StepCard>
  )
}

/* ------------------------------ a página ------------------------------ */

export default function Engagement() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const proposals = useTable('proposals')
  const clients = useTable('clients')
  const quotes = useTable('quotes')
  const contracts = useTable('contracts')
  const projects = useTable('projects')

  const loading = proposals.isLoading || clients.isLoading || quotes.isLoading || contracts.isLoading || projects.isLoading
  const proposal = id ? proposals.data?.find((p) => p.id === id) : undefined
  const e = useMemo(
    () => (proposal ? engagementOf(proposal, { clients: clients.data ?? [], quotes: quotes.data ?? [], contracts: contracts.data ?? [], projects: projects.data ?? [] }) : null),
    [proposal, clients.data, quotes.data, contracts.data, projects.data],
  )

  // etapa que está na tela: acompanha o avanço do atendimento, e dá para voltar ou pular para a próxima
  const [viewing, setViewing] = useState<number | null>(null)
  const [reach, setReach] = useState(0)
  const current = e?.step ?? 0
  useEffect(() => {
    if (e) setViewing(e.step)
  }, [e?.step]) // eslint-disable-line react-hooks/exhaustive-deps
  const shown = viewing ?? current
  const maxReach = Math.max(current, reach)
  const goTo = (n: number) => {
    setReach((r) => Math.max(r, n))
    setViewing(n)
  }

  if (id && loading) return <Skeleton className="mx-auto mt-8 h-96 w-full max-w-3xl" />
  if (id && !proposal) {
    return (
      <EmptyState
        icon={FileQuestion}
        title="Atendimento não encontrado"
        description="A proposta dele pode ter sido excluída."
        action={<Link to="/atendimentos" className="text-sm font-medium text-brand-600 hover:underline dark:text-brand-400">Ver atendimentos</Link>}
      />
    )
  }

  // antes da proposta: o cliente escolhido fica no endereço para a página poder ser recarregada
  const draftClientId = params.get('cliente')
  const draftClient = !id && draftClientId ? clients.data?.find((c) => c.id === draftClientId) : undefined

  const header = (
    <div className="mx-auto flex max-w-3xl items-center justify-between gap-3">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">{id ? 'Atendimento' : 'Novo atendimento'}</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Do cliente ao projeto, em ordem. O sistema guarda onde você parou.</p>
      </div>
      <Link to="/atendimentos" className="shrink-0 text-sm font-medium text-brand-600 hover:underline dark:text-brand-400">Todos os atendimentos</Link>
    </div>
  )

  if (!e) {
    const step = draftClient ? 1 : 0
    return (
      <div>
        {header}
        <div className="mt-6"><StepTrack done={[!!draftClient, false, false, false, false, false, false]} current={step} viewing={step} onSelect={step === 1 ? () => setParams({}) : undefined} /></div>
        {draftClient ? (
          <ProposalStep client={draftClient} onCreated={(newId) => navigate(`/atendimentos/${newId}`, { replace: true })} />
        ) : (
          <ClientStep clients={clients.data ?? []} onChosen={(clientId) => setParams({ cliente: clientId })} />
        )}
      </div>
    )
  }

  const back = () => goTo(Math.max(0, shown - 1))
  const next = () => goTo(Math.min(6, shown + 1))

  return (
    <div>
      {header}
      <div className="mt-6"><StepTrack done={e.done} current={maxReach} viewing={shown} onSelect={goTo} /></div>
      {shown <= 1 && (
        <StepCard eyebrow={`Etapa ${shown + 1} de 7`} title={shown === 0 ? 'Cliente' : 'Proposta'} description={shown === 0 ? undefined : 'Criada e guardada. Para mudar os detalhes, abra a proposta.'}>
          {shown === 0 ? (
            <p className="text-sm">{e.client ? clientLabel(e.client) : 'Sem cliente'}</p>
          ) : (
            <p className="text-sm"><strong>{formatProposalNumber(e.proposal.proposal_number)}</strong> · {e.proposal.title} · {formatCurrency(e.proposal.total_amount)}</p>
          )}
          <Footer onBack={shown > 0 ? back : undefined}>
            {shown === 1 && <Link to={`/propostas/${e.proposal.id}`} className="inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-sm font-medium hover:bg-slate-100 dark:hover:bg-slate-800"><ExternalLink className="h-4 w-4" />Abrir proposta</Link>}
            <Button onClick={next}>Continuar <ArrowRight className="h-4 w-4" /></Button>
          </Footer>
        </StepCard>
      )}
      {shown === 2 && <SignatureStep proposal={e.proposal} client={e.client} onBack={back} onNext={next} />}
      {shown === 3 && <BillingStep e={e} onBack={back} onNext={next} />}
      {shown === 4 && <ContractStep e={e} onBack={back} onNext={next} />}
      {shown === 5 && <ProjectStep e={e} onBack={back} onNext={next} />}
      {shown === 6 && <DoneStep e={e} onBack={back} />}
      <p className="mt-4 text-center text-xs text-slate-400">{ENGAGEMENT_STEPS[shown]}</p>
    </div>
  )
}
