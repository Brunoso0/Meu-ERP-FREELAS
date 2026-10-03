import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Download, FileQuestion, Printer, ScrollText } from 'lucide-react'
import { ProposalDocument } from '@/components/proposals/ProposalDocument'
import { Badge, Button, EmptyState, PageHeader, Skeleton } from '@/components/ui/primitives'
import { useTable } from '@/hooks/useData'
import { proposalStatus } from '@/lib/labels'
import { downloadProposalPdf } from '@/lib/pdf'
import { buildProposalDoc } from '@/lib/proposal'

export default function ProposalView() {
  const { id } = useParams()
  const navigate = useNavigate()
  const proposals = useTable('proposals')
  const clients = useTable('clients')
  const profile = useTable('profiles').data?.[0]

  if (proposals.isLoading || clients.isLoading) return <Skeleton className="mx-auto h-[70vh] w-full max-w-3xl" />

  const proposal = proposals.data?.find((p) => p.id === id)
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
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title={doc.number}
        description={proposal.title}
        actions={
          <>
            <Button variant="ghost" onClick={() => navigate('/propostas')}>
              <ArrowLeft className="h-4 w-4" /> Voltar
            </Button>
            {proposal.status === 'approved' && (
              <Button variant="secondary" onClick={() => navigate('/ferramentas/contrato', { state: { proposalId: proposal.id } })}>
                <ScrollText className="h-4 w-4" /> Gerar contrato
              </Button>
            )}
            <Button variant="secondary" onClick={() => window.print()}>
              <Printer className="h-4 w-4" /> Imprimir
            </Button>
            <Button onClick={() => downloadProposalPdf(doc)}>
              <Download className="h-4 w-4" /> Baixar PDF
            </Button>
          </>
        }
      />
      <div className="no-print mb-4">
        <Badge tone={proposalStatus[proposal.status].tone}>{proposalStatus[proposal.status].label}</Badge>
      </div>
      <ProposalDocument doc={doc} />
    </div>
  )
}
