import { useEffect, useRef } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, FileQuestion, Printer, ScrollText } from 'lucide-react'
import { PrintPortal } from '@/components/proposals/PrintPortal'
import { ProposalDocument } from '@/components/proposals/ProposalDocument'
import { Badge, Button, EmptyState, PageHeader, Skeleton } from '@/components/ui/primitives'
import { useTable } from '@/hooks/useData'
import { proposalStatus } from '@/lib/labels'
import { buildProposalDoc } from '@/lib/proposal'
import { formatDate } from '@/lib/utils'

/** Abre a impressão só depois que as fontes do documento carregaram, senão o PDF sai com fonte errada. */
const printWhenReady = () => document.fonts.ready.then(() => window.print())

export default function ProposalView() {
  const { id } = useParams()
  const navigate = useNavigate()
  const wantsPrint = (useLocation().state as { print?: boolean } | null)?.print === true
  const printed = useRef(false)
  const proposals = useTable('proposals')
  const clients = useTable('clients')
  const profile = useTable('profiles').data?.[0]

  const proposal = proposals.data?.find((p) => p.id === id)
  const ready = !proposals.isLoading && !clients.isLoading && !!proposal

  // veio do gerador por "Salvar e gerar PDF": imprime uma vez, quando o documento estiver na tela
  useEffect(() => {
    if (!wantsPrint || !ready || printed.current) return
    // marca só quando dispara: se o efeito for refeito antes, o timer novo ainda imprime
    const timer = setTimeout(() => {
      printed.current = true
      printWhenReady()
    }, 400)
    return () => clearTimeout(timer)
  }, [wantsPrint, ready])

  if (proposals.isLoading || clients.isLoading) return <Skeleton className="mx-auto h-[70vh] w-full max-w-[794px]" />

  if (!proposal) {
    return (
      <EmptyState
        icon={FileQuestion}
        title="Proposta não encontrada"
        description="Ela pode ter sido excluída."
        action={
          <Link to="/propostas" className="text-sm font-medium text-brand-600 hover:underline dark:text-brand-400">
            Voltar para propostas
          </Link>
        }
      />
    )
  }

  const doc = buildProposalDoc(proposal, clients.data?.find((c) => c.id === proposal.client_id), profile)

  return (
    <div className="mx-auto max-w-[794px]">
      <PageHeader
        title={doc.number}
        description={proposal.title}
        actions={
          <>
            <Button variant="ghost" onClick={() => navigate('/propostas')}>
              <ArrowLeft className="h-4 w-4" /> Voltar
            </Button>
            {(proposal.status === 'approved' || proposal.status === 'signed') && (
              <Button variant="secondary" onClick={() => navigate('/ferramentas/contrato', { state: { proposalId: proposal.id } })}>
                <ScrollText className="h-4 w-4" /> Gerar contrato
              </Button>
            )}
            <Button onClick={printWhenReady}>
              <Printer className="h-4 w-4" /> Salvar em PDF / Imprimir
            </Button>
          </>
        }
      />
      <div className="no-print mb-4 flex flex-wrap items-center gap-3">
        <Badge tone={proposalStatus[proposal.status].tone}>{proposalStatus[proposal.status].label}</Badge>
        {doc.signature && (
          <span className="text-xs text-slate-600 dark:text-slate-300">
            {doc.signature.method === 'link' ? 'Assinada pelo link' : 'Cópia assinada recebida'}
            {doc.signature.name && ` por ${doc.signature.name}`} em {formatDate(doc.signature.signedAt)}
          </span>
        )}
        <span className="text-xs text-slate-500 dark:text-slate-400">
          Na janela de impressão, escolha "Salvar como PDF" como destino.
        </span>
      </div>
      <ProposalDocument doc={doc} />
      <PrintPortal>
        <ProposalDocument doc={doc} />
      </PrintPortal>
    </div>
  )
}
