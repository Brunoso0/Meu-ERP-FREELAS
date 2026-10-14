import { useParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { CheckCircle2, Download, FileQuestion, Loader2 } from 'lucide-react'
import { ContractMarkdown } from '@/components/contracts/ContractMarkdown'
import { SignForm } from '@/components/proposals/SignForm'
import { Button, Card, EmptyState } from '@/components/ui/primitives'
import { contractSignatures } from '@/lib/contract'
import { downloadContractPdf } from '@/lib/pdf'
import { getSharedContract, signSharedContract } from '@/lib/proposal-share'
import { formatDate } from '@/lib/utils'

/**
 * Página que o cliente abre pelo link de assinatura do contrato. Não exige
 * login e só conhece o contrato do link.
 */
export default function PublicContract() {
  const { token = '' } = useParams()
  const qc = useQueryClient()
  const shared = useQuery({ queryKey: ['shared-contract', token], queryFn: () => getSharedContract(token), retry: 1 })

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
          title={shared.isError ? 'Não foi possível abrir o contrato' : 'Link indisponível'}
          description={shared.isError ? 'Verifique sua conexão e recarregue a página.' : 'Este link de assinatura não existe ou não está mais ativo. Peça um novo link a quem enviou o contrato.'}
        />
      </div>
    )
  }

  const { contract, issuer } = shared.data
  const issuerName = issuer?.company_name || issuer?.full_name || 'Contrato'
  const signatures = contractSignatures(contract, issuer)
  const signed = !!contract.signed_at

  return (
    <div className="min-h-screen bg-slate-100 px-4 py-6 dark:bg-slate-950">
      <div className="mx-auto max-w-[794px] space-y-4">
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">{issuerName}</p>
            <h1 className="text-xl font-semibold tracking-tight">{contract.title}</h1>
          </div>
          <Button variant="secondary" onClick={() => downloadContractPdf(contract.title, contract.content_markdown, issuerName, signatures)}>
            <Download className="h-4 w-4" /> Baixar PDF
          </Button>
        </header>

        {signed && (
          <Card className="flex items-start gap-3 border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-900/60 dark:bg-emerald-950/40">
            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600 dark:text-emerald-400" />
            <div className="text-sm">
              <p className="font-semibold text-emerald-900 dark:text-emerald-200">Contrato assinado</p>
              <p className="text-emerald-800 dark:text-emerald-300">
                {contract.signer_name ? `Por ${contract.signer_name}, em ` : 'Em '}
                {formatDate(contract.signed_at, "dd/MM/yyyy 'às' HH:mm")}. Guarde uma cópia: use o botão de baixar o PDF acima.
              </p>
            </div>
          </Card>
        )}

        {/* folha sempre clara: é o documento */}
        <article className="bg-white px-[8%] py-[7%] text-[13px] leading-relaxed text-slate-900 shadow-sm">
          <ContractMarkdown source={contract.content_markdown} signatures={signatures} />
        </article>

        {!signed && (
          <SignForm
            title="Assinar o contrato"
            intro="Leia o contrato acima com atenção. Ao assinar, você declara que concorda com todas as cláusulas."
            agreement={`Li e concordo com todas as cláusulas do contrato "${contract.title}".`}
            submitLabel="Assinar contrato"
            onSign={async (input) => {
              await signSharedContract(token, input)
              await qc.invalidateQueries({ queryKey: ['shared-contract', token] })
            }}
          />
        )}
      </div>
    </div>
  )
}
