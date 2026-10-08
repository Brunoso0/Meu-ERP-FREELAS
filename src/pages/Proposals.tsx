import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { Check, Copy, Eye, FileSignature, FileText, Link2, MessageCircle, MoreHorizontal, PenLine, Plus, QrCode, ScrollText, Send, Trash2, X } from 'lucide-react'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { Dropdown, DropdownContent, DropdownItem, DropdownSeparator, DropdownTrigger, Sheet } from '@/components/ui/overlays'
import { Badge, Button, Card, EmptyState, Input, PageHeader } from '@/components/ui/primitives'
import { choosePayment } from '@/components/quotes/PaymentChoice'
import { confirm } from '@/components/ui/confirm'
import { useApproveProposal, useRemove, useTable, useUpdate } from '@/hooks/useData'
import { proposalStatus } from '@/lib/labels'
import { whatsappUrl } from '@/lib/leads'
import { signatureLink } from '@/lib/proposal-share'
import { formatCurrency, formatDate, formatProposalNumber, sum } from '@/lib/utils'
import type { Proposal, ProposalStatus } from '@/types/database.types'

export default function Proposals() {
  const navigate = useNavigate()
  const proposals = useTable('proposals')
  const clients = useTable('clients')
  const update = useUpdate('proposals')
  const remove = useRemove('proposals')
  const approveProposal = useApproveProposal()
  const quotes = useTable('quotes')
  // proposta cujo link de assinatura está aberto no diálogo
  const [sharing, setSharing] = useState<Proposal | null>(null)

  const hasQuote = (p: Proposal) => quotes.data?.some((q) => q.proposal_id === p.id) ?? false

  const clientName = (id: string | null) => {
    const c = clients.data?.find((x) => x.id === id)
    return c ? c.company_name ?? c.name : '—'
  }

  const setStatus = (p: Proposal, status: ProposalStatus) =>
    update.mutate({ id: p.id, patch: { status } }, { onSuccess: () => toast.success(`Proposta marcada como ${proposalStatus[status].label.toLowerCase()}`) })

  /** Aprovar pergunta como o cliente vai pagar e gera o orçamento (se a proposta ainda não tem um). */
  const approve = async (p: Proposal) => {
    const depositPct = hasQuote(p) ? null : await choosePayment(p.title, Number(p.total_amount))
    if (depositPct === undefined) return
    await approveProposal(p, depositPct)
  }

  /** Proposta assinada sem orçamento: pergunta a forma de pagamento e gera, sem mudar o status. */
  const generateQuote = async (p: Proposal) => {
    const depositPct = await choosePayment(p.title, Number(p.total_amount))
    if (depositPct === undefined) return
    await approveProposal(p, depositPct, true)
  }

  /** Gera o link (uma vez) e deixa a proposta aguardando a assinatura do cliente. */
  const sendForSignature = async (p: Proposal) => {
    try {
      const saved = await update.mutateAsync({ id: p.id, patch: { share_token: p.share_token ?? crypto.randomUUID(), status: 'awaiting_signature' } })
      setSharing(saved)
    } catch {
      // toast de erro já exibido pelo hook
    }
  }

  /** O cliente devolveu a proposta assinada por fora (papel, PDF, foto). */
  const markSigned = async (p: Proposal) => {
    const ok = await confirm({
      title: `Marcar a proposta ${formatProposalNumber(p.proposal_number)} como assinada?`,
      description: 'Use quando o cliente devolveu uma cópia assinada por fora do sistema. O link de assinatura, se existir, deixa de aceitar novas assinaturas.',
      confirmLabel: 'Marcar como assinada',
      tone: 'default',
    })
    if (!ok) return
    try {
      const client = clients.data?.find((c) => c.id === p.client_id)
      const saved = await update.mutateAsync({
        id: p.id,
        patch: { status: 'signed', signed_at: new Date().toISOString(), signature_method: 'manual', signer_name: client?.name ?? null, signer_document: client?.document?.replace(/\D/g, '') || null, signature_image: null },
      })
      toast.success('Proposta marcada como assinada')
      if (!hasQuote(saved)) await generateQuote(saved)
    } catch {
      // toast de erro já exibido pelo hook
    }
  }

  const copyLink = async (p: Proposal) => {
    if (!p.share_token) return
    try {
      await navigator.clipboard.writeText(signatureLink(p.share_token))
      toast.success('Link copiado')
    } catch {
      toast.error('Não foi possível copiar', { description: 'Selecione o link e copie manualmente.' })
    }
  }

  const handleDelete = async (p: Proposal) => {
    if (!(await confirm({ title: `Excluir a proposta ${formatProposalNumber(p.proposal_number)}?`, description: `"${p.title}" será apagada. Esta ação não pode ser desfeita.` }))) return
    remove.mutate(p.id, { onSuccess: () => toast.success('Proposta excluída') })
  }

  const columns: Column<Proposal>[] = [
    { header: 'Nº', cell: (p) => <span className="tabular font-medium text-slate-500 dark:text-slate-400">{formatProposalNumber(p.proposal_number)}</span> },
    {
      header: 'Proposta',
      cell: (p) => (
        <div className="min-w-0">
          <Link to={`/propostas/${p.id}`} className="truncate font-medium hover:text-brand-600 dark:hover:text-brand-400">
            {p.title}
          </Link>
          <p className="truncate text-xs text-slate-500 dark:text-slate-400">{clientName(p.client_id)}</p>
        </div>
      ),
    },
    { header: 'Status', cell: (p) => <Badge tone={proposalStatus[p.status].tone}>{proposalStatus[p.status].label}</Badge> },
    { header: 'Criada em', cell: (p) => <span className="tabular text-slate-600 dark:text-slate-300">{formatDate(p.created_at)}</span> },
    { header: 'Valor', className: 'text-right', cell: (p) => <span className="tabular font-medium">{formatCurrency(p.total_amount)}</span> },
    {
      header: '',
      className: 'w-12 text-right',
      cell: (p) => (
        <Dropdown>
          <DropdownTrigger asChild>
            <Button variant="ghost" size="icon" aria-label="Ações" className="h-8 w-8">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownTrigger>
          <DropdownContent>
            <DropdownItem icon={Eye} onSelect={() => navigate(`/propostas/${p.id}`)}>Ver e exportar PDF</DropdownItem>
            <DropdownSeparator />
            {!p.signed_at && p.status !== 'awaiting_signature' && p.status !== 'approved' && (
              <DropdownItem icon={PenLine} onSelect={() => sendForSignature(p)}>Enviar para assinatura</DropdownItem>
            )}
            {p.share_token && (p.status === 'awaiting_signature' || p.signature_method === 'link') && (
              <DropdownItem icon={Link2} onSelect={() => setSharing(p)}>Link de assinatura</DropdownItem>
            )}
            {!p.signed_at && <DropdownItem icon={FileSignature} onSelect={() => markSigned(p)}>Marcar como assinada</DropdownItem>}
            {p.status === 'signed' && !hasQuote(p) && <DropdownItem icon={QrCode} onSelect={() => generateQuote(p)}>Gerar orçamento</DropdownItem>}
            <DropdownSeparator />
            {p.status !== 'sent' && !p.signed_at && <DropdownItem icon={Send} onSelect={() => setStatus(p, 'sent')}>Marcar como enviada</DropdownItem>}
            {p.status !== 'approved' && <DropdownItem icon={Check} onSelect={() => approve(p)}>Marcar como aprovada</DropdownItem>}
            {p.status !== 'rejected' && <DropdownItem icon={X} onSelect={() => setStatus(p, 'rejected')}>Marcar como recusada</DropdownItem>}
            {(p.status === 'approved' || p.status === 'signed') && (
              <DropdownItem icon={ScrollText} onSelect={() => navigate('/ferramentas/contrato', { state: { proposalId: p.id } })}>
                Gerar contrato
              </DropdownItem>
            )}
            <DropdownSeparator />
            <DropdownItem icon={Trash2} danger onSelect={() => handleDelete(p)}>Excluir</DropdownItem>
          </DropdownContent>
        </Dropdown>
      ),
    },
  ]

  const action = (
    <Button onClick={() => navigate('/ferramentas/proposta')}>
      <Plus className="h-4 w-4" /> Nova proposta
    </Button>
  )

  const open = (proposals.data ?? []).filter((p) => p.status === 'sent' || p.status === 'draft' || p.status === 'awaiting_signature')

  // dados sempre atuais da proposta do diálogo (o status muda quando o cliente assina)
  const shared = sharing ? proposals.data?.find((p) => p.id === sharing.id) ?? sharing : null
  const sharedLink = shared?.share_token ? signatureLink(shared.share_token) : ''
  const sharedClient = clients.data?.find((c) => c.id === shared?.client_id)
  const sharedWhatsapp = shared
    ? whatsappUrl(sharedClient?.phone ?? null, `Olá${sharedClient?.name ? `, ${sharedClient.name.split(' ')[0]}` : ''}! Segue a proposta ${formatProposalNumber(shared.proposal_number)} (${shared.title}) para leitura e assinatura: ${sharedLink}`)
    : null

  return (
    <>
      <PageHeader
        title="Propostas comerciais"
        description={`${open.length} em aberto somando ${formatCurrency(sum(open.map((p) => p.total_amount)))}`}
        actions={action}
      />
      <Card>
        <DataTable
          columns={columns}
          rows={proposals.data}
          loading={proposals.isLoading}
          empty={
            <EmptyState
              icon={FileText}
              title="Nenhuma proposta ainda"
              description="Monte a primeira proposta no gerador: escopo, entregáveis, cronograma e preços em um PDF pronto para enviar."
              action={action}
            />
          }
        />
      </Card>

      <Sheet
        open={sharing !== null}
        onClose={() => setSharing(null)}
        variant="modal"
        title="Link de assinatura"
        description={shared ? `Proposta ${formatProposalNumber(shared.proposal_number)} · ${shared.title}` : undefined}
      >
        {shared && (
          <div className="space-y-4 px-5 py-5">
            <div className="flex items-center gap-2">
              <Badge tone={proposalStatus[shared.status].tone}>{proposalStatus[shared.status].label}</Badge>
              <span className="text-xs text-slate-500 dark:text-slate-400">
                {shared.signed_at ? `Assinada em ${formatDate(shared.signed_at)}` : 'O cliente abre o link, lê a proposta e assina na própria página, sem precisar de cadastro.'}
              </span>
            </div>
            <div className="flex gap-2">
              <Input readOnly value={sharedLink} aria-label="Link de assinatura" onFocus={(e) => e.target.select()} className="tabular text-xs" />
              <Button variant="secondary" onClick={() => copyLink(shared)} className="shrink-0">
                <Copy className="h-4 w-4" /> Copiar
              </Button>
            </div>
            <div className="flex flex-wrap gap-2">
              {sharedWhatsapp ? (
                <a
                  href={sharedWhatsapp}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex h-9 items-center gap-2 rounded-lg border px-3 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-800"
                >
                  <MessageCircle className="h-4 w-4" /> Enviar pelo WhatsApp
                </a>
              ) : (
                <span className="text-xs text-slate-500 dark:text-slate-400">Cadastre o WhatsApp do cliente para enviar o link direto por lá.</span>
              )}
              <a
                href={sharedLink}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-9 items-center gap-2 rounded-lg px-3 text-sm font-medium text-brand-600 hover:underline dark:text-brand-400"
              >
                <Eye className="h-4 w-4" /> Ver como o cliente
              </a>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Quem tiver este link consegue ler a proposta. Envie só para o cliente. Marcar a proposta como recusada ou voltar para rascunho desativa o link.
            </p>
          </div>
        )}
      </Sheet>
    </>
  )
}
