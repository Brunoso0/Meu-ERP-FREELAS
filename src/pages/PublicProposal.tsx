import { useParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { CheckCircle2, FileQuestion, Loader2, Printer } from 'lucide-react'
import { PrintPortal } from '@/components/proposals/PrintPortal'
import { ProposalDocument } from '@/components/proposals/ProposalDocument'
import { SignForm } from '@/components/proposals/SignForm'
import { Button, Card, EmptyState } from '@/components/ui/primitives'
import { buildProposalDoc } from '@/lib/proposal'
import { getSharedProposal, signSharedProposal } from '@/lib/proposal-share'
import { formatDate } from '@/lib/utils'
import type { Client, Profile } from '@/types/database.types'

/**
 * Página que o cliente abre pelo link de assinatura. Não exige login e só
 * conhece a proposta do link: lê o documento e, enquanto ela aguarda
 * assinatura, registra o aceite com nome, CPF/CNPJ e a assinatura desenhada.
 */
export default function PublicProposal() {
  const { token = '' } = useParams()
  const qc = useQueryClient()
  const shared = useQuery({ queryKey: ['shared-proposal', token], queryFn: () => getSharedProposal(token), retry: 1 })

  if (shared.isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
      </div>
    )
  }

  if (shared.isError || !shared.data) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <EmptyState
          icon={FileQuestion}
          title={shared.isError ? 'Não foi possível abrir a proposta' : 'Link indisponível'}
          description={shared.isError ? 'Verifique sua conexão e recarregue a página.' : 'Este link de assinatura não existe ou não está mais ativo. Peça um novo link a quem enviou a proposta.'}
        />
      </div>
    )
  }

  const { proposal, issuer, client } = shared.data
  const doc = buildProposalDoc(proposal, (client ?? undefined) as Client | undefined, (issuer ?? undefined) as Profile | undefined)
  const signed = !!proposal.signed_at

  return (
    <div className="min-h-screen bg-slate-100 px-4 py-6 dark:bg-slate-950">
      <div className="mx-auto max-w-[794px] space-y-4">
        <header className="no-print flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">{doc.issuer.name}</p>
            <h1 className="text-xl font-semibold tracking-tight">Proposta {doc.number}</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">{doc.title}</p>
          </div>
          <Button variant="secondary" onClick={() => document.fonts.ready.then(() => window.print())}>
            <Printer className="h-4 w-4" /> Salvar em PDF / Imprimir
          </Button>
        </header>

        {signed && (
          <Card className="no-print flex items-start gap-3 border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-900/60 dark:bg-emerald-950/40">
            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600 dark:text-emerald-400" />
            <div className="text-sm">
              <p className="font-semibold text-emerald-900 dark:text-emerald-200">Proposta assinada</p>
              <p className="text-emerald-800 dark:text-emerald-300">
                {proposal.signer_name ? `Por ${proposal.signer_name}, em ` : 'Em '}
                {formatDate(proposal.signed_at, "dd/MM/yyyy 'às' HH:mm")}. Guarde uma cópia: use o botão de salvar em PDF acima.
              </p>
            </div>
          </Card>
        )}

        <ProposalDocument doc={doc} />
        <PrintPortal>
          <ProposalDocument doc={doc} />
        </PrintPortal>

        {!signed && (
          <SignForm
            title="Assinar a proposta"
            intro="Leia a proposta acima. Ao assinar, você declara que concorda com o escopo, os prazos e os valores descritos."
            agreement={`Li e concordo com a proposta ${doc.number}, emitida por ${doc.issuer.name}.`}
            submitLabel="Assinar proposta"
            onSign={async (input) => {
              await signSharedProposal(token, input)
              await qc.invalidateQueries({ queryKey: ['shared-proposal', token] })
            }}
          />
        )}
      </div>
    </div>
  )
}
